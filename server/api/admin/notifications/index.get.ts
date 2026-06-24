import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'
import { parseListQuery } from '~/server/utils/master-data'

type EventRow = {
  id: string
  event_key: string
  category: string
  priority: string
  status: string
  title: string | null
  body: string | null
  triggered_by_user_id: string | null
  created_at: string
  scheduled_for: string | null
  job_count: string
  sent_count: string
  failed_count: string
  read_count: string
  channel_statuses: string
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = parseListQuery(event)
  const params: unknown[] = [authMe.user.societyId]
  const where = ['ne.society_id = $1']

  if (query.search) {
    params.push(`%${query.search}%`)
    where.push(`(ne.event_key ilike $${params.length} or ne.title ilike $${params.length})`)
  }
  const statusFilter = query.filters.status?.[0]
  if (statusFilter) {
    params.push(statusFilter)
    where.push(`ne.status = $${params.length}`)
  }

  const [items, total] = await Promise.all([
    queryRows<EventRow>(
      `
        select
          ne.id,
          ne.event_key,
          ne.category::text,
          ne.priority::text,
          ne.status::text,
          ne.title,
          ne.body,
          ne.triggered_by_user_id,
          ne.created_at::text,
          ne.scheduled_for::text,
          count(nj.id)::text as job_count,
          count(nj.id) filter (where nj.status in ('SENT', 'DELIVERED', 'READ'))::text as sent_count,
          count(nj.id) filter (where nj.status = 'FAILED')::text as failed_count,
          count(nj.id) filter (where nj.status = 'READ')::text as read_count,
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
        where ${where.join(' and ')}
        group by ne.id
        order by ne.created_at desc
        limit $${params.length + 1} offset $${params.length + 2}
      `,
      [...params, query.pageSize, (query.page - 1) * query.pageSize],
    ),
    queryRows<{ total: string }>(
      `
        select count(*)::text as total
        from notification_events ne
        where ${where.join(' and ')}
      `,
      params,
    ),
  ])

  return createApiSuccess(event, {
    items: items.rows.map((row) => ({
      id: row.id,
      eventKey: row.event_key,
      category: row.category,
      priority: row.priority,
      status: row.status,
      title: row.title,
      body: row.body,
      triggeredByUserId: row.triggered_by_user_id,
      createdAt: row.created_at,
      scheduledFor: row.scheduled_for,
      jobCount: Number(row.job_count),
      sentCount: Number(row.sent_count),
      failedCount: Number(row.failed_count),
      readCount: Number(row.read_count),
      channelStatuses: JSON.parse(row.channel_statuses) as Array<{
        channel: string
        status: string
        count: number
        failureReason: string | null
      }>,
    })),
    total: Number(total.rows[0]?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  })
})
