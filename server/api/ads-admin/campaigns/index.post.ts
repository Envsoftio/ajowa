import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import {
  adsCampaignCreateSchema,
  createAdsCampaign,
  requireAdsManagementAuth,
} from '~/server/utils/ads'

export default defineEventHandler(async (event) => {
  const context = await requireAdsManagementAuth(event)
  const body = validateInput(adsCampaignCreateSchema, await readJsonBody(event))
  const campaign = await createAdsCampaign(context, body)

  return createApiSuccess(event, campaign)
})
