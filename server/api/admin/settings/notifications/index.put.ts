import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'

const settingSchema = z.object({
  eventKey: z.string().min(2).max(120),
  category: z.enum([
    'BILLING',
    'PAYMENTS',
    'ACCESS_QR',
    'SERVICE_REQUESTS',
    'AMENITY_BOOKINGS',
    'NOTICES_ANNOUNCEMENTS',
    'ACCOUNT_ONBOARDING',
    'EMERGENCY_ALERTS',
  ]),
  pushEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  whatsappEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
  recipientScope: z.string().max(120).nullable().optional(),
  cooldownMinutes: z.number().int().min(0),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']),
  channelPauseUntil: z.string().datetime().nullable().optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  senderName: z.string().max(120).nullable().optional(),
  throttlePerHour: z.number().int().min(0),
  retryMaxAttempts: z.number().int().min(1).max(10),
  managerBroadcastScope: z.string().max(120),
  criticalBypassQuietHours: z.boolean(),
})

const emailSettingsSchema = z.object({
  enabled: z.boolean(),
  smtpHost: z.string().trim().max(255),
  smtpPort: z.number().int().min(1).max(65535),
  smtpUser: z.string().trim().max(255),
  fromEmail: z.string().trim().max(254),
  fromName: z.string().trim().max(120),
}).superRefine((settings, ctx) => {
  if (!settings.enabled) {
    return
  }

  const requiredFields: Array<keyof typeof settings> = ['smtpHost', 'smtpUser', 'fromEmail', 'fromName']
  for (const field of requiredFields) {
    if (!String(settings[field]).trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: 'Required when email notifications are enabled.',
      })
    }
  }

  if (settings.fromEmail && !z.string().email().safeParse(settings.fromEmail).success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fromEmail'],
      message: 'From email must be a valid email address.',
    })
  }
})

const schema = z.object({
  settings: z.array(settingSchema).min(1),
  emailSettings: emailSettingsSchema.optional(),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validateInput(schema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    if (body.emailSettings) {
      await client.query(
        `
          insert into society_email_settings (
            society_id,
            enabled,
            smtp_host,
            smtp_port,
            smtp_user,
            from_email,
            from_name,
            updated_by_user_id
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8)
          on conflict (society_id) do update
            set enabled = excluded.enabled,
                smtp_host = excluded.smtp_host,
                smtp_port = excluded.smtp_port,
                smtp_user = excluded.smtp_user,
                from_email = excluded.from_email,
                from_name = excluded.from_name,
                updated_by_user_id = excluded.updated_by_user_id,
                updated_at = now()
        `,
        [
          authMe.user.societyId,
          body.emailSettings.enabled,
          body.emailSettings.smtpHost,
          body.emailSettings.smtpPort,
          body.emailSettings.smtpUser,
          body.emailSettings.fromEmail,
          body.emailSettings.fromName,
          authMe.user.id,
        ],
      )
    }

    for (const setting of body.settings) {
      await client.query(
        `
          insert into notification_event_settings (
            society_id,
            event_key,
            category,
            push_enabled,
            email_enabled,
            whatsapp_enabled,
            in_app_enabled,
            recipient_scope,
            cooldown_minutes,
            priority,
            channel_pause_until,
            quiet_hours_start,
            quiet_hours_end,
            sender_name,
            throttle_per_hour,
            retry_max_attempts,
            manager_broadcast_scope,
            critical_bypass_quiet_hours
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12::time, $13::time, $14, $15, $16, $17, $18)
          on conflict (society_id, event_key) do update
            set category = excluded.category,
                push_enabled = excluded.push_enabled,
                email_enabled = excluded.email_enabled,
                whatsapp_enabled = excluded.whatsapp_enabled,
                in_app_enabled = excluded.in_app_enabled,
                recipient_scope = excluded.recipient_scope,
                cooldown_minutes = excluded.cooldown_minutes,
                priority = excluded.priority,
                channel_pause_until = excluded.channel_pause_until,
                quiet_hours_start = excluded.quiet_hours_start,
                quiet_hours_end = excluded.quiet_hours_end,
                sender_name = excluded.sender_name,
                throttle_per_hour = excluded.throttle_per_hour,
                retry_max_attempts = excluded.retry_max_attempts,
                manager_broadcast_scope = excluded.manager_broadcast_scope,
                critical_bypass_quiet_hours = excluded.critical_bypass_quiet_hours,
                updated_at = now()
        `,
        [
          authMe.user.societyId,
          setting.eventKey,
          setting.category,
          setting.pushEnabled,
          setting.emailEnabled,
          setting.whatsappEnabled,
          setting.inAppEnabled,
          setting.recipientScope ?? null,
          setting.cooldownMinutes,
          setting.priority,
          setting.channelPauseUntil ?? null,
          setting.quietHoursStart ?? null,
          setting.quietHoursEnd ?? null,
          setting.senderName ?? null,
          setting.throttlePerHour,
          setting.retryMaxAttempts,
          setting.managerBroadcastScope,
          setting.criticalBypassQuietHours,
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

  return createApiSuccess(event, { updated: body.settings.length })
})
