import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { readUuidParam } from '~/server/utils/master-data'
import { deleteSharedReportLink, revokeShareSchema } from '~/server/utils/report-shares'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const shareId = readUuidParam(event)
  const body = await readJsonBody(event).catch(() => null)
  const parsed = body ? validateInput(revokeShareSchema, body) : { reason: null }

  const result = await deleteSharedReportLink(event, authMe, shareId, parsed.reason)

  return createApiSuccess(event, result)
})
