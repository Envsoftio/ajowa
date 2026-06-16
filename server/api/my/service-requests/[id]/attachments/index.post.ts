import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { readUuidParam } from '~/server/utils/master-data'
import { createServiceRequestAttachment, serviceRequestAttachmentSchema } from '~/server/utils/service-requests'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const id = readUuidParam(event)
  const body = validateInput(serviceRequestAttachmentSchema, await readJsonBody(event))
  const attachmentId = await createServiceRequestAttachment(authMe, id, body, 'resident')

  return createApiSuccess(event, { id: attachmentId })
})
