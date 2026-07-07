import { createApiSuccess } from '~/server/utils/api'
import {
  listAdsCreativesForCampaign,
  requireAdsManagementAuth,
} from '~/server/utils/ads'
import { readUuidParam } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const context = await requireAdsManagementAuth(event)
  const campaignId = readUuidParam(event, 'campaignId')
  const items = await listAdsCreativesForCampaign(context, campaignId)

  return createApiSuccess(event, { items })
})
