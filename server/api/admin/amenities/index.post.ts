import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { amenityUpsertSchema, upsertAmenity } from '~/server/utils/amenity-bookings'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validateInput(amenityUpsertSchema, await readJsonBody(event))

  return createApiSuccess(event, await upsertAmenity(authMe, body))
})
