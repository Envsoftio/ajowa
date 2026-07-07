import { defineEventHandler } from 'h3'
import type { H3Event } from 'h3'
import { toApiError } from './errors'
import { getRequestLogger } from './logging'

const getErrorDetails = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    }
  }

  return String(error)
}

export const logAmenityApiError = (
  event: H3Event,
  error: unknown,
  extra: Record<string, unknown> = {},
) => {
  getRequestLogger(event).error('Amenity API request failed', {
    method: event.req.method,
    path: event.url.pathname,
    ...extra,
    error: getErrorDetails(error),
  })
}

export const defineAmenityApiHandler = <T>(handler: (event: H3Event) => Promise<T> | T) =>
  defineEventHandler(async (event) => {
    try {
      return await handler(event)
    } catch (error) {
      logAmenityApiError(event, error)
      throw toApiError(error)
    }
  })
