import { createApiSuccess } from '../utils/api'

export default defineEventHandler((event) => {
  return createApiSuccess(event, {
    status: 'ok',
    service: 'ajowa',
    timestamp: new Date().toISOString(),
  })
})
