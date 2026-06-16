import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { readUuidParam } from '~/server/utils/master-data'
import { addServiceRequestComment, serviceRequestCommentSchema } from '~/server/utils/service-requests'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const body = validateInput(serviceRequestCommentSchema, await readJsonBody(event))
  const commentId = await addServiceRequestComment(authMe, id, body, 'admin')

  return createApiSuccess(event, { id: commentId })
})
