import { createError } from 'h3'
import type { H3Event } from 'h3'

type EventWithWebResponse = H3Event & {
  res?: {
    headers?: Headers
  }
}

type HeaderRecord = Record<string, string | string[] | undefined>

type EventWithRequestHeaders = H3Event & {
  req?: {
    headers?: Headers | HeaderRecord
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

const normalizeHeaderValue = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

const readHeaderValue = (headers: Headers | HeaderRecord | undefined, name: string) => {
  if (!headers) {
    return undefined
  }

  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined
  }

  const lowerName = name.toLowerCase()
  const record = headers as HeaderRecord
  const directValue = normalizeHeaderValue(record[lowerName] ?? record[name])

  if (directValue !== undefined) {
    return directValue
  }

  const matchingValue = Object.entries(record).find(
    ([key]) => key.toLowerCase() === lowerName,
  )?.[1]

  return normalizeHeaderValue(matchingValue)
}

export const getEventHeader = (event: H3Event, name: string) =>
  readHeaderValue((event as EventWithRequestHeaders).req?.headers, name) ??
  readHeaderValue(event.node?.req.headers, name)

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
  const details: {
    statusCode: number
    statusMessage?: string
    message: string
    data?: unknown
  } = {
    statusCode: input.statusCode,
    message: input.message ?? input.statusMessage ?? 'Request failed',
  }

  if (input.statusMessage !== undefined) {
    details.statusMessage = input.statusMessage
  }
  if (input.data !== undefined) {
    details.data = input.data
  }

  return createError(details)
}
