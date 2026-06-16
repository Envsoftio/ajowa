import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { createServiceRequest, serviceRequestCreateSchema } from '~/server/utils/service-requests'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const body = validateInput(serviceRequestCreateSchema, await readJsonBody(event))
  const ticket = await createServiceRequest(authMe, body, 'resident')

  return createApiSuccess(event, ticket)
})
