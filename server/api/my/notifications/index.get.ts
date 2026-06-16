import { createApiSuccess, getListQueryParams } from '~/server/utils/api'
import { requireAuth } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'

type NotificationRow = {
  id: string
  title: string
  body: string
  deep_link_url: string | null
  priority: string
  is_read: boolean
  read_at: string | null
  created_at: string
  category: string | null
}

export default defineEventHandler(async (event) => {
  const authMe = await requireAuth(event)
  const query = getListQueryParams(getQuery(event))
  const params: unknown[] = [authMe.user.id]
  const where = ['ian.user_id = $1']
  const statusFilter = query.filters.status?.[0]
  const priorityFilter = query.filters.priority?.[0]
  const categoryFilter = query.filters.category?.[0]

  if (statusFilter === 'unread') {
    where.push('ian.is_read = false')
  }
  if (priorityFilter) {
    params.push(priorityFilter)
    where.push(`ian.priority = $${params.length}`)
  }
  if (categoryFilter) {
    params.push(categoryFilter)
    where.push(`ne.category = $${params.length}`)
  }

  const [itemsResult, countResult, unreadResult] = await Promise.all([
    queryRows<NotificationRow>(
      `
        select
          ian.id,
          ian.title,
          ian.body,
          ian.deep_link_url,
          ian.priority::text,
          ian.is_read,
          ian.read_at::text,
          ian.created_at::text,
          ne.category::text
        from in_app_notifications ian
        left join notification_events ne on ne.id = ian.notification_event_id
        where ${where.join(' and ')}
        order by ian.is_read asc, ian.created_at desc
        limit $${params.length + 1} offset $${params.length + 2}
      `,
      [...params, query.pageSize, (query.page - 1) * query.pageSize],
    ),
    queryRows<{ total: string }>(
      `
        select count(*)::text as total
        from in_app_notifications ian
        left join notification_events ne on ne.id = ian.notification_event_id
        where ${where.join(' and ')}
      `,
      params,
    ),
    queryRows<{ total: string }>(
      `
        select count(*)::text as total
        from in_app_notifications
        where user_id = $1 and is_read = false
      `,
      [authMe.user.id],
    ),
  ])

  return createApiSuccess(event, {
    items: itemsResult.rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      deepLinkUrl: row.deep_link_url,
      priority: row.priority,
      isRead: row.is_read,
      readAt: row.read_at,
      createdAt: row.created_at,
      category: row.category,
    })),
    total: Number(countResult.rows[0]?.total ?? 0),
    unreadCount: Number(unreadResult.rows[0]?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  })
})
