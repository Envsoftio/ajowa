import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { readUuidParam } from '~/server/utils/master-data'
import { serviceDepartmentSchema, upsertServiceDepartment } from '~/server/utils/service-requests'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const body = validateInput(serviceDepartmentSchema, await readJsonBody(event))
  await upsertServiceDepartment(authMe, body, id)

  return createApiSuccess(event, { id })
})
