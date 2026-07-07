import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { listAmenities } from '~/server/utils/amenity-bookings'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  return createApiSuccess(event, await listAmenities(authMe))
})
