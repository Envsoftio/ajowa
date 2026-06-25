import { createApiSuccess } from '~/server/utils/api'
import { requireAuth } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'
import type { NotificationCategory } from '~/server/utils/notifications'

const categories: NotificationCategory[] = [
  'BILLING',
  'PAYMENTS',
  'ACCESS_QR',
  'SERVICE_REQUESTS',
  'NOTICES_ANNOUNCEMENTS',
  'ACCOUNT_ONBOARDING',
  'EMERGENCY_ALERTS',
]

export default defineEventHandler(async (event) => {
  const authMe = await requireAuth(event)

  await queryRows(
    `
      insert into user_notification_preferences (society_id, user_id, event_category)
      select $1, $2, category.value::notification_event_category
      from unnest($3::text[]) as category(value)
      on conflict (user_id, event_category) do nothing
    `,
    [authMe.user.societyId, authMe.user.id, categories],
  )

  const [preferences, subscriptions] = await Promise.all([
    queryRows<{
      event_category: string
      push_enabled: boolean
      email_enabled: boolean
      whatsapp_enabled: boolean
      in_app_enabled: boolean
      quiet_hours_start: string | null
      quiet_hours_end: string | null
      fallback_to_mobile_for_whatsapp: boolean
      preferred_language: string
      allow_critical_bypass: boolean
    }>(
      `
        select
          event_category::text,
          push_enabled,
          email_enabled,
          whatsapp_enabled,
          in_app_enabled,
          quiet_hours_start::text,
          quiet_hours_end::text,
          fallback_to_mobile_for_whatsapp,
          preferred_language,
          allow_critical_bypass
        from user_notification_preferences
        where user_id = $1
        order by event_category
      `,
      [authMe.user.id],
    ),
    queryRows<{ id: string; device_label: string | null; status: string; last_seen_at: string | null }>(
      `
        select id, device_label, status::text, last_seen_at::text
        from push_subscriptions
        where user_id = $1
        order by updated_at desc
      `,
      [authMe.user.id],
    ),
  ])

  return createApiSuccess(event, {
    preferences: preferences.rows.map((row) => ({
      category: row.event_category,
      pushEnabled: row.push_enabled,
      emailEnabled: row.email_enabled,
      whatsappEnabled: row.whatsapp_enabled,
      inAppEnabled: row.in_app_enabled,
      quietHoursStart: row.quiet_hours_start,
      quietHoursEnd: row.quiet_hours_end,
      fallbackToMobileForWhatsapp: row.fallback_to_mobile_for_whatsapp,
      preferredLanguage: row.preferred_language,
      allowCriticalBypass: row.allow_critical_bypass,
    })),
    subscriptions: subscriptions.rows.map((row) => ({
      id: row.id,
      deviceLabel: row.device_label,
      status: row.status,
      lastSeenAt: row.last_seen_at,
    })),
  })
})
