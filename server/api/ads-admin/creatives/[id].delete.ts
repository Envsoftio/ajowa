import { createApiSuccess } from '~/server/utils/api'
import {
  archiveAdsCreative,
  requireAdsManagementAuth,
} from '~/server/utils/ads'
import { readUuidParam } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const context = await requireAdsManagementAuth(event)
  const id = readUuidParam(event)
  const creative = await archiveAdsCreative(context, id)

  return createApiSuccess(event, creative)
})
