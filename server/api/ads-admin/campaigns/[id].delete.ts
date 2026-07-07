import { createApiSuccess } from '~/server/utils/api'
import {
  archiveAdsCampaign,
  requireAdsManagementAuth,
} from '~/server/utils/ads'
import { readUuidParam } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const context = await requireAdsManagementAuth(event)
  const id = readUuidParam(event)
  const campaign = await archiveAdsCampaign(context, id)

  return createApiSuccess(event, campaign)
})
