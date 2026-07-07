import { createApiSuccess } from '~/server/utils/api'
import { getAdsCampaign, requireAdsManagementAuth } from '~/server/utils/ads'
import { readUuidParam } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const context = await requireAdsManagementAuth(event)
  const id = readUuidParam(event)
  const campaign = await getAdsCampaign(context, id)

  return createApiSuccess(event, campaign)
})
