import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import webpush from 'web-push'
import { generateMaintenanceBillPdf } from './billing'
import { buildAppUrl, getResolvedEmailSettings, sendEmail, sendNotificationEmail } from './email'
import { getPushIntegrationStatus, getValidatedRuntimeConfig, getWhatsAppIntegrationStatus } from './env'

export type NotificationChannel = 'PUSH' | 'EMAIL' | 'WHATSAPP' | 'IN_APP'
export type NotificationPreset =
  | 'PUSH'
  | 'EMAIL'
  | 'WHATSAPP'
  | 'IN_APP'
  | 'PUSH_AND_EMAIL'
  | 'PUSH_AND_WHATSAPP'
  | 'EMAIL_AND_WHATSAPP'
  | 'PUSH_EMAIL_WHATSAPP'
  | 'ALL_CHANNELS'
export type NotificationCategory =
  | 'BILLING'
  | 'PAYMENTS'
  | 'ACCESS_QR'
  | 'SERVICE_REQUESTS'
  | 'NOTICES_ANNOUNCEMENTS'
  | 'ACCOUNT_ONBOARDING'
  | 'EMERGENCY_ALERTS'
export type NotificationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY'

export type NotificationUser = {
  id: string
  email: string | null
  mobileNumber: string | null
  whatsappNumber: string | null
  preferredNotificationChannels: NotificationPreset
  pushEnabled: boolean
  emailEnabled: boolean
  whatsappEnabled: boolean
  inAppEnabled: boolean
  isActive?: boolean
}

export type NotificationPayload = {
  societyId: string
  eventKey: string
  category: NotificationCategory
  sourceTable?: string
  sourceId?: string
  priority?: NotificationPriority
  title: string
  body: string
  payload?: Record<string, unknown>
  idempotencyKey: string
  idempotencyWindowSeconds?: number
  triggeredByUserId?: string
  users: NotificationUser[]
  channels?: NotificationChannel[]
  audienceLabel?: string
  audienceSnapshot?: Record<string, unknown>
  templateSnapshot?: Record<string, unknown>
  scheduledFor?: string | null
}

export type NotificationAudienceFilter = {
  scope:
    | 'ALL_ACTIVE_RESIDENTS'
    | 'ACTIVE_PUSH_SUBSCRIBERS'
    | 'BLOCKS'
    | 'FLATS'
    | 'USERS'
    | 'OWNERS'
    | 'OWNER_OF_FLAT'
    | 'TENANTS'
    | 'DEFAULTERS'
    | 'BILLING_CONTACTS'
  userIds?: string[] | undefined
  blockIds?: string[] | undefined
  flatIds?: string[] | undefined
}

type DueNotificationRow = {
  due_id: string
  society_id: string
  billing_period_id: string
  billing_period_label: string
  flat_id: string
  flat_number: string
  block_name: string
  balance_amount: string
  user_id: string
  email: string | null
  mobile_number: string | null
  whatsapp_number: string | null
  preferred_notification_channels: NotificationPreset
  notification_push_enabled: boolean
  notification_email_enabled: boolean
  notification_whatsapp_enabled: boolean
  notification_in_app_enabled: boolean
}

type AudienceUserRow = {
  id: string
  email: string | null
  mobile_number: string | null
  whatsapp_number: string | null
  preferred_notification_channels: NotificationPreset
  notification_push_enabled: boolean
  notification_email_enabled: boolean
  notification_whatsapp_enabled: boolean
  notification_in_app_enabled: boolean
}

type NotificationEventSettingRow = {
  push_enabled: boolean
  email_enabled: boolean
  whatsapp_enabled: boolean
  in_app_enabled: boolean
  retry_max_attempts: number
  is_paused: boolean
}

type UserNotificationPreferenceRow = {
  user_id: string
  push_enabled: boolean
  email_enabled: boolean
  whatsapp_enabled: boolean
  in_app_enabled: boolean
  is_paused: boolean
  allow_critical_bypass: boolean
}

type ClaimedJobRow = {
  id: string
  society_id: string
  notification_event_id: string
  audience_id: string | null
  target_user_id: string | null
  channel: NotificationChannel
  attempt_count: number
  max_attempts: number
  provider_message_id: string | null
  resolved_address: string | null
  payload: Record<string, unknown>
  event_key: string
  category: NotificationCategory
  title: string | null
  body: string | null
  priority: NotificationPriority
}

type ProviderSendResult = {
  ok: boolean
  providerName: string
  providerMessageId?: string | null | undefined
  responseBody?: Record<string, unknown> | undefined
  failureReason?: string | undefined
  permanentFailure?: boolean | undefined
}

const presetChannels: Record<NotificationPreset, NotificationChannel[]> = {
  PUSH: ['PUSH'],
  EMAIL: ['EMAIL'],
  WHATSAPP: ['WHATSAPP'],
  IN_APP: ['IN_APP'],
  PUSH_AND_EMAIL: ['PUSH', 'EMAIL'],
  PUSH_AND_WHATSAPP: ['PUSH', 'WHATSAPP'],
  EMAIL_AND_WHATSAPP: ['EMAIL', 'WHATSAPP'],
  PUSH_EMAIL_WHATSAPP: ['PUSH', 'EMAIL', 'WHATSAPP'],
  ALL_CHANNELS: ['PUSH', 'EMAIL', 'WHATSAPP', 'IN_APP'],
}

const emailTemplateByEventKey = new Map<string, Parameters<typeof sendNotificationEmail>[0]['template']>([
  ['maintenance_due.created', 'due-created'],
  ['maintenance_due.bill', 'bill-ready'],
  ['maintenance_due.reminder', 'due-reminder'],
  ['maintenance_due.overdue', 'due-overdue'],
  ['payment.received', 'payment-received'],
  ['receipt.ready', 'receipt-ready'],
  ['access_qr.generated', 'qr-generated'],
  ['access_qr.revoked', 'qr-revoked'],
  ['service_request.updated', 'ticket-update'],
  ['notice.published', 'notice'],
  ['emergency.alert', 'emergency-alert'],
])

