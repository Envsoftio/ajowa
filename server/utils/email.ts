import { promises as fs } from 'node:fs'
import path from 'node:path'
import Handlebars from 'handlebars'
import nodemailer from 'nodemailer'
import { getEmailIntegrationStatus, getValidatedRuntimeConfig } from './env'

type AuthTemplateName = 'verify-email' | 'reset-password' | 'invite-onboarding'
type NotificationTemplateName =
  | 'bill-ready'
  | 'due-created'
  | 'due-reminder'
  | 'due-overdue'
  | 'payment-received'
  | 'receipt-ready'
  | 'qr-generated'
  | 'qr-revoked'
  | 'ticket-update'
  | 'notice'
  | 'emergency-alert'

type EmailTemplateContext = {
  title: string
  name: string
  actionUrl: string
  expiresLabel: string
  inviterName?: string
  roleLabel?: string
  details?: string
}

type NotificationEmailContext = {
  title: string
  body: string
  actionUrl?: string | undefined
  actionLabel?: string | undefined
  [key: string]: unknown
}

const templateCache = new Map<string, Handlebars.TemplateDelegate>()
let partialsRegistered = false

const templateRoot = path.resolve(process.cwd(), 'server/email-templates')

const registerPartials = async () => {
  if (partialsRegistered) {
    return
  }

  const [footer, header] = await Promise.all([
    fs.readFile(path.join(templateRoot, 'partials/footer.hbs'), 'utf8'),
    fs.readFile(path.join(templateRoot, 'partials/header.hbs'), 'utf8'),
  ])

  Handlebars.registerPartial('footer', footer)
  Handlebars.registerPartial('header', header)
  partialsRegistered = true
}

const getCompiledTemplate = async (name: string) => {
  const cached = templateCache.get(name)

  if (cached) {
    return cached
  }

  const source = await fs.readFile(path.join(templateRoot, `${name}.hbs`), 'utf8')
  const template = Handlebars.compile(source)
  templateCache.set(name, template)
  return template
}

const renderIntoBaseLayout = async (contentHtml: string) => {
  const baseSource = await fs.readFile(path.join(templateRoot, 'layouts/base.hbs'), 'utf8')
  const compiled = Handlebars.compile(baseSource)

  Handlebars.registerPartial('content', contentHtml)
  return compiled({})
}

const tryReadTemplate = async (relativePath: string) => {
  try {
    return await fs.readFile(path.join(templateRoot, relativePath), 'utf8')
  } catch {
    return null
  }
}

const getTransporter = () => {
  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())

  return nodemailer.createTransport({
    host: runtimeConfig.smtp.host,
    port: runtimeConfig.smtp.port,
    secure: runtimeConfig.smtp.port === 465,
    auth: {
      user: runtimeConfig.smtp.user,
      pass: runtimeConfig.smtp.pass,
    },
  })
}

export const buildAppUrl = (pathname: string, params?: Record<string, string>) => {
  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())
  const url = new URL(pathname, runtimeConfig.appUrl)

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value)
  }

  if (url.origin !== new URL(runtimeConfig.appUrl).origin) {
    throw new Error('Invalid application URL origin for auth email.')
  }

  return url.toString()
}

export const renderAuthEmailTemplate = async (
  name: AuthTemplateName,
  context: EmailTemplateContext,
) => {
  await registerPartials()
  const template = await getCompiledTemplate(name)
  const content = template(context)
  return renderIntoBaseLayout(content)
}

export const renderNotificationEmailTemplate = async (
  name: NotificationTemplateName,
  context: NotificationEmailContext,
) => {
  await registerPartials()

  const htmlSource =
    (await tryReadTemplate(`notifications/${name}.html.hbs`)) ??
    '<h1>{{title}}</h1><p>{{body}}</p>{{#if actionUrl}}<p><a href="{{actionUrl}}">{{actionLabel}}</a></p>{{/if}}'
  const textSource =
    (await tryReadTemplate(`notifications/${name}.txt.hbs`)) ??
    '{{title}}\n\n{{body}}\n{{#if actionUrl}}\n{{actionLabel}}: {{actionUrl}}\n{{/if}}'

  const htmlContent = Handlebars.compile(htmlSource)(context)
  const text = Handlebars.compile(textSource)(context)
  const html = await renderIntoBaseLayout(htmlContent)

  return { html, text }
}

export const sendEmail = async ({
  to,
  subject,
  html,
  text,
  attachments,
}: {
  to: string
  subject: string
  html: string
  text?: string
  attachments?: Array<{
    filename: string
    content?: string | Buffer
    path?: string
    contentType?: string
  }>
}) => {
  const status = getEmailIntegrationStatus()

  if (!status.enabled) {
    return { delivered: false, reason: status.reason }
  }

  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())
  const transporter = getTransporter()
  const response = await transporter.sendMail({
    from: `"${runtimeConfig.emailFromName}" <${runtimeConfig.emailFrom}>`,
    to,
    subject,
    html,
    ...(text ? { text } : {}),
    ...(attachments?.length ? { attachments } : {}),
  })

  return {
    delivered: true,
    providerMessageId: response.messageId,
    response,
  }
}

export const sendNotificationEmail = async ({
  to,
  subject,
  template,
  context,
  attachments,
}: {
  to: string
  subject: string
  template: NotificationTemplateName
  context: NotificationEmailContext
  attachments?: Array<{
    filename: string
    content?: string | Buffer
    path?: string
    contentType?: string
  }>
}) => {
  const rendered = await renderNotificationEmailTemplate(template, context)

  return sendEmail({
    to,
    subject,
    html: rendered.html,
    text: rendered.text,
    ...(attachments ? { attachments } : {}),
  })
}

export const sendTemplatedEmail = async ({
  to,
  subject,
  template,
  context,
}: {
  to: string
  subject: string
  template: AuthTemplateName
  context: EmailTemplateContext
}) => {
  const status = getEmailIntegrationStatus()

  if (!status.enabled) {
    return { delivered: false, reason: status.reason }
  }

  const html = await renderAuthEmailTemplate(template, context)
  const sent = await sendEmail({
    to,
    subject,
    html,
  })

  return sent.delivered ? { delivered: true } : sent
}
