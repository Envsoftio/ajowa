import { createApiSuccess, validateInput } from '~/server/utils/api'
import {
  adsAdminEventsQuerySchema,
  listAdsEvents,
  requireAdsManagementAuth,
} from '~/server/utils/ads'
import { getQuerySafe } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const context = await requireAdsManagementAuth(event)
  const query = validateInput(adsAdminEventsQuerySchema, getQuerySafe(event))
  const result = await listAdsEvents(context, query)

  return createApiSuccess(event, result)
})
