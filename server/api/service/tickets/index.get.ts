import { createPaginatedSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getServiceRequestQueueSummary, listServiceRequests } from '~/server/utils/service-requests'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['SERVICE_STAFF'])
  const result = await listServiceRequests(event, authMe, 'service')
  const response = createPaginatedSuccess(event, result.items, result.total, result.params)

  return {
    ...response,
    data: {
      ...response.data,
      summary: await getServiceRequestQueueSummary(authMe, 'service'),
    },
  }
})
