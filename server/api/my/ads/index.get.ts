import { createApiSuccess } from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import {
  assertResidentAdSlot,
  listEligibleResidentAds,
} from '~/server/utils/ads'
import { getQuerySafe } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const query = getQuerySafe(event)
  const slotKey = assertResidentAdSlot(query.slot)
  const items = await listEligibleResidentAds(authMe, slotKey)

  return createApiSuccess(event, { items })
})
