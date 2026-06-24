import { promises as fs } from 'node:fs'
import path from 'node:path'
import Handlebars from 'handlebars'
import nodemailer from 'nodemailer'
import type { PoolClient } from 'pg'
import { getDatabasePool } from './database'
import { getValidatedRuntimeConfig } from './env'

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

type SocietyEmailSettingsRow = {
  enabled: boolean
  smtp_host: string
  smtp_port: number
  smtp_user: string
  from_email: string
  from_name: string
}

export type ResolvedEmailSettings = {
  enabled: boolean
  smtpHost: string
  smtpPort: number
  smtpUser: string
  fromEmail: string
  fromName: string
  smtpPasswordConfigured: boolean
  source: 'SOCIETY' | 'UNCONFIGURED'
}

type EmailDeliverySettings = ResolvedEmailSettings & {
  smtpPass: string
}

const templateCache = new Map<string, Handlebars.TemplateDelegate>()
let partialsRegistered = false

const templateRoot = path.resolve(process.cwd(), 'server/email-templates')

const readTemplateFile = async (relativePath: string) => {
  const bundledTemplate = await useStorage('assets:emailTemplates').getItem<string>(relativePath)

  if (typeof bundledTemplate === 'string') {
    return bundledTemplate
  }

  return fs.readFile(path.join(templateRoot, relativePath), 'utf8')
}

const registerPartials = async () => {
  if (partialsRegistered) {
    return
  }

  const [footer, header] = await Promise.all([
    readTemplateFile('partials/footer.hbs'),
    readTemplateFile('partials/header.hbs'),
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

  const source = await readTemplateFile(`${name}.hbs`)
  const template = Handlebars.compile(source)
  templateCache.set(name, template)
  return template
}

const renderIntoBaseLayout = async (contentHtml: string) => {
  const baseSource = await readTemplateFile('layouts/base.hbs')
  const compiled = Handlebars.compile(baseSource)

  Handlebars.registerPartial('content', contentHtml)
  return compiled({})
}

const tryReadTemplate = async (relativePath: string) => {
  try {
    return await readTemplateFile(relativePath)
  } catch {
    return null
  }
}

const isZeptoMailHost = (value: string) => value.toLowerCase().includes('zeptomail')
const SMTP_SSL_PORT = 465
const SMTP_STARTTLS_PORT = 587
const ZEPTOMAIL_SUPPORTED_SMTP_PORTS = new Set([SMTP_SSL_PORT, SMTP_STARTTLS_PORT])

const getTransporter = (settings: EmailDeliverySettings) =>
  nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpPort === SMTP_SSL_PORT,
    requireTLS: settings.smtpPort === SMTP_STARTTLS_PORT,
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPass,
    },
    tls: {
      minVersion: 'TLSv1.2',
    },
  })

const isValidEmailAddress = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const getRuntimeEmailSettings = (): EmailDeliverySettings => {
  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())

  return {
    enabled: false,
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: runtimeConfig.smtp.pass,
    fromEmail: '',
    fromName: '',
    smtpPasswordConfigured: runtimeConfig.smtp.pass.trim().length > 0,
    source: 'UNCONFIGURED',
  }
}

const getUnconfiguredSocietyEmailSettings = (
  runtimeSettings: EmailDeliverySettings,
): ResolvedEmailSettings => ({
  enabled: false,
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  fromEmail: '',
  fromName: '',
  smtpPasswordConfigured: runtimeSettings.smtpPasswordConfigured,
  source: 'UNCONFIGURED',
})

export const getResolvedEmailSettings = async (
  societyId?: string | null,
  client?: PoolClient | null,
): Promise<ResolvedEmailSettings> => {
  const runtimeSettings = getRuntimeEmailSettings()

  if (!societyId) {
    const { smtpPass: _smtpPass, ...publicSettings } = runtimeSettings
    return publicSettings
  }

  const queryable = client ?? getDatabasePool()
  const result = await queryable.query<SocietyEmailSettingsRow>(
    `
      select
        enabled,
        smtp_host,
        smtp_port,
        smtp_user,
        from_email::text,
        from_name
      from society_email_settings
      where society_id = $1
      limit 1
    `,
    [societyId],
  )
  const row = result.rows[0]

  if (!row) {
    return getUnconfiguredSocietyEmailSettings(runtimeSettings)
  }

  return {
    enabled: row.enabled,
    smtpHost: row.smtp_host,
    smtpPort: Number(row.smtp_port),
    smtpUser: row.smtp_user,
    fromEmail: row.from_email,
    fromName: row.from_name,
    smtpPasswordConfigured: runtimeSettings.smtpPasswordConfigured,
    source: 'SOCIETY',
  }
}

