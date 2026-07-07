import { createApiSuccess } from '~/server/utils/api'
import { defineAmenityApiHandler } from '~/server/utils/amenity-api'
import { requireRole } from '~/server/utils/auth'
import { readUuidParam } from '~/server/utils/master-data'
import { getAmenityBookingDetail } from '~/server/utils/amenity-bookings'

export default defineAmenityApiHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const id = readUuidParam(event)

  return createApiSuccess(event, await getAmenityBookingDetail(authMe, id, 'resident'))
})
