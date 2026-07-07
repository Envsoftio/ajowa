import { createApiSuccess, validateInput } from '~/server/utils/api'
import { defineAmenityApiHandler } from '~/server/utils/amenity-api'
import { requireRole } from '~/server/utils/auth'
import { readUuidParam, getQuerySafe } from '~/server/utils/master-data'
import { getAmenityAvailability } from '~/server/utils/amenity-bookings'
import { z } from 'zod'

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export default defineAmenityApiHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const id = readUuidParam(event)
  const query = validateInput(querySchema, getQuerySafe(event))

  return createApiSuccess(event, await getAmenityAvailability(authMe, id, query.date))
})
