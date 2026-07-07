import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getResidentAmenityOptions } from '~/server/utils/amenity-bookings'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  return createApiSuccess(event, await getResidentAmenityOptions(authMe))
})
