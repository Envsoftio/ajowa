import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { listServiceDepartments, listServiceStaffOptions } from '~/server/utils/service-requests'
import { getQuerySafe } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = getQuerySafe(event)
  const includeInactive = query.includeInactive !== 'false'
  const departments = await listServiceDepartments(authMe, includeInactive)
  const staff = await listServiceStaffOptions(authMe)

  return createApiSuccess(event, { departments, staff })
})