const priorityRank: Record<NotificationPriority, number> = {
  EMERGENCY: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

const defaultMaxAttempts = 3
const notificationChannels: NotificationChannel[] = ['PUSH', 'EMAIL', 'WHATSAPP', 'IN_APP']

const importedOwnerEmailExpression = (relationshipAlias: string) => `
  case
    when ${relationshipAlias}.import_metadata->>'relationshipSource' = 'OWNER'
      and upper(coalesce(btrim(${relationshipAlias}.import_metadata #>> '{sourceData,EMAIL ID}'), '')) not in ('', 'NA', 'N/A', 'NIL', '-', '--')
    then btrim(${relationshipAlias}.import_metadata #>> '{sourceData,EMAIL ID}')
    else null
  end
`

const importedOwnerEmailJoin = `
  left join lateral (
    select ${importedOwnerEmailExpression('email_fr')} as email
    from flat_residents email_fr
    where email_fr.user_id = u.id
      and email_fr.is_active = true
      and ${importedOwnerEmailExpression('email_fr')} is not null
    order by email_fr.is_billing_contact desc, email_fr.is_primary_contact desc, email_fr.created_at
    limit 1
  ) imported_email on true
`

const mapUserRow = (row: AudienceUserRow): NotificationUser => ({
  id: row.id,
  email: row.email,
  mobileNumber: row.mobile_number,
  whatsappNumber: row.whatsapp_number,
  preferredNotificationChannels: row.preferred_notification_channels,
  pushEnabled: row.notification_push_enabled,
  emailEnabled: row.notification_email_enabled,
  whatsappEnabled: row.notification_whatsapp_enabled,
  inAppEnabled: row.notification_in_app_enabled,
  isActive: true,
})

export const normalizeWhatsAppNumber = (value: string | null | undefined) => {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  const digits = trimmed.replace(/[^\d+]/g, '')

  if (digits.startsWith('+') && /^\+\d{8,15}$/.test(digits)) {
    return digits
  }

  const numeric = digits.replace(/\D/g, '')
  if (numeric.length === 10) {
    return `+91${numeric}`
  }
  if (numeric.length >= 8 && numeric.length <= 15) {
    return `+${numeric}`
  }

  return null
}

const getProviderErrorMeta = (error: unknown) => {
  const value = error as {
    code?: unknown
    command?: unknown
    response?: unknown
    responseCode?: unknown
    message?: unknown
  }

  return {
    code: typeof value.code === 'string' ? value.code : null,
    command: typeof value.command === 'string' ? value.command : null,
    message: error instanceof Error ? error.message : typeof value.message === 'string' ? value.message : null,
    response: typeof value.response === 'string' ? value.response : null,
    responseCode: typeof value.responseCode === 'number' ? value.responseCode : null,
  }
}

type ProviderErrorContext = {
  emailSettings?: {
    source: 'SOCIETY' | 'UNCONFIGURED'
    smtpHost: string
    smtpPort: number
    fromEmail: string
    smtpUser: string
  } | null
}

const savedEmailSettingsLabel = 'notification email settings'

const emailProviderDiagnostic = (settings?: ProviderErrorContext['emailSettings']) => {
  if (!settings) {
    return ''
  }

  const parts = [
    settings.smtpHost.trim() ? `${settings.smtpHost.trim()}:${settings.smtpPort}` : null,
    settings.smtpUser.trim() ? `SMTP user ${settings.smtpUser.trim()}` : null,
  ].filter(Boolean)

  return parts.length ? ` The request used ${parts.join(' with ')}.` : ''
}

const describeProviderError = (error: unknown, context: ProviderErrorContext = {}) => {
  const meta = getProviderErrorMeta(error)
  const message = meta.message ?? meta.response ?? 'Provider request failed.'
  const normalized = `${message} ${meta.response ?? ''}`.toLowerCase()

  if (normalized.includes('timeout exceeded when trying to connect')) {
    return 'Database connection pool timed out while reading notification email settings. Reuse the active database client for email settings lookups or increase DB_POOL_MAX.'
  }

  if (meta.responseCode === 553 || normalized.includes('sender is not allowed to relay')) {
    const settings = context.emailSettings
    const fromEmail = settings?.fromEmail.trim()

    return `SMTP rejected the saved From email${fromEmail ? ` (${fromEmail})` : ''}. Approve this sender/domain for the SMTP account, or change the From email in /admin/settings/notifications to an approved address.${emailProviderDiagnostic(settings)}`
  }

  if (meta.responseCode === 535 || normalized.includes('authentication failed') || normalized.includes('invalid login')) {
    const smtpUser = context.emailSettings?.smtpUser.trim()

    return `SMTP authentication failed. Check the SMTP user${smtpUser ? ` (${smtpUser})` : ''} in ${savedEmailSettingsLabel} and SMTP_PASS in the environment.${emailProviderDiagnostic(context.emailSettings)}`
  }

  if (
    ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(meta.code ?? '') ||
    normalized.includes('connection timeout') ||
    normalized.includes('greeting never received')
  ) {
    return `SMTP server could not be reached. Check the SMTP host and port in ${savedEmailSettingsLabel}, TLS mode, and network access from this runtime.${emailProviderDiagnostic(context.emailSettings)}`
  }

  return message
}

const getEmailProviderErrorContext = async (
  societyId: string,
  client?: PoolClient | null,
): Promise<ProviderErrorContext> => {
  try {
    const settings = await getResolvedEmailSettings(societyId, client)

    return {
      emailSettings: {
        source: settings.source,
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort,
        fromEmail: settings.fromEmail,
        smtpUser: settings.smtpUser,
      },
    }
  } catch {
    return {}
  }
}

const isPermanentProviderError = (error: unknown) => {
  const meta = getProviderErrorMeta(error)

  if (meta.responseCode && meta.responseCode >= 400 && meta.responseCode < 500) {
    return true
  }

  return meta.code === 'EENVELOPE'
}

const providerErrorResponseBody = (error: unknown) => {
  const meta = getProviderErrorMeta(error)

  return {
    ...(meta.code ? { code: meta.code } : {}),
    ...(meta.command ? { command: meta.command } : {}),
    ...(meta.responseCode ? { responseCode: meta.responseCode } : {}),
    ...(meta.response ? { response: meta.response } : {}),
  }
}

const enabledForChannel = (user: NotificationUser, channel: NotificationChannel) => {
  if (user.isActive === false) return false
  if (channel === 'PUSH') return user.pushEnabled
  if (channel === 'EMAIL') return user.emailEnabled && Boolean(user.email)
  if (channel === 'WHATSAPP') return user.whatsappEnabled && Boolean(user.whatsappNumber ?? user.mobileNumber)
  return user.inAppEnabled
}

const channelAddress = (user: NotificationUser, channel: NotificationChannel) => {
  if (channel === 'EMAIL') return user.email
  if (channel === 'WHATSAPP') return normalizeWhatsAppNumber(user.whatsappNumber ?? user.mobileNumber)
  return null
}

const enabledChannelsForSetting = (setting: NotificationEventSettingRow | null) => {
  if (!setting || setting.is_paused) {
    return setting ? [] : notificationChannels
  }

  return notificationChannels.filter((channel) => {
    if (channel === 'PUSH') return setting.push_enabled
    if (channel === 'EMAIL') return setting.email_enabled
    if (channel === 'WHATSAPP') return setting.whatsapp_enabled
    return setting.in_app_enabled
  })
}

const getRequestedChannels = (
  explicitChannels: NotificationChannel[] | undefined,
  setting: NotificationEventSettingRow | null,
) => {
  const settingChannels = new Set(enabledChannelsForSetting(setting))
  const requested = explicitChannels?.length ? explicitChannels : notificationChannels

  return requested
    .filter((channel) => settingChannels.has(channel))
    .filter((channel, index, channels) => channels.indexOf(channel) === index)
}

const getUserChannels = (
  user: NotificationUser,
  explicitChannels?: NotificationChannel[],
  setting: NotificationEventSettingRow | null = null,
) => {
  const allowed = explicitChannels?.length ? explicitChannels : presetChannels[user.preferredNotificationChannels]
  const settingChannels = new Set(enabledChannelsForSetting(setting))

  return allowed
    .filter((channel) => settingChannels.has(channel))
    .filter((channel) => enabledForChannel(user, channel))
    .filter((channel, index, channels) => channels.indexOf(channel) === index)
}

const createDedupeKey = (input: NotificationPayload, userId: string, channel: NotificationChannel) => {
  const windowSeconds = input.idempotencyWindowSeconds ?? 86400
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000))
  return `${input.idempotencyKey}:${bucket}:${userId}:${channel}`
}

