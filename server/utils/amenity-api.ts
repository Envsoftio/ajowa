import { defineEventHandler } from 'h3'
import type { H3Event } from 'h3'
import { toApiError } from './errors'
import { getRequestLogger } from './logging'

type EventWithRequestInfo = H3Event & {
  path?: string
  req?: {
    method?: string
    url?: string | URL
  }
  node?: {
    req?: {
      method?: string
      url?: string
    }
  }
  url?: string | URL | { pathname?: unknown }
}

const getErrorDetails = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    }
  }

  return String(error)
}

const getRequestMethodSafe = (event: H3Event) => {
  const requestEvent = event as EventWithRequestInfo

  return requestEvent.req?.method ?? requestEvent.node?.req?.method ?? 'UNKNOWN'
}

const getRequestPathSafe = (event: H3Event) => {
  const requestEvent = event as EventWithRequestInfo
  const url =
    requestEvent.url ??
    requestEvent.path ??
    requestEvent.node?.req?.url ??
    requestEvent.req?.url ??
    '/'

  if (typeof url === 'object' && url !== null && typeof url.pathname === 'string') {
    return url.pathname
  }

  const rawUrl = String(url || '/')

  try {
    return new URL(rawUrl, 'http://localhost').pathname
  } catch {
    return rawUrl.split('?')[0] || '/'
  }
}

export const logAmenityApiError = (
  event: H3Event,
  error: unknown,
  extra: Record<string, unknown> = {},
) => {
  getRequestLogger(event).error('Amenity API request failed', {
    method: getRequestMethodSafe(event),
    path: getRequestPathSafe(event),
    ...extra,
    error: getErrorDetails(error),
  })
}

export const defineAmenityApiHandler = <T>(handler: (event: H3Event) => Promise<T> | T) =>
  defineEventHandler(async (event) => {
    try {
      return await handler(event)
    } catch (error) {
      try {
        logAmenityApiError(event, error)
      } catch (loggingError) {
        console.error(JSON.stringify({
          level: 'error',
          message: 'Amenity API error logging failed',
          error: getErrorDetails(loggingError),
          originalError: getErrorDetails(error),
        }))
      }
      throw toApiError(error)
    }
  })
