import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { clearAmenityBlackout } from '~/server/utils/amenity-bookings'
import { toApiError } from '~/server/utils/errors'
import { getRequestLogger } from '~/server/utils/logging'
import { readUuidParam } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const logger = getRequestLogger(event)
  let id: string | null = null

  try {
    const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
    id = readUuidParam(event)

    return createApiSuccess(event, await clearAmenityBlackout(event, authMe, id))
  } catch (error) {
    logger.error('Amenity blackout clear failed', {
      blackoutId: id,
      error: error instanceof Error
        ? {
            name: error.name,
            message: error.message,
          }
        : String(error),
    })

    throw toApiError(error)
  }
})
