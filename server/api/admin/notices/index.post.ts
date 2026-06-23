import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { enqueueNotificationForAudience } from '~/server/utils/notifications'

const audienceSchema = z.object({
  scope: z.enum([
    'ALL_ACTIVE_RESIDENTS',
    'ACTIVE_PUSH_SUBSCRIBERS',
    'BLOCKS',
    'FLATS',
    'USERS',
    'OWNERS',
    'OWNER_OF_FLAT',
    'TENANTS',
    'DEFAULTERS',
    'BILLING_CONTACTS',
  ]),
  userIds: z.array(z.string().uuid()).optional(),
  blockIds: z.array(z.string().uuid()).optional(),
  flatIds: z.array(z.string().uuid()).optional(),
}).superRefine((audience, ctx) => {
  if (audience.scope === 'OWNER_OF_FLAT' && audience.flatIds?.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['flatIds'],
      message: 'Select exactly one flat owner.',
    })
  }
})

const schema = z.object({
  title: z.string().min(3).max(180),
  summary: z.string().max(500).nullable().optional(),
  body: z.string().min(3).max(12000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']).default('MEDIUM'),
  expiresAt: z.string().datetime().nullable().optional(),
  isPinned: z.boolean().default(false),
  audience: audienceSchema.default({ scope: 'ALL_ACTIVE_RESIDENTS' }),
  channels: z.array(z.enum(['PUSH', 'EMAIL', 'WHATSAPP', 'IN_APP'])).default(['IN_APP']),
  publish: z.boolean().default(false),
  attachmentLabel: z.string().max(180).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validateInput(schema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const notice = await client.query<{ id: string }>(
      `
        insert into notices (
          society_id,
          title,
          summary,
          body,
          priority,
          status,
          audience_scope,
          audience_filter,
          deep_link_url,
          is_pinned,
          published_at,
          expires_at,
          created_by_user_id,
          attachment_label
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, null, $9, case when $10 then now() else null end, $11, $12, $13)
        returning id
      `,
      [
        authMe.user.societyId,
        body.title,
        body.summary ?? null,
        body.body,
        body.priority,
        body.publish ? 'PUBLISHED' : 'DRAFT',
        body.audience.scope,
        JSON.stringify(body.audience),
        body.isPinned,
        body.publish,
        body.expiresAt ?? null,
        authMe.user.id,
        body.attachmentLabel ?? null,
      ],
    )

    const noticeId = notice.rows[0]?.id
    const deepLinkUrl = `/my/notices?notice=${noticeId}`
    await client.query('update notices set deep_link_url = $2 where id = $1', [noticeId, deepLinkUrl])

    let queued = { eventId: null as string | null, audienceCount: 0, jobCount: 0 }
    if (body.publish && noticeId) {
      queued = await enqueueNotificationForAudience(client, {
        societyId: authMe.user.societyId,
        eventKey: body.priority === 'EMERGENCY' ? 'emergency.alert' : 'notice.published',
        category: body.priority === 'EMERGENCY' ? 'EMERGENCY_ALERTS' : 'NOTICES_ANNOUNCEMENTS',
        sourceTable: 'notices',
        sourceId: noticeId,
        priority: body.priority,
        title: body.title,
        body: body.summary ?? body.body.slice(0, 240),
        payload: {
          noticeId,
          deepLinkUrl,
          tag: `notice-${noticeId}`,
        },
        idempotencyKey: `notice.published:${noticeId}`,
        idempotencyWindowSeconds: 31536000,
        triggeredByUserId: authMe.user.id,
        channels: body.channels,
        audience: body.audience,
        audienceLabel: body.audience.scope,
      })
      await client.query('update notices set notification_event_id = $2 where id = $1', [noticeId, queued.eventId])
    }

    await client.query('commit')
    return createApiSuccess(event, { id: noticeId, deepLinkUrl, ...queued })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
