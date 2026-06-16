import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'
import { parseListQuery } from '~/server/utils/master-data'

type NoticeRow = {
  id: string
  title: string
  summary: string | null
  body: string
  priority: string
  status: string
  audience_scope: string | null
  audience_filter: unknown
  deep_link_url: string | null
  is_pinned: boolean
  published_at: string | null
  expires_at: string | null
  created_at: string
  attachment_label: string | null
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = parseListQuery(event)
  const params: unknown[] = [authMe.user.societyId]
  const where = ['society_id = $1']

  if (query.search) {
    params.push(`%${query.search}%`)
    where.push(`(title ilike $${params.length} or body ilike $${params.length})`)
  }
  const statusFilter = query.filters.status?.[0]
  if (statusFilter) {
    params.push(statusFilter)
    where.push(`status = $${params.length}`)
  }

  const [items, total] = await Promise.all([
    queryRows<NoticeRow>(
      `
        select
          id,
          title,
          summary,
          body,
          priority::text,
          status::text,
          audience_scope,
          audience_filter,
          deep_link_url,
          is_pinned,
          published_at::text,
          expires_at::text,
          created_at::text,
          attachment_label
        from notices
        where ${where.join(' and ')}
        order by is_pinned desc, created_at desc
        limit $${params.length + 1} offset $${params.length + 2}
      `,
      [...params, query.pageSize, (query.page - 1) * query.pageSize],
    ),
    queryRows<{ total: string }>(
      `
        select count(*)::text as total
        from notices
        where ${where.join(' and ')}
      `,
      params,
    ),
  ])

  return createApiSuccess(event, {
    items: items.rows.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      body: row.body,
      priority: row.priority,
      status: row.status,
      audienceScope: row.audience_scope,
      audienceFilter: row.audience_filter,
      deepLinkUrl: row.deep_link_url,
      isPinned: row.is_pinned,
      publishedAt: row.published_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      attachmentLabel: row.attachment_label,
    })),
    total: Number(total.rows[0]?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  })
})