const getBackoffMinutes = (attemptCount: number) => Math.min(60, 2 ** Math.max(0, attemptCount - 1))

const getNotificationEventSetting = async (
  client: PoolClient,
  input: Pick<NotificationPayload, 'societyId' | 'eventKey'>,
) => {
  const result = await client.query<NotificationEventSettingRow>(
    `
      select
        push_enabled,
        email_enabled,
        whatsapp_enabled,
        in_app_enabled,
        retry_max_attempts,
        channel_pause_until is not null and channel_pause_until > now() as is_paused
      from notification_event_settings
      where society_id = $1 and event_key = $2
      limit 1
    `,
    [input.societyId, input.eventKey],
  )

  return result.rows[0] ?? null
}

const applyUserNotificationPreferences = async (
  client: PoolClient,
  input: Pick<NotificationPayload, 'societyId' | 'category' | 'priority'>,
  users: NotificationUser[],
) => {
  if (users.length === 0) {
    return users
  }

  const result = await client.query<UserNotificationPreferenceRow>(
    `
      select
        user_id,
        push_enabled,
        email_enabled,
        whatsapp_enabled,
        in_app_enabled,
        channel_paused_until is not null and channel_paused_until > now() as is_paused,
        allow_critical_bypass
      from user_notification_preferences
      where society_id = $1
        and event_category = $2
        and user_id = any($3::uuid[])
    `,
    [input.societyId, input.category, users.map((user) => user.id)],
  )
  const preferences = new Map(result.rows.map((row) => [row.user_id, row]))

  return users.map((user) => {
    const preference = preferences.get(user.id)
    if (!preference) {
      return user
    }

    const isPaused =
      preference.is_paused &&
      !(input.priority === 'EMERGENCY' && preference.allow_critical_bypass)

    if (isPaused) {
      return {
        ...user,
        pushEnabled: false,
        emailEnabled: false,
        whatsappEnabled: false,
        inAppEnabled: false,
      }
    }

    return {
      ...user,
      pushEnabled: user.pushEnabled && preference.push_enabled,
      emailEnabled: user.emailEnabled && preference.email_enabled,
      whatsappEnabled: user.whatsappEnabled && preference.whatsapp_enabled,
      inAppEnabled: user.inAppEnabled && preference.in_app_enabled,
    }
  })
}

const getEmailAttachmentsForJob = async (job: ClaimedJobRow) => {
  if (job.event_key !== 'maintenance_due.bill') {
    return undefined
  }

  const dueId = typeof job.payload.dueId === 'string' ? job.payload.dueId : null
  if (!dueId) {
    return undefined
  }

  const bill = await generateMaintenanceBillPdf(dueId)

  return [
    {
      filename: bill.fileName,
      content: bill.buffer,
      contentType: 'application/pdf',
    },
  ]
}

export const resolveNotificationAudience = async (
  client: PoolClient,
  societyId: string,
  filter: NotificationAudienceFilter,
) => {
  const params: unknown[] = [societyId]
  const where: string[] = ['u.society_id = $1', 'u.is_active = true', "u.role = 'RESIDENT'"]
  let joins = ''

  if (filter.scope === 'ACTIVE_PUSH_SUBSCRIBERS') {
    joins += " inner join push_subscriptions ps on ps.user_id = u.id and ps.status = 'ACTIVE'"
  }

  if (['BLOCKS', 'FLATS', 'OWNERS', 'OWNER_OF_FLAT', 'TENANTS', 'DEFAULTERS', 'BILLING_CONTACTS'].includes(filter.scope)) {
    joins += ' inner join flat_residents fr on fr.user_id = u.id and fr.is_active = true'
    joins += ' inner join flats f on f.id = fr.flat_id and f.is_active = true'
  }

  if (filter.scope === 'DEFAULTERS') {
    joins += ' inner join maintenance_dues md on md.flat_id = f.id and md.balance_amount > 0'
  }

  if (filter.scope === 'BLOCKS') {
    params.push(filter.blockIds ?? [])
    where.push(`f.block_id = any($${params.length}::uuid[])`)
  }
  if (filter.scope === 'FLATS') {
    params.push(filter.flatIds ?? [])
    where.push(`f.id = any($${params.length}::uuid[])`)
  }
  if (filter.scope === 'OWNER_OF_FLAT') {
    params.push(filter.flatIds ?? [])
    where.push(`f.id = any($${params.length}::uuid[])`)
    where.push("fr.relationship_type = 'OWNER'")
  }
  if (filter.scope === 'USERS') {
    params.push(filter.userIds ?? [])
    where.push(`u.id = any($${params.length}::uuid[])`)
  }
  if (filter.scope === 'OWNERS') {
    where.push("fr.relationship_type = 'OWNER'")
  }
  if (filter.scope === 'TENANTS') {
    where.push("fr.relationship_type = 'TENANT'")
  }
  if (filter.scope === 'BILLING_CONTACTS') {
    where.push('fr.is_billing_contact = true')
  }

  const result = await client.query<AudienceUserRow>(
    `
      select distinct
        u.id,
        coalesce(nullif(btrim(u.email::text), ''), imported_email.email) as email,
        u.mobile_number,
        u.whatsapp_number,
        u.preferred_notification_channels::text,
        u.notification_push_enabled,
        u.notification_email_enabled,
        u.notification_whatsapp_enabled,
        u.notification_in_app_enabled
      from users u
      ${joins}
      ${importedOwnerEmailJoin}
      where ${where.join(' and ')}
      order by u.id
    `,
    params,
  )

  return result.rows.map(mapUserRow)
}

