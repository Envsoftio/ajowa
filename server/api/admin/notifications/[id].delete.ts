import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)

  const result = await queryRows<{ id: string }>(
    `
      delete from notification_events
      where id = $1
        and society_id = $2
      returning id
    `,
    [id, authMe.user.societyId],
  )

  const deleted = result.rows[0]
  if (!deleted) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Notification row not found.',
    })
  }

  return createApiSuccess(event, { id: deleted.id })
})
