import { createApiSuccess } from '~/server/utils/api'
import { requireAuth } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'

export default defineEventHandler(async (event) => {
  const authMe = await requireAuth(event)
  const result = await queryRows(
    `
      update in_app_notifications
      set is_read = true, read_at = coalesce(read_at, now())
      where user_id = $1 and is_read = false
    `,
    [authMe.user.id],
  )

  return createApiSuccess(event, { updated: result.rowCount ?? 0 })
})
