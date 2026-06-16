import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getEmailIntegrationStatus, getPushIntegrationStatus, getWhatsAppIntegrationStatus } from '~/server/utils/env'
import { queryRows } from '~/server/utils/database'

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

  const email = getEmailIntegrationStatus()
  const whatsapp = getWhatsAppIntegrationStatus()
  const push = getPushIntegrationStatus()

  return createApiSuccess(event, {
    providers: {
      email: { enabled: email.enabled, reason: email.enabled ? null : email.reason },
      whatsapp: { enabled: whatsapp.enabled, reason: whatsapp.enabled ? null : whatsapp.reason },
      push: { enabled: push.enabled, reason: push.enabled ? null : push.reason },
    },
    metrics: {
      activePushSubscribers: Number(metrics.rows[0]?.active_push_subscribers ?? 0),
      activeResidents: Number(metrics.rows[0]?.active_residents ?? 0),
    },
    settings: settings.rows.map((row) => ({
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
  })
})
