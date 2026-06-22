import type { H3Event } from 'h3'

type EventWithWebResponse = H3Event & {
  res?: {
    headers?: Headers
  }
}

type EventWithRouterParams = H3Event & {
  context?: {
    params?: Record<string, string | undefined>
  }
}

type EventErrorInput = {
  statusCode: number
  statusMessage?: string
  message?: string
  data?: unknown
}

export const getEventQuery = (event: H3Event): Record<string, string | string[]> => {
  const rawUrl = event.url ?? event.node?.req?.url ?? event.req?.url ?? '/'
  const url = rawUrl instanceof URL ? rawUrl : new URL(rawUrl, 'http://localhost')
  const query: Record<string, string | string[]> = {}

  for (const [key, value] of url.searchParams.entries()) {
    const existing = query[key]

    if (existing === undefined) {
      query[key] = value
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      query[key] = [existing, value]
    }
  }

  return query
}

export const getEventRouterParam = (event: H3Event, key: string) =>
  (event as EventWithRouterParams).context?.params?.[key]

export const setEventHeader = (
  event: H3Event,
  name: string,
  value: number | string | string[],
) => {
  if (typeof event.node?.res?.setHeader === 'function') {
    event.node.res.setHeader(name, value)
    return
  }

  const headers = (event as EventWithWebResponse).res?.headers
  if (!headers) {
    return
  }

  if (Array.isArray(value)) {
    headers.delete(name)
    for (const item of value) {
      headers.append(name, item)
    }
  } else {
    headers.set(name, String(value))
  }
}

export const createEventError = (input: EventErrorInput) => {
  const error = new Error(input.message ?? input.statusMessage ?? 'Request failed') as Error & {
    statusCode: number
    statusMessage?: string
    data?: unknown
  }

  error.statusCode = input.statusCode
  if (input.statusMessage !== undefined) {
    error.statusMessage = input.statusMessage
  }
  if (input.data !== undefined) {
    error.data = input.data
  }

  return error
}
