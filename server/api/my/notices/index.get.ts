import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const result = await queryRows<{
    id: string
    title: string
    summary: string | null
    body: string
    priority: string
    is_pinned: boolean
    published_at: string | null
    expires_at: string | null
    attachment_file_id: string | null
    attachment_label: string | null
    read_at: string | null
    dismissed_at: string | null
  }>(
    `
      select
        n.id,
        n.title,
        n.summary,
        n.body,
        n.priority::text,
        n.is_pinned,
        n.published_at::text,
        n.expires_at::text,
        n.attachment_file_id::text,
        n.attachment_label,
        nr.read_at::text,
        nr.dismissed_at::text
      from notices n
      left join notice_reads nr on nr.notice_id = n.id and nr.user_id = $2
      where n.society_id = $1
        and n.status = 'PUBLISHED'
        and (n.expires_at is null or n.expires_at > now())
      order by n.is_pinned desc, n.published_at desc nulls last, n.created_at desc
    `,
    [authMe.user.societyId, authMe.user.id],
  )

  return createApiSuccess(event, {
    items: result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      body: row.body,
      priority: row.priority,
      isPinned: row.is_pinned,
      publishedAt: row.published_at,
      expiresAt: row.expires_at,
      attachmentFileId: row.attachment_file_id,
      attachmentLabel: row.attachment_label,
      attachmentUrl: row.attachment_file_id ? `/api/my/notices/${row.id}/attachment` : null,
      isRead: Boolean(row.read_at),
      readAt: row.read_at,
      dismissedAt: row.dismissed_at,
    })),
  })
})
