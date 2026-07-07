import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { defineAmenityApiHandler } from '~/server/utils/amenity-api'
import { requireRole } from '~/server/utils/auth'
import { readUuidParam } from '~/server/utils/master-data'
import { amenityBookingRejectSchema, rejectAmenityBooking } from '~/server/utils/amenity-bookings'

export default defineAmenityApiHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const body = validateInput(amenityBookingRejectSchema, await readJsonBody(event))

  return createApiSuccess(event, await rejectAmenityBooking(event, authMe, id, body))
})
