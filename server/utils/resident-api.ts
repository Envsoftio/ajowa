import { defineEventHandler } from 'h3'
import type { H3Event } from 'h3'
import { AppError, toApiError } from './errors'
import { getRequestLogger } from './logging'
import { handlePgResidentError } from './master-data'

type DatabaseError = {
  code?: string
  constraint?: string
  message?: string
  name?: string
}

const getLoggedError = (error: unknown) => {
  const databaseError =
    error && typeof error === 'object' ? (error as DatabaseError) : {}

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

const translateResidentSaveError = (error: unknown) => {
  try {
    handlePgResidentError(error)
  } catch (translatedError) {
    return translatedError
  }
}

export const throwResidentSaveError = (
  event: H3Event,
  error: unknown,
): never => {
  const logger = getRequestLogger(event)
  const translatedError = translateResidentSaveError(error)

  if (
    !(translatedError instanceof AppError) ||
    translatedError.statusCode >= 500
  ) {
    logger.error('Resident save failed', {
      method: event.method,
      path: event.path,
      error: getLoggedError(error),
    })
  }

  if (translatedError instanceof AppError && translatedError.statusCode < 500) {
    throw toApiError(translatedError)
  }

  throw toApiError(
    new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: `We couldn't save the resident right now. Please try again. If the problem continues, contact support with reference ${logger.requestId}.`,
      details: { requestId: logger.requestId },
    }),
  )
}

export const defineResidentSaveHandler = <T>(
  handler: (event: H3Event) => Promise<T> | T,
) =>
  defineEventHandler(async (event) => {
    try {
      return await handler(event)
    } catch (error) {
      throwResidentSaveError(event, error)
    }
  })
