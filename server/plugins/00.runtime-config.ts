import {
  getEmailIntegrationStatus,
  getPushIntegrationStatus,
  getValidatedRuntimeConfig,
  getWhatsAppIntegrationStatus,
} from '../utils/env'

export default defineNitroPlugin(() => {
  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())
  const integrationStatuses = [
    getEmailIntegrationStatus(runtimeConfig),
    getWhatsAppIntegrationStatus(runtimeConfig),
    getPushIntegrationStatus(runtimeConfig),
  ]

  for (const status of integrationStatuses) {
    if (!status.enabled) {
      console.warn(JSON.stringify({ level: 'warn', message: status.reason }))
    }
  }
})
