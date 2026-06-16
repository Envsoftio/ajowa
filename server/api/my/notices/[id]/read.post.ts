import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const id = getRouterParam(event, 'id')

  await queryRows(
    `
      insert into notice_reads (notice_id, user_id, read_at)
      select id, $2, now()
      from notices
      where id = $1
        and society_id = $3
        and status = 'PUBLISHED'
      on conflict (notice_id, user_id) do update
        set read_at = coalesce(notice_reads.read_at, now())
    `,
    [id, authMe.user.id, authMe.user.societyId],
  )

  return createApiSuccess(event, { id, isRead: true })
})
