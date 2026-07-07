import { createApiSuccess } from '~/server/utils/api'
import { defineAmenityApiHandler } from '~/server/utils/amenity-api'
import { requireRole } from '~/server/utils/auth'
import { readUuidParam } from '~/server/utils/master-data'
import { completeAmenityBooking } from '~/server/utils/amenity-bookings'

export default defineAmenityApiHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)

  return createApiSuccess(event, await completeAmenityBooking(event, authMe, id))
})
