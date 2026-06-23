import {
  getPushIntegrationStatus,
  getValidatedRuntimeConfig,
  getWhatsAppIntegrationStatus,
} from '../utils/env'

export default defineNitroPlugin(() => {
  try {
    const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())
    const integrationStatuses = [
      getWhatsAppIntegrationStatus(runtimeConfig),
      getPushIntegrationStatus(runtimeConfig),
    ]

    for (const status of integrationStatuses) {
      if (!status.enabled) {
        console.warn(JSON.stringify({ level: 'warn', message: status.reason }))
      }
    }
  } catch (error) {
    const issues = (error as { issues?: unknown }).issues
    const message = error instanceof Error ? error.message : String(error)

    console.error(JSON.stringify({
      level: 'error',
      message: 'Runtime config validation failed.',
      error: message,
      issues,
    }))
  }
})
