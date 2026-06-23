import { HTTPError } from 'h3'
import { createEventError } from './http-event'

export type AppErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'

export type AppErrorOptions = {
  code: AppErrorCode
  statusCode: number
  message: string
  details?: Record<string, unknown> | undefined
}

export class AppError extends HTTPError {
  code: AppErrorCode
  details: Record<string, unknown> | undefined

  constructor(options: AppErrorOptions) {
    const fieldErrors = options.details?.fieldErrors
    const data = {
      code: options.code,
      message: options.message,
      details: options.details,
      fieldErrors:
        fieldErrors && typeof fieldErrors === 'object'
          ? (fieldErrors as Record<string, string[]>)
          : undefined,
    }

    super({
      statusCode: options.statusCode,
      statusMessage: options.code,
      message: options.message,
      data,
      unhandled: false,
    })
    this.code = options.code
    this.details = options.details
  }
}

export const toApiError = (error: unknown) => {
  if (error instanceof AppError) {
    const fieldErrors = error.details?.fieldErrors

    return createEventError({
      statusCode: error.statusCode,
      statusMessage: error.code,
      message: error.message,
      data: {
        code: error.code,
        message: error.message,
        details: error.details,
        fieldErrors:
          fieldErrors && typeof fieldErrors === 'object'
            ? (fieldErrors as Record<string, string[]>)
            : undefined,
      },
    })
  }

  return createEventError({
    statusCode: 500,
    statusMessage: 'INTERNAL_ERROR',
    message: 'Something went wrong.',
    data: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    },
  })
}