const getEmailDeliverySettings = async (
  societyId?: string | null,
  client?: PoolClient | null,
): Promise<EmailDeliverySettings> => {
  const runtimeSettings = getRuntimeEmailSettings()
  const publicSettings = await getResolvedEmailSettings(societyId, client)

  return {
    ...publicSettings,
    smtpPass: runtimeSettings.smtpPass,
    smtpPasswordConfigured: runtimeSettings.smtpPasswordConfigured,
  }
}

export const getResolvedEmailIntegrationStatus = async (
  societyId?: string | null,
  client?: PoolClient | null,
) => {
  const settings = await getResolvedEmailSettings(societyId, client)

  if (!settings.enabled) {
    return {
      enabled: false,
      reason: 'Email notifications are disabled. Enable email notifications in admin settings to send email.',
    }
  }

  const missing: string[] = []
  if (!settings.smtpHost.trim()) missing.push('SMTP host')
  if (!settings.smtpUser.trim()) missing.push('SMTP user')
  if (!settings.smtpPasswordConfigured) missing.push('SMTP_PASS in environment')
  if (!settings.fromEmail.trim()) missing.push('from email')
  if (!settings.fromName.trim()) missing.push('from name')

  if (missing.length > 0) {
    return {
      enabled: false,
      reason: `Email notifications are misconfigured. Configure ${missing.join(', ')}.`,
    }
  }

  if (!isValidEmailAddress(settings.fromEmail)) {
    return {
      enabled: false,
      reason: 'Email notifications are misconfigured. From email must be a valid email address.',
    }
  }

  if (settings.fromEmail.toLowerCase().endsWith('@example.com')) {
    return {
      enabled: false,
      reason: 'Email notifications are misconfigured. From email must be a verified sender address.',
    }
  }

  if (isZeptoMailHost(settings.smtpHost) && !ZEPTOMAIL_SUPPORTED_SMTP_PORTS.has(settings.smtpPort)) {
    return {
      enabled: false,
      reason: 'ZeptoMail SMTP supports only port 465 with SSL or port 587 with TLS. Port 25 is not supported.',
    }
  }

  if (isZeptoMailHost(settings.smtpHost) && settings.smtpUser.trim() !== 'emailapikey') {
    return {
      enabled: false,
      reason: 'ZeptoMail SMTP requires SMTP user "emailapikey". Save "emailapikey" as the SMTP user in notification settings and keep the API key in SMTP_PASS.',
    }
  }

  return { enabled: true, reason: null }
}

const getRuntimeAppUrl = () => {
  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())
  return new URL(runtimeConfig.appUrl)
}

export const buildAppUrl = (pathname: string, params?: Record<string, string>) => {
  const appUrl = getRuntimeAppUrl()
  const url = new URL(pathname, appUrl)

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value)
  }

  if (url.origin !== appUrl.origin) {
    throw new Error('Invalid application URL origin for auth email.')
  }

  return url.toString()
}

export const normalizeAppActionUrl = (actionUrl: string) => {
  const appUrl = getRuntimeAppUrl()
  const sourceUrl = new URL(actionUrl, appUrl)

  return new URL(`${sourceUrl.pathname}${sourceUrl.search}${sourceUrl.hash}`, appUrl).toString()
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
  societyId,
  client,
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
  societyId?: string | null
  client?: PoolClient | null
}) => {
  const status = await getResolvedEmailIntegrationStatus(societyId, client)

  if (!status.enabled) {
    return { delivered: false, reason: status.reason }
  }

  const settings = await getEmailDeliverySettings(societyId, client)
  const transporter = getTransporter(settings)
  const response = await transporter.sendMail({
    from: {
      name: settings.fromName,
      address: settings.fromEmail,
    },
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
  societyId,
  client,
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
  societyId?: string | null
  client?: PoolClient | null
}) => {
  const rendered = await renderNotificationEmailTemplate(template, context)

  return sendEmail({
    to,
    subject,
    html: rendered.html,
    text: rendered.text,
    ...(attachments ? { attachments } : {}),
    ...(societyId ? { societyId } : {}),
    ...(client ? { client } : {}),
  })
}

export const sendTemplatedEmail = async ({
  to,
  subject,
  template,
  context,
  societyId,
  client,
}: {
  to: string
  subject: string
  template: AuthTemplateName
  context: EmailTemplateContext
  societyId?: string | null
  client?: PoolClient | null
}) => {
  const status = await getResolvedEmailIntegrationStatus(societyId, client)

  if (!status.enabled) {
    return { delivered: false, reason: status.reason }
  }

  const html = await renderAuthEmailTemplate(template, context)
  const sent = await sendEmail({
    to,
    subject,
    html,
    ...(societyId ? { societyId } : {}),
    ...(client ? { client } : {}),
  })

  return sent.delivered ? { delivered: true } : sent
}
