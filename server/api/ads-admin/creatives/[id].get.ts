import { createApiSuccess } from '~/server/utils/api'
import { getAdsCreative, requireAdsManagementAuth } from '~/server/utils/ads'
import { readUuidParam } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const context = await requireAdsManagementAuth(event)
  const id = readUuidParam(event)
  const creative = await getAdsCreative(context, id)

  return createApiSuccess(event, creative)
})
