import { createApiSuccess } from '~/server/utils/api'
import { requireAuth } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'

type NotificationSummaryRow = {
  id: string
  title: string
  body: string
  deep_link_url: string | null
  priority: string
  is_read: boolean
  created_at: string
  category: string | null
}

export default defineEventHandler(async (event) => {
  const authMe = await requireAuth(event)

  const [latestResult, unreadResult] = await Promise.all([
    queryRows<NotificationSummaryRow>(
      `
        select
          ian.id,
          ian.title,
          ian.body,
          ian.deep_link_url,
          ian.priority::text,
          ian.is_read,
          ian.created_at::text,
          ne.category::text
        from in_app_notifications ian
        left join notification_events ne on ne.id = ian.notification_event_id
        where ian.user_id = $1
        order by ian.created_at desc
        limit 5
      `,
      [authMe.user.id],
    ),
    queryRows<{ total: string }>(
      `
        select count(*)::text as total
        from in_app_notifications
        where user_id = $1
          and is_read = false
      `,
      [authMe.user.id],
    ),
  ])

  return createApiSuccess(event, {
    unreadCount: Number(unreadResult.rows[0]?.total ?? 0),
    latest: latestResult.rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      deepLinkUrl: row.deep_link_url,
      priority: row.priority,
      isRead: row.is_read,
      createdAt: row.created_at,
      category: row.category,
    })),
  })
})