export const enqueueNotificationForUsers = async (
  client: PoolClient,
  input: NotificationPayload,
) => {
  const [eventSetting, usersWithPreferences] = await Promise.all([
    getNotificationEventSetting(client, input),
    applyUserNotificationPreferences(client, input, input.users),
  ])
  const activeUsers = usersWithPreferences.filter((user) => user.isActive !== false)

  if (activeUsers.length === 0) {
    return { eventId: null, audienceCount: 0, jobCount: 0 }
  }

  const scheduledFor = input.scheduledFor ?? null
  const eventStatus = scheduledFor ? 'SCHEDULED' : 'QUEUED'
  const channelSnapshot = getRequestedChannels(input.channels, eventSetting)
  const queueableUsers = activeUsers
    .map((user) => ({
      user,
      channels: getUserChannels(user, input.channels, eventSetting),
    }))
    .filter(({ channels }) => channels.length > 0)

  if (queueableUsers.length === 0) {
    return { eventId: null, audienceCount: 0, jobCount: 0 }
  }

  const eventResult = await client.query<{ id: string }>(
    `
      insert into notification_events (
        society_id,
        event_key,
        category,
        source_table,
        source_id,
        priority,
        title,
        body,
        payload,
        idempotency_key,
        idempotency_window_seconds,
        triggered_by_user_id,
        scheduled_for,
        audience_snapshot,
        channel_snapshot,
        template_snapshot,
        status
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14::jsonb, $15::jsonb, $16::jsonb, $17)
      on conflict (idempotency_key)
      do update set updated_at = notification_events.updated_at
      returning id
    `,
    [
      input.societyId,
      input.eventKey,
      input.category,
      input.sourceTable ?? null,
      input.sourceId ?? null,
      input.priority ?? 'MEDIUM',
      input.title,
      input.body,
      JSON.stringify(input.payload ?? {}),
      input.idempotencyKey,
      input.idempotencyWindowSeconds ?? 86400,
      input.triggeredByUserId ?? null,
      scheduledFor,
      JSON.stringify(input.audienceSnapshot ?? {}),
      JSON.stringify(channelSnapshot),
      JSON.stringify(input.templateSnapshot ?? {}),
      eventStatus,
    ],
  )

  const eventId = eventResult.rows[0]?.id
  if (!eventId) {
    return { eventId: null, audienceCount: 0, jobCount: 0 }
  }

  let audienceCount = 0
  let jobCount = 0

  for (const { user, channels } of queueableUsers) {
    for (const channel of channels) {
      const address = channelAddress(user, channel)
      if ((channel === 'EMAIL' || channel === 'WHATSAPP') && !address) {
        continue
      }

      const audienceResult = await client.query<{ id: string }>(
        `
          insert into notification_audiences (
            notification_event_id,
            target_user_id,
            channel,
            resolved_address,
            audience_label,
            filters_snapshot,
            target_user_status,
            preference_snapshot
          )
          values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)
          returning id
        `,
        [
          eventId,
          user.id,
          channel,
          address,
          input.audienceLabel ?? 'Resolved recipient',
          JSON.stringify(input.audienceSnapshot ?? { eventKey: input.eventKey }),
          user.isActive === false ? 'INACTIVE' : 'ACTIVE',
          JSON.stringify({
            preset: user.preferredNotificationChannels,
            pushEnabled: user.pushEnabled,
            emailEnabled: user.emailEnabled,
            whatsappEnabled: user.whatsappEnabled,
            inAppEnabled: user.inAppEnabled,
          }),
        ],
      )

      const audienceId = audienceResult.rows[0]?.id
      audienceCount += audienceId ? 1 : 0

      const jobResult = await client.query<{ id: string }>(
        `
          insert into notification_jobs (
            notification_event_id,
            audience_id,
            channel,
            dedupe_key,
            priority,
            max_attempts,
            payload,
            scheduled_for,
            next_attempt_at
          )
          values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, coalesce($8, now()))
          on conflict (dedupe_key) do nothing
          returning id
        `,
        [
          eventId,
          audienceId ?? null,
          channel,
          createDedupeKey(input, user.id, channel),
          input.priority ?? 'MEDIUM',
          eventSetting?.retry_max_attempts ?? defaultMaxAttempts,
          JSON.stringify(input.payload ?? {}),
          scheduledFor,
        ],
      )
      jobCount += jobResult.rowCount ?? 0
    }
  }

  return { eventId, audienceCount, jobCount }
}

export const enqueueNotificationForAudience = async (
  client: PoolClient,
  input: Omit<NotificationPayload, 'users'> & { audience: NotificationAudienceFilter },
) => {
  const users = await resolveNotificationAudience(client, input.societyId, input.audience)

  return enqueueNotificationForUsers(client, {
    ...input,
    users,
    audienceSnapshot: input.audienceSnapshot ?? input.audience,
  })
}

export const claimNotificationJobs = async (
  client: PoolClient,
  input: {
    limit?: number
    workerId?: string
  } = {},
) => {
  const workerId = input.workerId ?? `worker-${randomUUID()}`
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 250)

  const result = await client.query<ClaimedJobRow>(
    `
      with claimable as (
        select nj.id
        from notification_jobs nj
        inner join notification_events ne on ne.id = nj.notification_event_id
        where nj.status in ('QUEUED', 'RETRYING')
          and coalesce(nj.scheduled_for, ne.scheduled_for, now()) <= now()
          and coalesce(nj.next_attempt_at, now()) <= now()
          and (nj.locked_at is null or nj.locked_at < now() - interval '10 minutes')
          and ne.status not in ('CANCELLED', 'FAILED')
        order by
          case nj.priority
            when 'EMERGENCY' then 0
            when 'HIGH' then 1
            when 'MEDIUM' then 2
            else 3
          end,
          nj.created_at
        limit $1
        for update skip locked
      )
      , claimed as (
        update notification_jobs nj
        set status = 'PROCESSING',
            locked_at = now(),
            locked_by = $2,
            updated_at = now()
        from claimable
        where nj.id = claimable.id
        returning nj.*
      )
      select
        claimed.id,
        ne.society_id,
        claimed.notification_event_id,
        claimed.audience_id,
        na.target_user_id,
        claimed.channel::text,
        claimed.attempt_count,
        claimed.max_attempts,
        claimed.provider_message_id,
        na.resolved_address,
        claimed.payload,
        ne.event_key,
        ne.category::text,
        ne.title,
        ne.body,
        ne.priority::text
      from claimed
      inner join notification_events ne on ne.id = claimed.notification_event_id
      left join notification_audiences na on na.id = claimed.audience_id
    `,
    [limit, workerId],
  )

  return result.rows
}

