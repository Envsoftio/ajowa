import { createApiSuccess } from '~/server/utils/api'
import { defineAmenityApiHandler } from '~/server/utils/amenity-api'
import { requireRole } from '~/server/utils/auth'
import { clearAmenityBlackout } from '~/server/utils/amenity-bookings'
import { readUuidParam } from '~/server/utils/master-data'

export default defineAmenityApiHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)

  return createApiSuccess(event, await clearAmenityBlackout(event, authMe, id))
})
