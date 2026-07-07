import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { amenityBookingCreateSchema, createAmenityBooking } from '~/server/utils/amenity-bookings'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const body = validateInput(amenityBookingCreateSchema, await readJsonBody(event))

  return createApiSuccess(event, await createAmenityBooking(event, authMe, body))
})
