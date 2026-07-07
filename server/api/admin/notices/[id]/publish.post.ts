import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { enqueueNotificationForAudience } from '~/server/utils/notifications'
import type { NotificationAudienceFilter } from '~/server/utils/notifications'

const schema = z.object({
  channels: z.array(z.enum(['PUSH', 'EMAIL', 'WHATSAPP', 'IN_APP'])).min(1),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Notice id is required' })
  }
  const body = validateInput(schema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const noticeResult = await client.query<{
      title: string
      summary: string | null
      body: string
      priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY'
      audience_filter: NotificationAudienceFilter
    }>(
      `
        select title, summary, body, priority::text, audience_filter
        from notices
        where id = $1 and society_id = $2
        limit 1
      `,
      [id, authMe.user.societyId],
    )
    const notice = noticeResult.rows[0]

    if (!notice) {
      throw createError({ statusCode: 404, statusMessage: 'Notice not found' })
    }

    const deepLinkUrl = `/my/notices?notice=${id}`
    const queued = await enqueueNotificationForAudience(client, {
      societyId: authMe.user.societyId,
      eventKey: notice.priority === 'EMERGENCY' ? 'emergency.alert' : 'notice.published',
      category: notice.priority === 'EMERGENCY' ? 'EMERGENCY_ALERTS' : 'NOTICES_ANNOUNCEMENTS',
      sourceTable: 'notices',
      sourceId: id,
      priority: notice.priority,
      title: notice.title,
      body: notice.summary ?? notice.body.slice(0, 240),
      payload: { noticeId: id, deepLinkUrl, tag: `notice-${id}` },
      idempotencyKey: `notice.published:${id}`,
      idempotencyWindowSeconds: 31536000,
      triggeredByUserId: authMe.user.id,
      channels: body.channels,
      audience: notice.audience_filter,
      audienceLabel: notice.audience_filter.scope,
    })
    await client.query(
      `
        update notices
        set status = 'PUBLISHED',
            published_at = coalesce(published_at, now()),
            deep_link_url = $2,
            notification_event_id = $3,
            updated_at = now()
        where id = $1
      `,
      [id, deepLinkUrl, queued.eventId],
    )
    await client.query('commit')

    return createApiSuccess(event, { ...queued, dispatch: null })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
