import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import {
  getPushIntegrationStatus,
  getWhatsAppIntegrationStatus,
  getWhatsAppWebhookStatus,
} from '~/server/utils/env'
import { getResolvedEmailIntegrationStatus, getResolvedEmailSettings } from '~/server/utils/email'
import { queryRows } from '~/server/utils/database'

const defaultNotificationSettings = [
  {
    eventKey: 'manual.broadcast',
    category: 'NOTICES_ANNOUNCEMENTS',
    pushEnabled: true,
    emailEnabled: true,
    whatsappEnabled: false,
    inAppEnabled: true,
    recipientScope: 'ALL_ACTIVE_RESIDENTS',
    cooldownMinutes: 0,
    priority: 'MEDIUM',
    channelPauseUntil: null,
    quietHoursStart: null,
    quietHoursEnd: null,
    senderName: 'AJOWA',
    throttlePerHour: 0,
    retryMaxAttempts: 3,
    managerBroadcastScope: 'ALL_ACTIVE_RESIDENTS',
    criticalBypassQuietHours: true,
  },
  {
    eventKey: 'notice.published',
    category: 'NOTICES_ANNOUNCEMENTS',
    pushEnabled: true,
    emailEnabled: true,
    whatsappEnabled: true,
    inAppEnabled: true,
    recipientScope: 'ALL_ACTIVE_RESIDENTS',
    cooldownMinutes: 0,
    priority: 'MEDIUM',
    channelPauseUntil: null,
    quietHoursStart: null,
    quietHoursEnd: null,
    senderName: 'AJOWA',
    throttlePerHour: 0,
    retryMaxAttempts: 3,
    managerBroadcastScope: 'ALL_ACTIVE_RESIDENTS',
    criticalBypassQuietHours: true,
  },
  {
    eventKey: 'amenity_booking.created',
    category: 'AMENITY_BOOKINGS',
    pushEnabled: true,
    emailEnabled: true,
    whatsappEnabled: false,
    inAppEnabled: true,
    recipientScope: 'AMENITY_BOOKING_MANAGERS',
    cooldownMinutes: 0,
    priority: 'MEDIUM',
    channelPauseUntil: null,
    quietHoursStart: null,
    quietHoursEnd: null,
    senderName: 'AJOWA',
    throttlePerHour: 0,
    retryMaxAttempts: 3,
    managerBroadcastScope: 'ALL_ACTIVE_RESIDENTS',
    criticalBypassQuietHours: true,
  },
  {
    eventKey: 'amenity_booking.updated',
    category: 'AMENITY_BOOKINGS',
    pushEnabled: true,
    emailEnabled: true,
    whatsappEnabled: false,
    inAppEnabled: true,
    recipientScope: 'AMENITY_BOOKING_RESIDENTS',
    cooldownMinutes: 0,
    priority: 'MEDIUM',
    channelPauseUntil: null,
    quietHoursStart: null,
    quietHoursEnd: null,
    senderName: 'AJOWA',
    throttlePerHour: 0,
    retryMaxAttempts: 3,
    managerBroadcastScope: 'ALL_ACTIVE_RESIDENTS',
    criticalBypassQuietHours: true,
  },
  {
    eventKey: 'service_request.updated',
    category: 'SERVICE_REQUESTS',
    pushEnabled: true,
    emailEnabled: true,
    whatsappEnabled: false,
    inAppEnabled: true,
    recipientScope: 'SERVICE_REQUEST_PARTICIPANTS',
    cooldownMinutes: 0,
    priority: 'MEDIUM',
    channelPauseUntil: null,
    quietHoursStart: null,
    quietHoursEnd: null,
    senderName: 'AJOWA',
    throttlePerHour: 0,
    retryMaxAttempts: 3,
    managerBroadcastScope: 'ALL_ACTIVE_RESIDENTS',
    criticalBypassQuietHours: true,
  },
]

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const [settings, metrics] = await Promise.all([
    queryRows<{
      id: string
      event_key: string
      category: string
      push_enabled: boolean
      email_enabled: boolean
      whatsapp_enabled: boolean
      in_app_enabled: boolean
      recipient_scope: string | null
      cooldown_minutes: number
      priority: string
      channel_pause_until: string | null
      quiet_hours_start: string | null
      quiet_hours_end: string | null
      sender_name: string | null
      throttle_per_hour: number
      retry_max_attempts: number
      manager_broadcast_scope: string
      critical_bypass_quiet_hours: boolean
    }>(
      `
        select
          id,
          event_key,
          category::text,
          push_enabled,
          email_enabled,
          whatsapp_enabled,
          in_app_enabled,
          recipient_scope,
          cooldown_minutes,
          priority::text,
          channel_pause_until::text,
          quiet_hours_start::text,
          quiet_hours_end::text,
          sender_name,
          throttle_per_hour,
          retry_max_attempts,
          manager_broadcast_scope,
          critical_bypass_quiet_hours
        from notification_event_settings
        where society_id = $1
        order by category, event_key
      `,
      [authMe.user.societyId],
    ),
    queryRows<{
      active_push_subscribers: string
      active_residents: string
    }>(
      `
        select
          (select count(distinct user_id)::text from push_subscriptions where society_id = $1 and status = 'ACTIVE') as active_push_subscribers,
          (select count(*)::text from users where society_id = $1 and role = 'RESIDENT' and is_active = true) as active_residents
      `,
      [authMe.user.societyId],
    ),
  ])

  const [email, emailSettings] = await Promise.all([
    getResolvedEmailIntegrationStatus(authMe.user.societyId),
    getResolvedEmailSettings(authMe.user.societyId),
  ])
  const whatsapp = getWhatsAppIntegrationStatus()
  const whatsappWebhook = getWhatsAppWebhookStatus()
  const push = getPushIntegrationStatus()

  return createApiSuccess(event, {
    emailSettings,
    providers: {
      email: { enabled: email.enabled, reason: email.enabled ? null : email.reason },
      whatsapp: { enabled: whatsapp.enabled, reason: whatsapp.enabled ? null : whatsapp.reason },
      whatsappWebhook: {
        enabled: whatsappWebhook.enabled,
        reason: whatsappWebhook.enabled ? null : whatsappWebhook.reason,
      },
      push: { enabled: push.enabled, reason: push.enabled ? null : push.reason },
    },
    metrics: {
      activePushSubscribers: Number(metrics.rows[0]?.active_push_subscribers ?? 0),
      activeResidents: Number(metrics.rows[0]?.active_residents ?? 0),
    },
    settings: [
      ...settings.rows.map((row) => ({
      id: row.id,
      eventKey: row.event_key,
      category: row.category,
      pushEnabled: row.push_enabled,
      emailEnabled: row.email_enabled,
      whatsappEnabled: row.whatsapp_enabled,
      inAppEnabled: row.in_app_enabled,
      recipientScope: row.recipient_scope,
      cooldownMinutes: row.cooldown_minutes,
      priority: row.priority,
      channelPauseUntil: row.channel_pause_until,
      quietHoursStart: row.quiet_hours_start,
      quietHoursEnd: row.quiet_hours_end,
      senderName: row.sender_name,
      throttlePerHour: row.throttle_per_hour,
      retryMaxAttempts: row.retry_max_attempts,
      managerBroadcastScope: row.manager_broadcast_scope,
      criticalBypassQuietHours: row.critical_bypass_quiet_hours,
      })),
      ...defaultNotificationSettings.filter(
        (setting) => !settings.rows.some((row) => row.event_key === setting.eventKey),
      ),
    ],
  })
})
