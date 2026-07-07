import { createApiSuccess } from '~/server/utils/api'
import { defineAmenityApiHandler } from '~/server/utils/amenity-api'
import { requireRole } from '~/server/utils/auth'
import { listAmenityBlackouts } from '~/server/utils/amenity-bookings'

export default defineAmenityApiHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  return createApiSuccess(event, await listAmenityBlackouts(authMe))
})
