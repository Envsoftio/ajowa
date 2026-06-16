import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { createShareSchema, createSharedReportLink } from '~/server/utils/report-shares'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const input = validateInput(createShareSchema, await readJsonBody(event))
  const result = await createSharedReportLink(event, authMe, input)

  return createApiSuccess(event, result)
})
