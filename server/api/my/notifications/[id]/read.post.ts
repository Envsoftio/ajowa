import { createApiSuccess } from '~/server/utils/api'
import { requireAuth } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'

export default defineEventHandler(async (event) => {
  const authMe = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  await queryRows(
    `
      update in_app_notifications
      set is_read = true, read_at = coalesce(read_at, now())
      where id = $1 and user_id = $2
    `,
    [id, authMe.user.id],
  )

  return createApiSuccess(event, { id, isRead: true })
})
