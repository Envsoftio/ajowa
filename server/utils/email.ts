import { promises as fs } from 'node:fs'
import path from 'node:path'
import Handlebars from 'handlebars'
import nodemailer from 'nodemailer'
import { getEmailIntegrationStatus, getValidatedRuntimeConfig } from './env'

type AuthTemplateName = 'verify-email' | 'reset-password' | 'invite-onboarding'

type EmailTemplateContext = {
  title: string
  name: string
  actionUrl: string
  expiresLabel: string
  inviterName?: string
  roleLabel?: string
  details?: string
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

  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())
  const html = await renderAuthEmailTemplate(template, context)
  const transporter = getTransporter()

  await transporter.sendMail({
    from: `"${runtimeConfig.emailFromName}" <${runtimeConfig.emailFrom}>`,
    to,
    subject,
    html,
  })

  return { delivered: true }
}
