import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { readUuidParam } from '~/server/utils/master-data'
import { assignServiceRequest, serviceRequestAssignSchema } from '~/server/utils/service-requests'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const body = validateInput(serviceRequestAssignSchema, await readJsonBody(event))
  await assignServiceRequest(authMe, id, body)

  return createApiSuccess(event, { id })
})
