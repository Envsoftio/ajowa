import { createApiSuccess } from '~/server/utils/api'
import { getOptionalAuth } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const authMe = await getOptionalAuth(event)
  return createApiSuccess(event, authMe)
})
