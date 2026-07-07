import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { amenityBlackoutCreateSchema, createAmenityBlackout } from '~/server/utils/amenity-bookings'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validateInput(amenityBlackoutCreateSchema, await readJsonBody(event))

  return createApiSuccess(event, await createAmenityBlackout(event, authMe, body))
})