const sendWhatsAppMessage = async (input: {
  to: string
  title: string
  body: string
  eventKey: string
  payload: Record<string, unknown>
}): Promise<ProviderSendResult> => {
  const status = getWhatsAppIntegrationStatus()

  if (!status.enabled) {
    return {
      ok: false,
      providerName: 'WHATSAPP',
      failureReason: status.reason,
      permanentFailure: true,
    }
  }

  const templateName =
    typeof input.payload.whatsappTemplateName === 'string'
      ? input.payload.whatsappTemplateName
      : input.eventKey.replaceAll('.', '_')

  try {
    const response = await $fetch<Record<string, unknown>>(status.config.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${status.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        provider: status.config.provider,
        senderId: status.config.senderId,
        to: input.to,
        templateName,
        text: `${input.title}\n${input.body}`.slice(0, 1000),
        deepLink: input.payload.deepLinkUrl ?? input.payload.link ?? null,
      },
    })

    return {
      ok: true,
      providerName: status.config.provider,
      providerMessageId:
        typeof response.messageId === 'string'
          ? response.messageId
          : typeof response.id === 'string'
            ? response.id
            : null,
      responseBody: response,
    }
  } catch (error) {
    const fetchError = error as { statusCode?: number; data?: Record<string, unknown>; message?: string }

    return {
      ok: false,
      providerName: status.config.provider,
      failureReason: fetchError.message ?? 'WhatsApp provider request failed.',
      ...(fetchError.data ? { responseBody: fetchError.data } : {}),
      permanentFailure: Boolean(fetchError.statusCode && fetchError.statusCode >= 400 && fetchError.statusCode < 500),
    }
  }
}

const sendPushForJob = async (
  client: PoolClient,
  job: ClaimedJobRow,
): Promise<ProviderSendResult> => {
  const status = getPushIntegrationStatus()

  if (!status.enabled) {
    return {
      ok: false,
      providerName: 'WEB_PUSH',
      failureReason: status.reason,
      permanentFailure: true,
    }
  }

  if (!job.target_user_id) {
    return {
      ok: false,
      providerName: 'WEB_PUSH',
      failureReason: 'Push notification has no target user.',
      permanentFailure: true,
    }
  }

  const subscriptions = await client.query<{
    id: string
    endpoint: string
    p256dh_key: string
    auth_key: string
  }>(
    `
      select id, endpoint, p256dh_key, auth_key
      from push_subscriptions
      where user_id = $1
        and status = 'ACTIVE'
    `,
    [job.target_user_id],
  )

  if (subscriptions.rows.length === 0) {
    return {
      ok: false,
      providerName: 'WEB_PUSH',
      failureReason: 'No active push subscriptions for the user.',
      permanentFailure: true,
    }
  }

  webpush.setVapidDetails(status.config.subject, status.config.publicKey, status.config.privateKey)
  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())
  const link = typeof job.payload.deepLinkUrl === 'string' ? job.payload.deepLinkUrl : '/my/notifications'
  const payload = JSON.stringify({
    title: job.title ?? 'AJOWA',
    body: job.body ?? '',
    icon: '/ajowa-icon.svg',
    badge: '/ajowa-icon.svg',
    link: new URL(link, runtimeConfig.appUrl).toString(),
    tag: typeof job.payload.tag === 'string' ? job.payload.tag : job.event_key,
    priority: job.priority,
    image: typeof job.payload.image === 'string' ? job.payload.image : undefined,
    actions: Array.isArray(job.payload.actions) ? job.payload.actions : undefined,
  })

  const responses: Record<string, unknown>[] = []
  let successCount = 0
  let lastFailure = ''

  for (const subscription of subscriptions.rows) {
    try {
      const response = await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh_key,
            auth: subscription.auth_key,
          },
        },
        payload,
      )
      successCount += 1
      responses.push({
        subscriptionId: subscription.id,
        statusCode: response.statusCode,
      })
      await client.query(
        `
          update push_subscriptions
          set last_seen_at = now(), last_error = null, updated_at = now()
          where id = $1
        `,
        [subscription.id],
      )
    } catch (error) {
      const pushError = error as { statusCode?: number; body?: string; message?: string }
      lastFailure = pushError.message ?? 'Push provider request failed.'
      responses.push({
        subscriptionId: subscription.id,
        statusCode: pushError.statusCode,
        error: lastFailure,
      })

      if (pushError.statusCode === 404 || pushError.statusCode === 410) {
        await client.query(
          `
            update push_subscriptions
            set status = 'EXPIRED', revoked_at = now(), last_error = $2, updated_at = now()
            where id = $1
          `,
          [subscription.id, lastFailure],
        )
      }
    }
  }

  return {
    ok: successCount > 0,
    providerName: 'WEB_PUSH',
    responseBody: { responses, successCount },
    ...(successCount > 0 ? {} : { failureReason: lastFailure || 'Push delivery failed for all subscriptions.' }),
    permanentFailure: successCount === 0,
  }
}

