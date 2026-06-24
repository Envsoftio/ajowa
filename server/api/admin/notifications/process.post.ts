import { z } from 'zod'
import process from 'node:process'
import type { PoolClient } from 'pg'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { dispatchNotificationJobs, requeueFailedNotificationJobs } from '~/server/utils/notifications'

const schema = z.object({
  eventId: z.string().uuid().optional(),
  retryFailed: z.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(25).optional(),
})

type EventJobSummaryRow = {
  event_status: string
  job_count: number
  queued_count: number
  processing_count: number
  retrying_count: number
  sent_count: number
  delivered_count: number
  read_count: number
  failed_count: number
  channel_statuses: string
}

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const defaultProcessLimit = () =>
  parsePositiveInteger(
    process.env.NOTIFICATION_PROCESS_BATCH_SIZE,
    process.env.NETLIFY === 'true' ? 5 : 25,
  )

const getEventJobSummary = async (
  client: PoolClient,
  societyId: string,
  eventId: string,
) => {
  const result = await client.query<EventJobSummaryRow>(
    `
      select
        ne.status::text as event_status,
        count(nj.id)::int as job_count,
        count(nj.id) filter (where nj.status = 'QUEUED')::int as queued_count,
        count(nj.id) filter (where nj.status = 'PROCESSING')::int as processing_count,
        count(nj.id) filter (where nj.status = 'RETRYING')::int as retrying_count,
        count(nj.id) filter (where nj.status = 'SENT')::int as sent_count,
        count(nj.id) filter (where nj.status = 'DELIVERED')::int as delivered_count,
        count(nj.id) filter (where nj.status = 'READ')::int as read_count,
        count(nj.id) filter (where nj.status = 'FAILED')::int as failed_count,
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'channel', channel_stats.channel,
              'status', channel_stats.status,
              'count', channel_stats.count,
              'failureReason', channel_stats.failure_reason
            )
            order by channel_stats.channel, channel_stats.status
          )
          from (
            select
              status_jobs.channel::text as channel,
              status_jobs.status::text as status,
              count(*)::int as count,
              max(status_jobs.failure_reason) filter (where status_jobs.failure_reason is not null) as failure_reason
            from notification_jobs status_jobs
            where status_jobs.notification_event_id = ne.id
            group by status_jobs.channel, status_jobs.status
          ) channel_stats
        ), '[]'::jsonb)::text as channel_statuses
      from notification_events ne
      left join notification_jobs nj on nj.notification_event_id = ne.id
      where ne.id = $1
        and ne.society_id = $2
      group by ne.id
    `,
    [eventId, societyId],
  )
  const row = result.rows[0]

  if (!row) {
    return null
  }

  return {
    eventStatus: row.event_status,
    jobCount: row.job_count,
    queuedCount: row.queued_count,
    processingCount: row.processing_count,
    retryingCount: row.retrying_count,
    sentCount: row.sent_count,
    deliveredCount: row.delivered_count,
    readCount: row.read_count,
    failedCount: row.failed_count,
    channelStatuses: JSON.parse(row.channel_statuses) as Array<{
      channel: string
      status: string
      count: number
      failureReason: string | null
    }>,
  }
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validateInput(schema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    const requeued = body.eventId && body.retryFailed
      ? await requeueFailedNotificationJobs(client, {
          societyId: authMe.user.societyId,
          eventId: body.eventId,
        })
      : 0
    const result = await dispatchNotificationJobs(client, {
      limit: body.limit ?? defaultProcessLimit(),
      societyId: authMe.user.societyId,
      lockTimeoutMinutes: body.eventId ? 1 : 10,
      ...(body.eventId ? { eventId: body.eventId } : {}),
    })
    const eventSummary = body.eventId
      ? await getEventJobSummary(client, authMe.user.societyId, body.eventId)
      : null

    return createApiSuccess(event, {
      ...result,
      requeued,
      ...(eventSummary ? { eventSummary } : {}),
    })
  } finally {
    client.release()
  }
})
