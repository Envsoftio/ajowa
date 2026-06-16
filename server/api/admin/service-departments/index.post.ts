import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { serviceDepartmentSchema, upsertServiceDepartment } from '~/server/utils/service-requests'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validateInput(serviceDepartmentSchema, await readJsonBody(event))
  const id = await upsertServiceDepartment(authMe, body)

  return createApiSuccess(event, { id })
})