const sendInAppForJob = async (
  client: PoolClient,
  job: ClaimedJobRow,
): Promise<ProviderSendResult> => {
  if (!job.target_user_id) {
    return {
      ok: false,
      providerName: 'IN_APP',
      failureReason: 'In-app notification has no target user.',
      permanentFailure: true,
    }
  }

  const eventResult = await client.query<{ society_id: string }>(
    'select society_id from notification_events where id = $1',
    [job.notification_event_id],
  )
  const societyId = eventResult.rows[0]?.society_id

  if (!societyId) {
    return {
      ok: false,
      providerName: 'IN_APP',
      failureReason: 'Notification event was not found.',
      permanentFailure: true,
    }
  }

  await client.query(
    `
      insert into in_app_notifications (
        society_id,
        user_id,
        notification_event_id,
        title,
        body,
        deep_link_url,
        priority
      )
      values ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      societyId,
      job.target_user_id,
      job.notification_event_id,
      job.title ?? 'AJOWA notification',
      job.body ?? '',
      typeof job.payload.deepLinkUrl === 'string' ? job.payload.deepLinkUrl : null,
      job.priority,
    ],
  )

  return {
    ok: true,
    providerName: 'IN_APP',
    providerMessageId: job.id,
    responseBody: { stored: true },
  }
}

const dispatchJob = async (
  client: PoolClient,
  job: ClaimedJobRow,
): Promise<ProviderSendResult> => {
  const title = job.title ?? 'AJOWA notification'
  const body = job.body ?? ''

  if (job.channel === 'IN_APP') {
    return sendInAppForJob(client, job)
  }

  if (job.channel === 'EMAIL') {
    if (!job.resolved_address) {
      return {
        ok: false,
        providerName: 'SMTP',
        failureReason: 'Email address is missing.',
        permanentFailure: true,
      }
    }

    const template = emailTemplateByEventKey.get(job.event_key) ?? 'notice'
    let attachments: Awaited<ReturnType<typeof getEmailAttachmentsForJob>>

    try {
      attachments = await getEmailAttachmentsForJob(job)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate the bill PDF.'

      return {
        ok: false,
        providerName: 'SMTP',
        failureReason: message,
        permanentFailure: true,
      }
    }

    try {
      const result = await sendNotificationEmail({
        to: job.resolved_address,
        subject: title,
        template,
        context: {
          title,
          body,
          actionUrl: typeof job.payload.deepLinkUrl === 'string' ? job.payload.deepLinkUrl : undefined,
          actionLabel: 'Open in AJOWA',
          ...job.payload,
        },
        ...(attachments ? { attachments } : {}),
        societyId: job.society_id,
        client,
      })

      return {
        ok: result.delivered,
        providerName: 'SMTP',
        providerMessageId: result.delivered ? result.providerMessageId : null,
        responseBody: result.delivered ? { response: result.response } : {},
        ...(result.delivered || !result.reason ? {} : { failureReason: result.reason }),
        permanentFailure: !result.delivered,
      }
    } catch (error) {
      const context = await getEmailProviderErrorContext(job.society_id, client)

      return {
        ok: false,
        providerName: 'SMTP',
        failureReason: describeProviderError(error, context),
        responseBody: providerErrorResponseBody(error),
        permanentFailure: isPermanentProviderError(error),
      }
    }
  }

  if (job.channel === 'WHATSAPP') {
    if (!job.resolved_address) {
      return {
        ok: false,
        providerName: 'WHATSAPP',
        failureReason: 'WhatsApp number is missing or invalid.',
        permanentFailure: true,
      }
    }

    return sendWhatsAppMessage({
      to: job.resolved_address,
      title,
      body,
      eventKey: job.event_key,
      payload: job.payload,
    })
  }

  return sendPushForJob(client, job)
}

export const dispatchNotificationJobs = async (
  client: PoolClient,
  input: {
    limit?: number
    workerId?: string
  } = {},
) => {
  const jobs = await claimNotificationJobs(client, input)
  let sent = 0
  let failed = 0
  let retried = 0

  for (const job of jobs) {
    const attemptNumber = job.attempt_count + 1
    let result: ProviderSendResult
    try {
      result = await dispatchJob(client, job)
    } catch (error) {
      result = {
        ok: false,
        providerName: job.channel,
        failureReason: describeProviderError(error),
        responseBody: providerErrorResponseBody(error),
        permanentFailure: isPermanentProviderError(error),
      }
    }
    const nextStatus = result.ok ? (job.channel === 'IN_APP' ? 'DELIVERED' : 'SENT') : 'FAILED'
    const shouldRetry = !result.ok && !result.permanentFailure && attemptNumber < job.max_attempts
    const finalStatus = shouldRetry ? 'RETRYING' : nextStatus
    const nextAttemptAt = shouldRetry
      ? `now() + interval '${getBackoffMinutes(attemptNumber)} minutes'`
      : 'null'

    await client.query(
      `
        update notification_jobs
        set status = $2,
            attempt_count = $3,
            last_attempt_at = now(),
            next_attempt_at = ${nextAttemptAt},
            locked_at = null,
            locked_by = null,
            provider_name = $4,
            provider_message_id = coalesce($5, provider_message_id),
            response_body = $6::jsonb,
            failure_reason = $7,
            permanent_failure = $8,
            sent_at = case when $2 in ('SENT', 'DELIVERED') then coalesce(sent_at, now()) else sent_at end,
            delivered_at = case when $2 = 'DELIVERED' then coalesce(delivered_at, now()) else delivered_at end,
            updated_at = now()
        where id = $1
      `,
      [
        job.id,
        finalStatus,
        attemptNumber,
        result.providerName,
        result.providerMessageId ?? null,
        JSON.stringify(result.responseBody ?? {}),
        result.failureReason ?? null,
        Boolean(result.permanentFailure),
      ],
    )

    await client.query(
      `
        insert into notification_delivery_logs (
          notification_job_id,
          provider_name,
          provider_message_id,
          channel,
          status,
          attempt_number,
          response_body,
          failure_reason,
          delivered_at
        )
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, case when $5 = 'DELIVERED' then now() else null end)
      `,
      [
        job.id,
        result.providerName,
        result.providerMessageId ?? null,
        job.channel,
        result.ok ? (job.channel === 'IN_APP' ? 'DELIVERED' : 'SENT') : 'FAILED',
        attemptNumber,
        JSON.stringify(result.responseBody ?? {}),
        result.failureReason ?? null,
      ],
    )

    if (result.ok) {
      sent += 1
    } else if (shouldRetry) {
      retried += 1
    } else {
      failed += 1
    }
  }

  await client.query(
    `
      update notification_events ne
      set status = case
            when stats.failed_count > 0 and stats.pending_count = 0 then 'FAILED'
            when stats.pending_count = 0 then 'PROCESSED'
            else ne.status
          end,
          processed_at = case when stats.pending_count = 0 then now() else ne.processed_at end,
          completed_at = case when stats.pending_count = 0 then now() else ne.completed_at end,
          updated_at = now()
      from (
        select
          notification_event_id,
          count(*) filter (where status in ('QUEUED', 'RETRYING', 'PROCESSING')) as pending_count,
          count(*) filter (where status = 'FAILED') as failed_count
        from notification_jobs
        where notification_event_id = any($1::uuid[])
        group by notification_event_id
      ) stats
      where ne.id = stats.notification_event_id
    `,
    [jobs.map((job) => job.notification_event_id)],
  )

  return {
    claimed: jobs.length,
    sent,
    failed,
    retried,
  }
}

export const sendProviderVerification = async (
  client: PoolClient | null,
  input: {
    channel: Exclude<NotificationChannel, 'IN_APP'>
    societyId: string
    target: string
    triggeredByUserId: string
    pushSubscriptionId?: string
  },
) => {
  if (input.channel === 'EMAIL') {
    try {
      const result = await sendEmail({
        to: input.target,
        subject: 'AJOWA email verification',
        html: '<h1>AJOWA email verification</h1><p>This confirms SMTP notification delivery is configured.</p>',
        text: 'AJOWA email verification\n\nThis confirms SMTP notification delivery is configured.',
        societyId: input.societyId,
        ...(client ? { client } : {}),
      })

      return {
        ok: result.delivered,
        providerMessageId: result.delivered ? result.providerMessageId : null,
        reason: result.delivered ? null : result.reason,
      }
    } catch (error) {
      const context = await getEmailProviderErrorContext(input.societyId, client)

      return {
        ok: false,
        providerMessageId: null,
        reason: describeProviderError(error, context),
      }
    }
  }

  if (input.channel === 'WHATSAPP') {
    const to = normalizeWhatsAppNumber(input.target)
    if (!to) {
      return { ok: false, providerMessageId: null, reason: 'WhatsApp number is not E.164-compatible.' }
    }
    const result = await sendWhatsAppMessage({
      to,
      title: 'AJOWA WhatsApp verification',
      body: 'This confirms WhatsApp notification delivery is configured.',
      eventKey: 'provider.whatsapp.verify',
      payload: {},
    })

    return { ok: result.ok, providerMessageId: result.providerMessageId ?? null, reason: result.failureReason ?? null }
  }

  if (!client) {
    return { ok: false, providerMessageId: null, reason: 'Push verification requires a database connection.' }
  }

  const job: ClaimedJobRow = {
    id: input.pushSubscriptionId ?? randomUUID(),
    society_id: input.societyId,
    notification_event_id: randomUUID(),
    audience_id: null,
    target_user_id: input.triggeredByUserId,
    channel: 'PUSH',
    attempt_count: 0,
    max_attempts: 1,
    provider_message_id: null,
    resolved_address: null,
    payload: { deepLinkUrl: '/admin/settings/notifications', tag: 'provider-push-verify' },
    event_key: 'provider.push.verify',
    category: 'ACCOUNT_ONBOARDING',
    title: 'AJOWA push verification',
    body: 'This confirms browser push delivery is configured.',
    priority: 'LOW',
  }
  const result = await sendPushForJob(client, job)

  return { ok: result.ok, providerMessageId: result.providerMessageId ?? null, reason: result.failureReason ?? null }
}

export const enqueueDueBillingContactNotifications = async (
  client: PoolClient,
  input: {
    societyId: string
    dueIds: string[]
    eventKey: 'maintenance_due.created' | 'maintenance_due.bill' | 'maintenance_due.reminder'
    title: string
    bodyPrefix: string
    channels?: NotificationChannel[]
    recipientRelationshipTypes?: Array<'OWNER' | 'TENANT' | 'FAMILY_MEMBER'>
    triggeredByUserId?: string
  },
) => {
  if (input.dueIds.length === 0) {
    return { eventCount: 0, audienceCount: 0, jobCount: 0 }
  }

  const params: unknown[] = [input.societyId, input.dueIds]
  const relationshipFilter = input.recipientRelationshipTypes?.length
    ? `and fr.relationship_type = any($${params.push(input.recipientRelationshipTypes)}::relationship_type[])`
    : ''

  const result = await client.query<DueNotificationRow>(
    `
      select distinct on (md.id, u.id)
        md.id as due_id,
        md.society_id,
        md.billing_period_id,
        bp.label as billing_period_label,
        f.id as flat_id,
        f.flat_number,
        b.name as block_name,
        md.balance_amount::text,
        u.id as user_id,
        coalesce(nullif(btrim(u.email::text), ''), ${importedOwnerEmailExpression('fr')}) as email,
        u.mobile_number,
        u.whatsapp_number,
        u.preferred_notification_channels::text,
        u.notification_push_enabled,
        u.notification_email_enabled,
        u.notification_whatsapp_enabled,
        u.notification_in_app_enabled
      from maintenance_dues md
      inner join billing_periods bp on bp.id = md.billing_period_id
      inner join flats f on f.id = md.flat_id
      inner join blocks b on b.id = f.block_id
      inner join flat_residents fr on fr.flat_id = f.id and fr.is_active = true
      inner join users u on u.id = fr.user_id and u.is_active = true
      where md.society_id = $1
        and md.id = any($2::uuid[])
        ${relationshipFilter}
        and (fr.is_billing_contact = true or fr.is_primary_contact = true)
        and not (
          bp.charge_type = 'CAM'
          and f.cam_advance_paid_until is not null
          and f.cam_advance_paid_until >= bp.end_date
        )
      order by md.id, u.id, fr.is_billing_contact desc, fr.is_primary_contact desc
    `,
    params,
  )

  const rowsByDueId = new Map<string, DueNotificationRow[]>()
  for (const row of result.rows) {
    rowsByDueId.set(row.due_id, [...(rowsByDueId.get(row.due_id) ?? []), row])
  }

  const eventRows = []
  const eventByDueId = new Map<
    string,
    {
      idempotencyKey: string
      payload: Record<string, unknown>
      priority: NotificationPriority
      windowSeconds: number
    }
  >()

  for (const [dueId, rows] of rowsByDueId.entries()) {
    const due = rows[0]
    if (!due) continue
    const idempotencyScope =
      input.eventKey === 'maintenance_due.reminder' || input.eventKey === 'maintenance_due.bill'
        ? `${dueId}:${new Date().toISOString().slice(0, 10)}`
        : dueId
    const isBill = input.eventKey === 'maintenance_due.bill'
    const idempotencyKey = `${input.eventKey}:${idempotencyScope}`
    const priority: NotificationPriority = input.eventKey === 'maintenance_due.reminder' ? 'HIGH' : 'MEDIUM'
    const windowSeconds = input.eventKey === 'maintenance_due.created' ? 31536000 : 86400
    const payload = {
      dueId,
      billingPeriodId: due.billing_period_id,
      billingPeriodLabel: due.billing_period_label,
      flatId: due.flat_id,
      flatLabel: `${due.block_name} ${due.flat_number}`,
      balanceAmount: Number(due.balance_amount),
      deepLinkUrl: isBill ? buildAppUrl(`/api/my/dues/${dueId}/bill`) : '/my/dues',
      actionLabel: isBill ? 'Download bill PDF' : 'Open in AJOWA',
    }

    eventByDueId.set(dueId, { idempotencyKey, payload, priority, windowSeconds })
    eventRows.push({
      society_id: input.societyId,
      event_key: input.eventKey,
      category: 'BILLING',
      source_table: 'maintenance_dues',
      source_id: dueId,
      priority,
      title: input.title,
      body: `${input.bodyPrefix} ${due.block_name} ${due.flat_number} for ${due.billing_period_label}.`,
      payload,
      idempotency_key: idempotencyKey,
      idempotency_window_seconds: windowSeconds,
      triggered_by_user_id: input.triggeredByUserId ?? null,
      audience_snapshot: { eventKey: input.eventKey, dueId },
      channel_snapshot: input.channels?.length ? input.channels : ['PUSH', 'EMAIL', 'WHATSAPP', 'IN_APP'],
      template_snapshot: {},
      status: 'QUEUED',
    })
  }

  if (eventRows.length === 0) {
    return { eventCount: 0, audienceCount: 0, jobCount: 0 }
  }

  const eventResult = await client.query<{ id: string; idempotency_key: string }>(
    `
      insert into notification_events (
        society_id,
        event_key,
        category,
        source_table,
        source_id,
        priority,
        title,
        body,
        payload,
        idempotency_key,
        idempotency_window_seconds,
        triggered_by_user_id,
        scheduled_for,
        audience_snapshot,
        channel_snapshot,
        template_snapshot,
        status
      )
      select
        payload.society_id,
        payload.event_key,
        payload.category::notification_event_category,
        payload.source_table,
        payload.source_id,
        payload.priority::service_priority,
        payload.title,
        payload.body,
        payload.payload,
        payload.idempotency_key,
        payload.idempotency_window_seconds,
        payload.triggered_by_user_id,
        null,
        payload.audience_snapshot,
        payload.channel_snapshot,
        payload.template_snapshot,
        payload.status::notification_event_status
      from jsonb_to_recordset($1::jsonb) as payload(
        society_id uuid,
        event_key text,
        category text,
        source_table text,
        source_id uuid,
        priority text,
        title text,
        body text,
        payload jsonb,
        idempotency_key text,
        idempotency_window_seconds integer,
        triggered_by_user_id uuid,
        audience_snapshot jsonb,
        channel_snapshot jsonb,
        template_snapshot jsonb,
        status text
      )
      on conflict (idempotency_key)
      do update set updated_at = notification_events.updated_at
      returning id, idempotency_key
    `,
    [JSON.stringify(eventRows)],
  )
  const eventIdByKey = new Map(eventResult.rows.map((row) => [row.idempotency_key, row.id]))
  const audienceRows = []

  for (const [dueId, rows] of rowsByDueId.entries()) {
    const eventMeta = eventByDueId.get(dueId)
    const eventId = eventMeta ? eventIdByKey.get(eventMeta.idempotencyKey) : null
    if (!eventMeta || !eventId) continue

    for (const row of rows) {
      const user: NotificationUser = {
        id: row.user_id,
        email: row.email,
        mobileNumber: row.mobile_number,
        whatsappNumber: row.whatsapp_number,
        preferredNotificationChannels: row.preferred_notification_channels,
        pushEnabled: row.notification_push_enabled,
        emailEnabled: row.notification_email_enabled,
        whatsappEnabled: row.notification_whatsapp_enabled,
        inAppEnabled: row.notification_in_app_enabled,
      }

      for (const channel of getUserChannels(user, input.channels)) {
        const address = channelAddress(user, channel)
        if ((channel === 'EMAIL' || channel === 'WHATSAPP') && !address) {
          continue
        }

        audienceRows.push({
          notification_event_id: eventId,
          target_user_id: user.id,
          channel,
          resolved_address: address,
          audience_label: 'Billing contact',
          filters_snapshot: { eventKey: input.eventKey, dueId },
          target_user_status: 'ACTIVE',
          preference_snapshot: {
            preset: user.preferredNotificationChannels,
            pushEnabled: user.pushEnabled,
            emailEnabled: user.emailEnabled,
            whatsappEnabled: user.whatsappEnabled,
            inAppEnabled: user.inAppEnabled,
          },
          dedupe_key: createDedupeKey(
            {
              societyId: input.societyId,
              eventKey: input.eventKey,
              category: 'BILLING',
              title: input.title,
              body: '',
              payload: eventMeta.payload,
              idempotencyKey: eventMeta.idempotencyKey,
              idempotencyWindowSeconds: eventMeta.windowSeconds,
              users: [],
            },
            user.id,
            channel,
          ),
          priority: eventMeta.priority,
          job_payload: eventMeta.payload,
        })
      }
    }
  }

  if (audienceRows.length === 0) {
    return { eventCount: eventResult.rows.length, audienceCount: 0, jobCount: 0 }
  }

  const audienceResult = await client.query<{ id: string; dedupe_key: string }>(
    `
      with payload as (
        select *
        from jsonb_to_recordset($1::jsonb) as payload(
          notification_event_id uuid,
          target_user_id uuid,
          channel text,
          resolved_address text,
          audience_label text,
          filters_snapshot jsonb,
          target_user_status text,
          preference_snapshot jsonb,
          dedupe_key text,
          priority text,
          job_payload jsonb
        )
      ),
      inserted as (
        insert into notification_audiences (
          notification_event_id,
          target_user_id,
          channel,
          resolved_address,
          audience_label,
          filters_snapshot,
          target_user_status,
          preference_snapshot
        )
        select
          notification_event_id,
          target_user_id,
          channel::notification_channel,
          resolved_address,
          audience_label,
          filters_snapshot,
          target_user_status,
          preference_snapshot
        from payload
        returning id, notification_event_id, target_user_id, channel
      )
      select inserted.id, payload.dedupe_key
      from inserted
      inner join payload
        on payload.notification_event_id = inserted.notification_event_id
       and payload.target_user_id = inserted.target_user_id
       and payload.channel::notification_channel = inserted.channel
    `,
    [JSON.stringify(audienceRows)],
  )
  const audienceIdByDedupeKey = new Map(audienceResult.rows.map((row) => [row.dedupe_key, row.id]))
  const jobRows = audienceRows
    .map((row) => ({
      notification_event_id: row.notification_event_id,
      audience_id: audienceIdByDedupeKey.get(row.dedupe_key) ?? null,
      channel: row.channel,
      dedupe_key: row.dedupe_key,
      priority: row.priority,
      payload: row.job_payload,
    }))
    .filter((row) => row.audience_id)

  if (jobRows.length === 0) {
    return {
      eventCount: eventResult.rows.length,
      audienceCount: audienceResult.rows.length,
      jobCount: 0,
    }
  }

  const jobResult = await client.query<{ id: string }>(
    `
      insert into notification_jobs (
        notification_event_id,
        audience_id,
        channel,
        dedupe_key,
        priority,
        payload,
        scheduled_for,
        next_attempt_at
      )
      select
        payload.notification_event_id,
        payload.audience_id,
        payload.channel::notification_channel,
        payload.dedupe_key,
        payload.priority::service_priority,
        payload.payload,
        null,
        now()
      from jsonb_to_recordset($1::jsonb) as payload(
        notification_event_id uuid,
        audience_id uuid,
        channel text,
        dedupe_key text,
        priority text,
        payload jsonb
      )
      on conflict (dedupe_key) do nothing
      returning id
    `,
    [JSON.stringify(jobRows)],
  )

  return {
    eventCount: eventResult.rows.length,
    audienceCount: audienceResult.rows.length,
    jobCount: jobResult.rowCount ?? 0,
  }
}

export const sortChannelsByPriority = (channels: NotificationChannel[]) =>
  channels.filter((channel, index) => channels.indexOf(channel) === index)

export const sortPriority = (priority: NotificationPriority) => priorityRank[priority]
