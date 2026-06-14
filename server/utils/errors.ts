import { createError } from 'h3'

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

export class AppError extends Error {
  code: AppErrorCode
  statusCode: number
  details: Record<string, unknown> | undefined

  constructor(options: AppErrorOptions) {
    super(options.message)
    this.name = 'AppError'
    this.code = options.code
    this.statusCode = options.statusCode
    this.details = options.details
  }
}

export const toApiError = (error: unknown) => {
  if (error instanceof AppError) {
    const fieldErrors = error.details?.fieldErrors

    return createError({
      statusCode: error.statusCode,
      statusMessage: error.code,
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

  return createError({
    statusCode: 500,
    statusMessage: 'INTERNAL_ERROR',
    data: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    },
  })
}
