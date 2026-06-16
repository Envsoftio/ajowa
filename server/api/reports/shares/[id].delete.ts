import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { revokeShareSchema, revokeSharedReportLink } from '~/server/utils/report-shares'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validateInput(revokeShareSchema, await readJsonBody(event))
  const share = await revokeSharedReportLink(event, authMe, String(event.context.params?.id), body.reason)

  return createApiSuccess(event, share)
})
