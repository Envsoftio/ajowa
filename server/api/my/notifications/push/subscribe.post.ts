import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireAuth } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'
import { getEventHeader } from '~/server/utils/http-event'

const optionalText = (maxLength: number) =>
  z.preprocess(
    (value) => (value === null || value === '' ? undefined : value),
    z.string().max(maxLength).optional(),
  )

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  deviceLabel: optionalText(120),
  browserName: optionalText(80),
  platform: optionalText(80),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireAuth(event)
  const body = validateInput(schema, await readJsonBody(event))
  const userAgent = getEventHeader(event, 'user-agent') ?? null

  const result = await queryRows<{ id: string }>(
    `
      insert into push_subscriptions (
        society_id,
        user_id,
        endpoint,
        p256dh_key,
        auth_key,
        user_agent,
        device_label,
        browser_name,
        platform,
        status,
        last_seen_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', now())
      on conflict (endpoint) do update
        set society_id = excluded.society_id,
            user_id = excluded.user_id,
            p256dh_key = excluded.p256dh_key,
            auth_key = excluded.auth_key,
            user_agent = excluded.user_agent,
            device_label = excluded.device_label,
            browser_name = excluded.browser_name,
            platform = excluded.platform,
            status = 'ACTIVE',
            last_seen_at = now(),
            revoked_at = null,
            updated_at = now()
      returning id
    `,
    [
      authMe.user.societyId,
      authMe.user.id,
      body.endpoint,
      body.keys.p256dh,
      body.keys.auth,
      userAgent,
      body.deviceLabel ?? null,
      body.browserName ?? null,
      body.platform ?? null,
    ],
  )

  return createApiSuccess(event, { id: result.rows[0]?.id, status: 'ACTIVE' })
})
