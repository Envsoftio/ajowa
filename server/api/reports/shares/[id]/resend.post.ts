import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { regenerateSharedReportLink } from '~/server/utils/report-shares'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const result = await regenerateSharedReportLink(event, authMe, String(event.context.params?.id))

  return createApiSuccess(event, result)
})
