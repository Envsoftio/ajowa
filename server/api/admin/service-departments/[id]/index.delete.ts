import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { readUuidParam } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)

  await getDatabasePool().query(
    `
      update service_departments
      set is_active = false,
          updated_at = now()
      where id = $1 and society_id = $2
    `,
    [id, authMe.user.societyId],
  )

  return createApiSuccess(event, { id })
})
