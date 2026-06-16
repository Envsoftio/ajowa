import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getServiceRequestQueueSummary } from '~/server/utils/service-requests'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['SERVICE_STAFF'])

  return createApiSuccess(event, {
    summary: await getServiceRequestQueueSummary(authMe, 'service'),
    departments: authMe.departmentAssignments,
  })
})
