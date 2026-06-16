import { createApiSuccess } from '~/server/utils/api'
import { getPushIntegrationStatus, getValidatedRuntimeConfig } from '~/server/utils/env'

export default defineEventHandler((event) => {
  const status = getPushIntegrationStatus()
  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())

  return createApiSuccess(event, {
    enabled: status.enabled,
    publicKey: status.enabled ? runtimeConfig.vapidPublicKey : null,
    reason: status.enabled ? null : status.reason,
  })
})
