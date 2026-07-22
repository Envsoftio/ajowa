import { defineEventHandler } from 'h3'
import type { H3Event } from 'h3'
import { AppError, toApiError } from './errors'
import { getRequestLogger } from './logging'

type DatabaseError = {
  code?: string
  constraint?: string
  message?: string
  name?: string
}

const temporaryDatabaseCodes = new Set([
  '53300',
  '53400',
  '55P03',
  '57P01',
  '57P02',
  '57P03',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'ETIMEDOUT',
])

const schemaMismatchCodes = new Set(['42703', '42883', '42P01', '42P10'])
const validationDatabaseCodes = new Set([
  '22001',
  '22P02',
  '23502',
  '23503',
  '23514',
])

const asDatabaseError = (error: unknown): DatabaseError =>
  error && typeof error === 'object' ? (error as DatabaseError) : {}

const getRequestPath = (event: H3Event) => {
  const rawUrl = event.node?.req.url ?? event.path ?? '/'

  try {
    return new URL(rawUrl, 'http://localhost').pathname
  } catch {
    return String(rawUrl).split('?')[0] || '/'
  }
}

const getLoggedError = (error: unknown) => {
  const databaseError = asDatabaseError(error)

  return {
    name:
      error instanceof Error
        ? error.name
        : (databaseError.name ?? typeof error),
    message:
      error instanceof Error
        ? error.message
        : (databaseError.message ?? String(error)),
    ...(databaseError.code ? { code: databaseError.code } : {}),
    ...(databaseError.constraint
      ? { constraint: databaseError.constraint }
      : {}),
  }
}

const withRequestReference = (requestId: string) => ({ requestId })

export const translateServiceRequestCreateError = (
  error: unknown,
  requestId: string,
) => {
  if (error instanceof AppError) {
    if (error.statusCode < 500) {
      return error
    }

    return new AppError({
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
      details: {
        ...error.details,
        requestId,
      },
    })
  }

  const databaseError = asDatabaseError(error)
  const code = databaseError.code ?? ''
  const message = databaseError.message?.toLowerCase() ?? ''

  if (
    code.startsWith('08') ||
    temporaryDatabaseCodes.has(code) ||
    message.includes('connection timeout') ||
    message.includes('connection terminated') ||
    message.includes('too many clients')
  ) {
    return new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 503,
      message:
        'The service-request system is temporarily unavailable. Please try again in a few minutes.',
      details: withRequestReference(requestId),
    })
  }

  if (schemaMismatchCodes.has(code)) {
    return new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 503,
      message:
        'Service requests are temporarily unavailable while the system is being updated. Please try again shortly.',
      details: withRequestReference(requestId),
    })
  }

  if (validationDatabaseCodes.has(code)) {
    return new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        'Some selected ticket details are no longer valid. Refresh the page, check the form, and try again.',
      details: withRequestReference(requestId),
    })
  }

  if (code === '23505') {
    return new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message:
        'A ticket number conflict occurred. Please submit the request again.',
      details: withRequestReference(requestId),
    })
  }

  if (code === '42501') {
    return new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 503,
      message:
        'Service-request saving is temporarily unavailable. Please contact the society office if this continues.',
      details: withRequestReference(requestId),
    })
  }

  return new AppError({
    code: 'INTERNAL_ERROR',
    statusCode: 500,
    message:
      "We couldn't submit the service request right now. Please try again. If it continues, contact the society office.",
    details: withRequestReference(requestId),
  })
}

export const throwServiceRequestCreateError = (
  event: H3Event,
  error: unknown,
): never => {
  const logger = getRequestLogger(event)

  if (!(error instanceof AppError) || error.statusCode >= 500) {
    logger.error('Service request creation failed', {
      method: event.method,
      path: getRequestPath(event),
      error: getLoggedError(error),
    })
  }

  throw toApiError(translateServiceRequestCreateError(error, logger.requestId))
}

export const defineServiceRequestCreateHandler = <T>(
  handler: (event: H3Event) => Promise<T> | T,
) =>
  defineEventHandler(async (event) => {
    try {
      return await handler(event)
    } catch (error) {
      throwServiceRequestCreateError(event, error)
    }
  })
