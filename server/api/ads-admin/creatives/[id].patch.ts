import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import {
  adsCreativePatchSchema,
  requireAdsManagementAuth,
  updateAdsCreative,
} from '~/server/utils/ads'
import { readUuidParam } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const context = await requireAdsManagementAuth(event)
  const id = readUuidParam(event)
  const body = validateInput(adsCreativePatchSchema, await readJsonBody(event))
  const creative = await updateAdsCreative(context, id, body)

  return createApiSuccess(event, creative)
})
