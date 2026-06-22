import { ZodError, type z, type ZodType } from 'zod'
import { readBody, type H3Event } from 'h3'
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

export const validateInput = <S extends ZodType>(schema: S, input: unknown): z.output<S> => {
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

export const readJsonBody = async <T = unknown>(event: H3Event): Promise<T> => {
  const body = await readBody(event)

  if (body == null || body === '') {
    return {} as T
  }

  if (typeof body === 'string') {
    return JSON.parse(body) as T
  }

  return body as T
}
