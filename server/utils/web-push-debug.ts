import type { PoolClient } from 'pg'
import { AppError } from './errors'
import { getPushIntegrationStatus } from './env'

type FlatRow = {
  id: string
  block_name: string
  flat_number: string
  is_active: boolean
}

type EventSettingRow = {
  push_enabled: boolean
  channel_pause_until: string | null
  is_push_paused: boolean
}

type OwnerRow = {
  id: string
  full_name: string
  email: string | null
  mobile_number: string | null
  preferred_notification_channels: string
  notification_push_enabled: boolean
  user_is_active: boolean
  can_login: boolean
  relationship_is_active: boolean
  is_primary_contact: boolean
  is_billing_contact: boolean
  preference_push_enabled: boolean | null
  preference_pause_until: string | null
  preference_paused: boolean | null
}

type SubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  device_label: string | null
  browser_name: string | null
  platform: string | null
  status: string
  last_seen_at: string | null
  last_error: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export type WebPushDebugSubscription = {
  id: string
  endpointHost: string
  endpointPreview: string
  deviceLabel: string | null
  browserName: string | null
  platform: string | null
  status: string
  lastSeenAt: string | null
  lastError: string | null
  revokedAt: string | null
  createdAt: string
  updatedAt: string
}

export type WebPushDebugOwner = {
  id: string
  fullName: string
  email: string | null
  mobileNumber: string | null
  preferredNotificationChannels: string
  notificationPushEnabled: boolean
  userActive: boolean
  canLogin: boolean
  relationshipActive: boolean
  isPrimaryContact: boolean
  isBillingContact: boolean
  preferencePushEnabled: boolean | null
  preferencePauseUntil: string | null
  preferencePaused: boolean
  subscriptions: WebPushDebugSubscription[]
  activeSubscriptionCount: number
  normalFlowEligible: boolean
  normalFlowEligibilityReasons: string[]
}

export type WebPushDebugDiagnostics = {
  provider: {
    enabled: boolean
    reason: string | null
  }
  manualBroadcastPushSetting: {
    eventKey: string
    configured: boolean
    pushEnabled: boolean
    paused: boolean
    pauseUntil: string | null
  }
  flat: {
    id: string
    label: string
    isActive: boolean
  } | null
  owners: WebPushDebugOwner[]
}

export const webPushDebugEventKey = 'manual.broadcast'
const webPushDebugCategory = 'NOTICES_ANNOUNCEMENTS'

const getEndpointHost = (endpoint: string) => {
  try {
    return new URL(endpoint).host
  } catch {
    return 'Invalid endpoint'
  }
}

const getEndpointPreview = (endpoint: string) => {
  try {
    const url = new URL(endpoint)
    const tokenHint = endpoint.length > 8 ? endpoint.slice(-8) : endpoint

    return `${url.origin}${url.pathname.slice(0, 36)}...${tokenHint}`
  } catch {
    return endpoint.length > 44 ? `${endpoint.slice(0, 36)}...${endpoint.slice(-8)}` : endpoint
  }
}

const mapSubscription = (row: SubscriptionRow): WebPushDebugSubscription => ({
  id: row.id,
  endpointHost: getEndpointHost(row.endpoint),
  endpointPreview: getEndpointPreview(row.endpoint),
  deviceLabel: row.device_label,
  browserName: row.browser_name,
  platform: row.platform,
  status: row.status,
  lastSeenAt: row.last_seen_at,
  lastError: row.last_error,
  revokedAt: row.revoked_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const getManualBroadcastPushSetting = async (
  client: PoolClient,
  societyId: string,
): Promise<WebPushDebugDiagnostics['manualBroadcastPushSetting']> => {
  const result = await client.query<EventSettingRow>(
    `
      select
        push_enabled,
        channel_pause_until::text,
        channel_pause_until is not null and channel_pause_until > now() as is_push_paused
      from notification_event_settings
      where society_id = $1
        and event_key = $2
      limit 1
    `,
    [societyId, webPushDebugEventKey],
  )
  const row = result.rows[0]

  return {
    eventKey: webPushDebugEventKey,
    configured: Boolean(row),
    pushEnabled: row?.push_enabled ?? true,
    paused: row?.is_push_paused ?? false,
    pauseUntil: row?.channel_pause_until ?? null,
  }
}

const getFlat = async (
  client: PoolClient,
  societyId: string,
  flatId: string,
) => {
  const result = await client.query<FlatRow>(
    `
      select
        f.id,
        b.name as block_name,
        f.flat_number,
        f.is_active
      from flats f
      inner join blocks b on b.id = f.block_id
      where f.society_id = $1
        and f.id = $2
      limit 1
    `,
    [societyId, flatId],
  )
  const row = result.rows[0]

  if (!row) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Flat was not found for this society.',
    })
  }

  return {
    id: row.id,
    label: `${row.block_name} ${row.flat_number}`,
    isActive: row.is_active,
  }
}

const getFlatOwners = async (
  client: PoolClient,
  societyId: string,
  flatId: string,
) => {
  const result = await client.query<OwnerRow>(
    `
      select distinct
        u.id,
        u.full_name,
        nullif(btrim(u.email::text), '') as email,
        u.mobile_number,
        u.preferred_notification_channels::text,
        u.notification_push_enabled,
        u.is_active as user_is_active,
        u.can_login,
        fr.is_active as relationship_is_active,
        fr.is_primary_contact,
        fr.is_billing_contact,
        pref.push_enabled as preference_push_enabled,
        pref.channel_paused_until::text as preference_pause_until,
        pref.channel_paused_until is not null and pref.channel_paused_until > now() as preference_paused
      from flats f
      inner join flat_residents fr on fr.flat_id = f.id
      inner join users u on u.id = fr.user_id
      left join user_notification_preferences pref on pref.user_id = u.id
        and pref.society_id = f.society_id
        and pref.event_category = $3::notification_event_category
      where f.society_id = $1
        and f.id = $2
        and fr.relationship_type = 'OWNER'
      order by fr.is_active desc, fr.is_primary_contact desc, fr.is_billing_contact desc, u.full_name
    `,
    [societyId, flatId, webPushDebugCategory],
  )

  return result.rows
}

