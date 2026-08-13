import { createApiSuccess } from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import {
  getEasebuzzIntegrationStatus,
  getValidatedRuntimeConfig,
} from '~/server/utils/env'

export default defineEventHandler(async (event) => {
  await requireActiveUser(event)
  const status = getEasebuzzIntegrationStatus(
    getValidatedRuntimeConfig(useRuntimeConfig()),
  )
  return createApiSuccess(event, { enabled: status.enabled })
})
