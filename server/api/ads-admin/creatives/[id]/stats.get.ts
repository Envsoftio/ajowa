import { createApiSuccess, validateInput } from '~/server/utils/api'
import {
  adsStatsQuerySchema,
  getAdsStats,
  requireAdsManagementAuth,
} from '~/server/utils/ads'
import { getQuerySafe, readUuidParam } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const context = await requireAdsManagementAuth(event)
  const id = readUuidParam(event)
  const query = validateInput(adsStatsQuerySchema, getQuerySafe(event))
  const stats = await getAdsStats(context, 'creative', id, query)

  return createApiSuccess(event, stats)
})