const getSubscriptions = async (
  client: PoolClient,
  societyId: string,
  userIds: string[],
) => {
  if (userIds.length === 0) {
    return []
  }

  const result = await client.query<SubscriptionRow>(
    `
      select
        id,
        user_id,
        endpoint,
        device_label,
        browser_name,
        platform,
        status::text,
        last_seen_at::text,
        last_error,
        revoked_at::text,
        created_at::text,
        updated_at::text
      from push_subscriptions
      where society_id = $1
        and user_id = any($2::uuid[])
      order by status = 'ACTIVE' desc, last_seen_at desc nulls last, updated_at desc
    `,
    [societyId, userIds],
  )

  return result.rows
}

const getEligibilityReasons = (
  owner: OwnerRow,
  subscriptions: WebPushDebugSubscription[],
  diagnostics: Pick<WebPushDebugDiagnostics, 'provider' | 'manualBroadcastPushSetting'>,
) => {
  const reasons: string[] = []

  if (!diagnostics.provider.enabled) {
    reasons.push(diagnostics.provider.reason ?? 'Push integration is disabled.')
  }
  if (!diagnostics.manualBroadcastPushSetting.pushEnabled) {
    reasons.push('Manual broadcast push is disabled in notification settings.')
  }
  if (diagnostics.manualBroadcastPushSetting.paused) {
    reasons.push('Manual broadcast push is currently paused.')
  }
  if (!owner.user_is_active) {
    reasons.push('The owner user account is inactive.')
  }
  if (!owner.can_login) {
    reasons.push('The owner user account cannot log in.')
  }
  if (!owner.relationship_is_active) {
    reasons.push('The owner relationship for this flat is inactive.')
  }
  if (!owner.notification_push_enabled) {
    reasons.push('The owner has push notifications disabled on their user profile.')
  }
  if (owner.preference_push_enabled === false) {
    reasons.push('The owner has push disabled for notices and announcements.')
  }
  if (owner.preference_paused) {
    reasons.push('The owner has notices and announcements paused.')
  }
  if (!subscriptions.some((subscription) => subscription.status === 'ACTIVE')) {
    reasons.push('The owner has no active browser push subscription.')
  }

  return reasons
}

export const getWebPushDebugDiagnostics = async (
  client: PoolClient,
  input: {
    societyId: string
    flatId?: string | undefined
  },
): Promise<WebPushDebugDiagnostics> => {
  const status = getPushIntegrationStatus()
  const provider = {
    enabled: status.enabled,
    reason: status.enabled ? null : status.reason,
  }
  const manualBroadcastPushSetting = await getManualBroadcastPushSetting(client, input.societyId)

  if (!input.flatId) {
    return {
      provider,
      manualBroadcastPushSetting,
      flat: null,
      owners: [],
    }
  }

  const flat = await getFlat(client, input.societyId, input.flatId)
  const ownerRows = await getFlatOwners(client, input.societyId, input.flatId)
  const subscriptionRows = await getSubscriptions(
    client,
    input.societyId,
    ownerRows.map((owner) => owner.id),
  )
  const subscriptionsByUserId = new Map<string, WebPushDebugSubscription[]>()

  for (const row of subscriptionRows) {
    const subscriptions = subscriptionsByUserId.get(row.user_id) ?? []
    subscriptions.push(mapSubscription(row))
    subscriptionsByUserId.set(row.user_id, subscriptions)
  }

  const owners = ownerRows.map((owner): WebPushDebugOwner => {
    const subscriptions = subscriptionsByUserId.get(owner.id) ?? []
    const normalFlowEligibilityReasons = getEligibilityReasons(owner, subscriptions, {
      provider,
      manualBroadcastPushSetting,
    })

    return {
      id: owner.id,
      fullName: owner.full_name,
      email: owner.email,
      mobileNumber: owner.mobile_number,
      preferredNotificationChannels: owner.preferred_notification_channels,
      notificationPushEnabled: owner.notification_push_enabled,
      userActive: owner.user_is_active,
      canLogin: owner.can_login,
      relationshipActive: owner.relationship_is_active,
      isPrimaryContact: owner.is_primary_contact,
      isBillingContact: owner.is_billing_contact,
      preferencePushEnabled: owner.preference_push_enabled,
      preferencePauseUntil: owner.preference_pause_until,
      preferencePaused: owner.preference_paused ?? false,
      subscriptions,
      activeSubscriptionCount: subscriptions.filter((subscription) => subscription.status === 'ACTIVE').length,
      normalFlowEligible: normalFlowEligibilityReasons.length === 0,
      normalFlowEligibilityReasons,
    }
  })

  return {
    provider,
    manualBroadcastPushSetting,
    flat,
    owners,
  }
}

export const selectWebPushDebugOwner = (
  diagnostics: WebPushDebugDiagnostics,
  ownerUserId?: string | undefined,
) => {
  const owner = ownerUserId
    ? diagnostics.owners.find((item) => item.id === ownerUserId)
    : diagnostics.owners.find((item) => item.activeSubscriptionCount > 0) ?? diagnostics.owners[0]

  if (!owner) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'No flat owner was found for this flat.',
    })
  }

  return owner
}
