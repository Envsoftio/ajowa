import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { readUuidParam } from '~/server/utils/master-data'
import {
  serviceRequestStatusSchema,
  updateServiceRequestStatus,
} from '~/server/utils/service-requests'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['SERVICE_STAFF'])
  const id = readUuidParam(event)
  const body = validateInput(
    serviceRequestStatusSchema,
    await readJsonBody(event),
  )
  await updateServiceRequestStatus(authMe, id, body, 'service', {
    waitUntil: event.waitUntil.bind(event),
  })

  return createApiSuccess(event, { id })
})
