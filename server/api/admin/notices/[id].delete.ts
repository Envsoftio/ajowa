import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = getRouterParam(event, 'id')

  await queryRows(
    `
      update notices
      set status = 'ARCHIVED', updated_at = now()
      where id = $1 and society_id = $2
    `,
    [id, authMe.user.societyId],
  )

  return createApiSuccess(event, { id, status: 'ARCHIVED' })
})
