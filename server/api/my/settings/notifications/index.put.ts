import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireAuth } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'

const preferenceSchema = z.object({
  category: z.enum([
    'BILLING',
    'PAYMENTS',
    'ACCESS_QR',
    'SERVICE_REQUESTS',
    'NOTICES_ANNOUNCEMENTS',
    'ACCOUNT_ONBOARDING',
    'EMERGENCY_ALERTS',
  ]),
  pushEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  whatsappEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  fallbackToMobileForWhatsapp: z.boolean(),
  preferredLanguage: z.string().min(2).max(12),
  allowCriticalBypass: z.boolean(),
})

const schema = z.object({
  preferences: z.array(preferenceSchema).min(1),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireAuth(event)
  const body = validateInput(schema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    for (const preference of body.preferences) {
      await client.query(
        `
          insert into user_notification_preferences (
            society_id,
            user_id,
            event_category,
            push_enabled,
            email_enabled,
            whatsapp_enabled,
            in_app_enabled,
            quiet_hours_start,
            quiet_hours_end,
            fallback_to_mobile_for_whatsapp,
            preferred_language,
            allow_critical_bypass
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8::time, $9::time, $10, $11, $12)
          on conflict (user_id, event_category) do update
            set push_enabled = excluded.push_enabled,
                email_enabled = excluded.email_enabled,
                whatsapp_enabled = excluded.whatsapp_enabled,
                in_app_enabled = excluded.in_app_enabled,
                quiet_hours_start = excluded.quiet_hours_start,
                quiet_hours_end = excluded.quiet_hours_end,
                fallback_to_mobile_for_whatsapp = excluded.fallback_to_mobile_for_whatsapp,
                preferred_language = excluded.preferred_language,
                allow_critical_bypass = excluded.allow_critical_bypass,
                updated_at = now()
        `,
        [
          authMe.user.societyId,
          authMe.user.id,
          preference.category,
          preference.pushEnabled,
          preference.emailEnabled,
          preference.whatsappEnabled,
          preference.inAppEnabled,
          preference.quietHoursStart ?? null,
          preference.quietHoursEnd ?? null,
          preference.fallbackToMobileForWhatsapp,
          preference.preferredLanguage,
          preference.allowCriticalBypass,
        ],
      )
    }
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }

  return createApiSuccess(event, { updated: body.preferences.length })
})
