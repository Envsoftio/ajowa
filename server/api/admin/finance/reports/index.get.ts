import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getQuerySafe } from '~/server/utils/master-data'
import { buildReport, parseReportFilters } from '~/server/utils/reports'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const filters = parseReportFilters(getQuerySafe(event))
  const report = await buildReport({ societyId: authMe.user.societyId, filters })

  return createApiSuccess(event, report)
})
