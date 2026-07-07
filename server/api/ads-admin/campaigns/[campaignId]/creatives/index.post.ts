import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import {
  adsCreativeCreateSchema,
  createAdsCreative,
  requireAdsManagementAuth,
} from '~/server/utils/ads'
import { readUuidParam } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const context = await requireAdsManagementAuth(event)
  const campaignId = readUuidParam(event, 'campaignId')
  const body = validateInput(adsCreativeCreateSchema, await readJsonBody(event))
  const creative = await createAdsCreative(context, campaignId, body)

  return createApiSuccess(event, creative)
})
