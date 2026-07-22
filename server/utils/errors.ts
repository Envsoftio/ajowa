import { H3Error } from 'h3'
import { createEventError } from './http-event'

export type AppErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'

export type AppErrorOptions = {
  code: AppErrorCode
  statusCode: number
  message: string
  details?: Record<string, unknown> | undefined
}

type AppErrorData = {
  code: AppErrorCode
  message: string
  details?: Record<string, unknown> | undefined
  fieldErrors?: Record<string, string[]> | undefined
}

const publicClientDetailKeys = new Set([
  'conflicts',
  'dependencies',
  'fieldErrors',
  'issues',
  'linkedCount',
  'requestId',
  'unpostedTransactions',
])

const getPublicErrorDetails = (
  statusCode: number,
  details: Record<string, unknown> | undefined,
) => {
  if (!details) {
    return undefined
  }

  if (statusCode >= 500) {
    return typeof details.requestId === 'string'
      ? { requestId: details.requestId }
      : undefined
  }

  const publicDetails = Object.fromEntries(
    Object.entries(details).filter(([key]) => publicClientDetailKeys.has(key)),
  )

  return Object.keys(publicDetails).length > 0 ? publicDetails : undefined
}

export class AppError extends H3Error<AppErrorData> {
  code: AppErrorCode
  details: Record<string, unknown> | undefined

  constructor(options: AppErrorOptions) {
    const publicDetails = getPublicErrorDetails(
      options.statusCode,
      options.details,
    )
    const fieldErrors = publicDetails?.fieldErrors
    const data = {
      code: options.code,
      message: options.message,
      details: publicDetails,
      fieldErrors:
        fieldErrors && typeof fieldErrors === 'object'
          ? (fieldErrors as Record<string, string[]>)
          : undefined,
    }

    super(options.message)
    this.name = 'AppError'
    this.code = options.code
    this.statusCode = options.statusCode
    this.statusMessage = options.code
    this.data = data
    this.unhandled = false
    this.details = options.details
  }
}

export const toApiError = (error: unknown) => {
  if (error instanceof AppError) {
    const publicDetails = getPublicErrorDetails(error.statusCode, error.details)
    const fieldErrors = publicDetails?.fieldErrors

    return createEventError({
      statusCode: error.statusCode,
      statusMessage: error.code,
      message: error.message,
      data: {
        code: error.code,
        message: error.message,
        details: publicDetails,
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
