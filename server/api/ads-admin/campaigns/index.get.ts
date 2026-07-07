import { createApiSuccess } from '~/server/utils/api'
import { listAdsCampaigns, requireAdsManagementAuth } from '~/server/utils/ads'

export default defineEventHandler(async (event) => {
  const context = await requireAdsManagementAuth(event)
  const items = await listAdsCampaigns(context)

  return createApiSuccess(event, { items })
})
