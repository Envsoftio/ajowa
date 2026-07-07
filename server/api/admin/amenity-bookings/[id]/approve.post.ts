import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { readUuidParam } from '~/server/utils/master-data'
import { amenityBookingApproveSchema, approveAmenityBooking } from '~/server/utils/amenity-bookings'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const body = validateInput(amenityBookingApproveSchema, await readJsonBody(event))

  return createApiSuccess(event, await approveAmenityBooking(event, authMe, id, body))
})
