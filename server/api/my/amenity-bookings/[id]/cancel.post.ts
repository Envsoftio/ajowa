import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { defineAmenityApiHandler } from '~/server/utils/amenity-api'
import { requireRole } from '~/server/utils/auth'
import { readUuidParam } from '~/server/utils/master-data'
import { amenityBookingCancelSchema, cancelAmenityBooking } from '~/server/utils/amenity-bookings'

export default defineAmenityApiHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const id = readUuidParam(event)
  const body = validateInput(amenityBookingCancelSchema, await readJsonBody(event))

  return createApiSuccess(event, await cancelAmenityBooking(event, authMe, id, body, 'resident'))
})
