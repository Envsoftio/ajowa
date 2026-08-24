import { requireRole } from '~/server/utils/auth'
import { createResidentServiceRequestStatisticsResponse } from '~/server/utils/service-request-statistics'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  return createResidentServiceRequestStatisticsResponse(event, authMe)
})
