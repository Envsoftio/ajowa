import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getQuerySafe } from '~/server/utils/master-data'
import { listSharedReportLinks } from '~/server/utils/report-shares'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = getQuerySafe(event)
  const status = query.status ? String(query.status) : undefined
  const shares = await listSharedReportLinks(authMe, status)

  return createApiSuccess(event, shares)
})
