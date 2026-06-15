import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'

type RequestLogger = {
  requestId: string
  info: (message: string, extra?: Record<string, unknown>) => void
  error: (message: string, extra?: Record<string, unknown>) => void
}

const REQUEST_LOGGER_KEY = 'ajowa:request-logger'

const getRequestHeaderValue = (event: H3Event, name: string) => {
  const lowerName = name.toLowerCase()
  const webHeaders = event.req?.headers as Headers | undefined

  if (typeof webHeaders?.get === 'function') {
    return webHeaders.get(lowerName) ?? undefined
  }

  const nodeHeaders = event.node?.req.headers?.[lowerName]

  if (Array.isArray(nodeHeaders)) {
    return nodeHeaders[0]
  }

  return typeof nodeHeaders === 'string' ? nodeHeaders : undefined
}

export const getRequestLogger = (event: H3Event): RequestLogger => {
  const context = event.context as Record<string, unknown>
  const existing = context[REQUEST_LOGGER_KEY] as RequestLogger | undefined

  if (existing) {
    return existing
  }

  const requestId = getRequestHeaderValue(event, 'x-request-id') ?? randomUUID()

  const logger: RequestLogger = {
    requestId,
    info(message, extra = {}) {
      console.info(JSON.stringify({ level: 'info', requestId, message, ...extra }))
    },
    error(message, extra = {}) {
      console.error(JSON.stringify({ level: 'error', requestId, message, ...extra }))
    },
  }

  const webResponseHeaders = (event as H3Event & { res?: { headers?: Headers } }).res?.headers

  if (typeof webResponseHeaders?.set === 'function') {
    webResponseHeaders.set('x-request-id', requestId)
  } else if (typeof event.node?.res?.setHeader === 'function' && !event.node.res.headersSent) {
    event.node.res.setHeader('x-request-id', requestId)
  }

  context[REQUEST_LOGGER_KEY] = logger

  return logger
}
