import type { H3Event } from 'h3'
import { getHeader, setHeader } from 'h3'
import { randomUUID } from 'node:crypto'

type RequestLogger = {
  requestId: string
  info: (message: string, extra?: Record<string, unknown>) => void
  error: (message: string, extra?: Record<string, unknown>) => void
}

const REQUEST_LOGGER_KEY = 'ajowa:request-logger'

export const getRequestLogger = (event: H3Event): RequestLogger => {
  const context = event.context as Record<string, unknown>
  const existing = context[REQUEST_LOGGER_KEY] as RequestLogger | undefined

  if (existing) {
    return existing
  }

  const requestId = getHeader(event, 'x-request-id') ?? randomUUID()

  const logger: RequestLogger = {
    requestId,
    info(message, extra = {}) {
      console.info(JSON.stringify({ level: 'info', requestId, message, ...extra }))
    },
    error(message, extra = {}) {
      console.error(JSON.stringify({ level: 'error', requestId, message, ...extra }))
    },
  }

  setHeader(event, 'x-request-id', requestId)
  context[REQUEST_LOGGER_KEY] = logger

  return logger
}
