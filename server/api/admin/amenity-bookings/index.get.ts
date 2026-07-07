import { createPaginatedSuccess } from '~/server/utils/api'
import { defineAmenityApiHandler } from '~/server/utils/amenity-api'
import { requireRole } from '~/server/utils/auth'
import { listAmenityBookings } from '~/server/utils/amenity-bookings'

export default defineAmenityApiHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const result = await listAmenityBookings(event, authMe, 'admin')

  return createPaginatedSuccess(event, result.items, result.total, result.params)
})
