import { createPaginatedSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getServiceRequestQueueSummary, listServiceRequests } from '~/server/utils/service-requests'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const result = await listServiceRequests(event, authMe, 'admin')
  const response = createPaginatedSuccess(event, result.items, result.total, result.params)

  return {
    ...response,
    data: {
      ...response.data,
      summary: await getServiceRequestQueueSummary(authMe, 'admin'),
    },
  }
})
