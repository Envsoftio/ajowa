import { createPaginatedSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { listServiceRequests } from '~/server/utils/service-requests'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const result = await listServiceRequests(event, authMe, 'resident')

  return createPaginatedSuccess(event, result.items, result.total, result.params)
})
