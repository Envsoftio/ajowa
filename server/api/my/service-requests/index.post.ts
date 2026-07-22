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
  const authMe = await requireRole(event, ['RESIDENT'])
  const body = validateInput(
    serviceRequestCreateSchema,
    await readJsonBody(event),
  )
  const waitUntil =
    typeof event.waitUntil === 'function'
      ? event.waitUntil.bind(event)
      : undefined
  const ticket = await createServiceRequest(authMe, body, 'resident', {
    ...(waitUntil ? { waitUntil } : {}),
  })

  return createApiSuccess(event, ticket)
})
