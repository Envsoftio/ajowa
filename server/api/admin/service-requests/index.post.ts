import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { defineServiceRequestCreateHandler } from '~/server/utils/service-request-api'
import {
  createServiceRequest,
  serviceRequestCreateSchema,
} from '~/server/utils/service-requests'

export default defineServiceRequestCreateHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validateInput(
    serviceRequestCreateSchema,
    await readJsonBody(event),
  )
  const ticket = await createServiceRequest(authMe, body, 'admin')

  return createApiSuccess(event, ticket)
})
