import type { PoolClient } from 'pg'

type NotificationChannel = 'PUSH' | 'EMAIL' | 'WHATSAPP' | 'IN_APP'
type NotificationPreset =
  | 'PUSH'
  | 'EMAIL'
  | 'WHATSAPP'
  | 'IN_APP'
  | 'PUSH_AND_EMAIL'
  | 'PUSH_AND_WHATSAPP'
  | 'EMAIL_AND_WHATSAPP'
  | 'PUSH_EMAIL_WHATSAPP'
  | 'ALL_CHANNELS'

type NotificationUser = {
  id: string
  email: string | null
  mobileNumber: string | null
  whatsappNumber: string | null
  preferredNotificationChannels: NotificationPreset
  pushEnabled: boolean
  emailEnabled: boolean
  whatsappEnabled: boolean
  inAppEnabled: boolean
}

type NotificationPayload = {
  societyId: string
  eventKey: string
  category: 'BILLING' | 'PAYMENTS' | 'ACCESS_QR' | 'SERVICE_REQUESTS' | 'NOTICES_ANNOUNCEMENTS' | 'ACCOUNT_ONBOARDING' | 'EMERGENCY_ALERTS'
  sourceTable?: string
  sourceId?: string
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY'
  title: string
  body: string
  payload?: Record<string, unknown>
  idempotencyKey: string
  triggeredByUserId?: string
  users: NotificationUser[]
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

const enabledForChannel = (user: NotificationUser, channel: NotificationChannel) => {
  if (channel === 'PUSH') return user.pushEnabled
  if (channel === 'EMAIL') return user.emailEnabled && Boolean(user.email)
  if (channel === 'WHATSAPP') return user.whatsappEnabled && Boolean(user.whatsappNumber ?? user.mobileNumber)
  return user.inAppEnabled
}

const channelAddress = (user: NotificationUser, channel: NotificationChannel) => {
  if (channel === 'EMAIL') return user.email
  if (channel === 'WHATSAPP') return user.whatsappNumber ?? user.mobileNumber
  return null
}

const getUserChannels = (user: NotificationUser) =>
  presetChannels[user.preferredNotificationChannels]
    .filter((channel) => enabledForChannel(user, channel))
    .filter((channel, index, channels) => channels.indexOf(channel) === index)

export const enqueueNotificationForUsers = async (
  client: PoolClient,
  input: NotificationPayload,
) => {
  if (input.users.length === 0) {
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
        triggered_by_user_id
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
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
      input.triggeredByUserId ?? null,
    ],
  )

  const eventId = eventResult.rows[0]?.id
  if (!eventId) {
    return { eventId: null, audienceCount: 0, jobCount: 0 }
  }

  let audienceCount = 0
  let jobCount = 0

  for (const user of input.users) {
    for (const channel of getUserChannels(user)) {
      const audienceResult = await client.query<{ id: string }>(
        `
          insert into notification_audiences (
            notification_event_id,
            target_user_id,
            channel,
            resolved_address,
            audience_label,
            filters_snapshot
          )
          values ($1, $2, $3, $4, $5, $6::jsonb)
          returning id
        `,
        [
          eventId,
          user.id,
          channel,
          channelAddress(user, channel),
          'Billing contact',
          JSON.stringify({ eventKey: input.eventKey }),
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
            payload
          )
          values ($1, $2, $3, $4, $5, $6::jsonb)
          on conflict (dedupe_key) do nothing
          returning id
        `,
        [
          eventId,
          audienceId ?? null,
          channel,
          `${input.idempotencyKey}:${user.id}:${channel}`,
          input.priority ?? 'MEDIUM',
          JSON.stringify(input.payload ?? {}),
        ],
      )
      jobCount += jobResult.rowCount ?? 0
    }
  }

  return { eventId, audienceCount, jobCount }
}

export const enqueueDueBillingContactNotifications = async (
  client: PoolClient,
  input: {
    societyId: string
    dueIds: string[]
    eventKey: 'maintenance_due.created' | 'maintenance_due.reminder'
    title: string
    bodyPrefix: string
    triggeredByUserId?: string
  },
) => {
  if (input.dueIds.length === 0) {
    return { eventCount: 0, audienceCount: 0, jobCount: 0 }
  }

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
        u.email::text,
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
        and (fr.is_billing_contact = true or fr.is_primary_contact = true)
      order by md.id, u.id, fr.is_billing_contact desc, fr.is_primary_contact desc
    `,
    [input.societyId, input.dueIds],
  )

  const rowsByDueId = new Map<string, DueNotificationRow[]>()
  for (const row of result.rows) {
    rowsByDueId.set(row.due_id, [...(rowsByDueId.get(row.due_id) ?? []), row])
  }

  let eventCount = 0
  let audienceCount = 0
  let jobCount = 0

  for (const [dueId, rows] of rowsByDueId.entries()) {
    const due = rows[0]
    if (!due) continue
    const idempotencyScope =
      input.eventKey === 'maintenance_due.reminder'
        ? `${dueId}:${new Date().toISOString().slice(0, 10)}`
        : dueId

    const queued = await enqueueNotificationForUsers(client, {
      societyId: input.societyId,
      eventKey: input.eventKey,
      category: 'BILLING',
      sourceTable: 'maintenance_dues',
      sourceId: dueId,
      priority: input.eventKey === 'maintenance_due.reminder' ? 'HIGH' : 'MEDIUM',
      title: input.title,
      body: `${input.bodyPrefix} ${due.block_name} ${due.flat_number} for ${due.billing_period_label}.`,
      payload: {
        dueId,
        billingPeriodId: due.billing_period_id,
        billingPeriodLabel: due.billing_period_label,
        flatId: due.flat_id,
        flatLabel: `${due.block_name} ${due.flat_number}`,
        balanceAmount: Number(due.balance_amount),
      },
      idempotencyKey: `${input.eventKey}:${idempotencyScope}`,
      ...(input.triggeredByUserId ? { triggeredByUserId: input.triggeredByUserId } : {}),
      users: rows.map((row) => ({
        id: row.user_id,
        email: row.email,
        mobileNumber: row.mobile_number,
        whatsappNumber: row.whatsapp_number,
        preferredNotificationChannels: row.preferred_notification_channels,
        pushEnabled: row.notification_push_enabled,
        emailEnabled: row.notification_email_enabled,
        whatsappEnabled: row.notification_whatsapp_enabled,
        inAppEnabled: row.notification_in_app_enabled,
      })),
    })

    eventCount += queued.eventId ? 1 : 0
    audienceCount += queued.audienceCount
    jobCount += queued.jobCount
  }

  return { eventCount, audienceCount, jobCount }
}
