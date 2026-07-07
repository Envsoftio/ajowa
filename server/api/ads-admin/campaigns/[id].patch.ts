import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import {
  adsCampaignPatchSchema,
  requireAdsManagementAuth,
  updateAdsCampaign,
} from '~/server/utils/ads'
import { readUuidParam } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const context = await requireAdsManagementAuth(event)
  const id = readUuidParam(event)
  const body = validateInput(adsCampaignPatchSchema, await readJsonBody(event))
  const campaign = await updateAdsCampaign(context, id, body)

  return createApiSuccess(event, campaign)
})
