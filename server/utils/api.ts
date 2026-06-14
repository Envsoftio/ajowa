import { ZodError, type ZodType } from 'zod'
import type { H3Event } from 'h3'
import { createPaginatedResult, normalizeListQuery, normalizePaginationParams } from '~/shared/api'
import type {
  ApiSuccessResponse,
  ListQueryParams,
  PaginatedResult,
  PaginationParams,
} from '~/types/api'
import { AppError } from './errors'
import { getRequestLogger } from './logging'

export const createApiSuccess = <T>(event: H3Event, data: T): ApiSuccessResponse<T> => ({
  ok: true,
  data,
  meta: {
    requestId: getRequestLogger(event).requestId,
    timestamp: new Date().toISOString(),
  },
})

export const getPaginationParams = (query: Record<string, unknown>): PaginationParams => {
  return normalizePaginationParams({
    page: Number(query.page ?? 1),
    pageSize: Number(query.pageSize ?? 20),
  })
}

export const getListQueryParams = (query: Record<string, unknown>): ListQueryParams =>
  normalizeListQuery(query)

export const createPaginatedSuccess = <T>(
  event: H3Event,
  items: T[],
  total: number,
  params: PaginationParams,
): ApiSuccessResponse<PaginatedResult<T>> =>
  createApiSuccess(event, createPaginatedResult(items, total, params))

export const validateInput = <T>(schema: ZodType<T>, input: unknown): T => {
  try {
    return schema.parse(input)
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors = error.flatten().fieldErrors

      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'The request payload is invalid.',
        details: {
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
          fieldErrors,
        },
      })
    }

    throw error
  }
}
