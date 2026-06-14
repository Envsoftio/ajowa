import type { H3Event } from 'h3'
import { getRequestLogger } from '../utils/logging'

export const buildRequestContext = (event: H3Event) => ({
  logger: getRequestLogger(event),
  now: new Date(),
})
