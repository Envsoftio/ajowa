import { ZodError, type z, type ZodType } from 'zod'
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

type BodyChunk = ArrayBuffer | Buffer | Uint8Array | string
type BodyStreamSource = {
  on?: (event: string, listener: (...args: unknown[]) => void) => BodyStreamSource
  setEncoding?: (encoding: BufferEncoding) => void
}
type NodeRequestWithBody = BodyStreamSource & {
  body?: unknown
}
type WebRequestWithBody = {
  text?: () => Promise<string>
  arrayBuffer?: () => Promise<ArrayBuffer>
}

const bodyChunkToString = (chunk: BodyChunk) => {
  if (typeof chunk === 'string') {
    return chunk
  }

  if (chunk instanceof ArrayBuffer) {
    return Buffer.from(chunk).toString('utf8')
  }

  return Buffer.from(chunk).toString('utf8')
}

const readNodeBody = (request: BodyStreamSource) =>
  new Promise<string>((resolve, reject) => {
    let body = ''

    request.setEncoding?.('utf8')
    request.on?.('data', (chunk) => {
      body += bodyChunkToString(chunk as BodyChunk)
    })
    request.on?.('end', () => resolve(body))
    request.on?.('error', reject)
  })

const parseJsonBody = <T>(body: unknown): T => {
  if (body == null || body === '') {
    return {} as T
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as T
    } catch {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'The request body must be valid JSON.',
      })
    }
  }

  if (body instanceof ArrayBuffer || body instanceof Uint8Array || Buffer.isBuffer(body)) {
    const text = bodyChunkToString(body)
    return parseJsonBody<T>(text)
  }

  return body as T
}

export const readJsonBody = async <T = unknown>(event: H3Event): Promise<T> => {
  const nodeRequest = event.node?.req as NodeRequestWithBody | undefined

  if (nodeRequest?.body != null) {
    return parseJsonBody<T>(nodeRequest.body)
  }

  const webRequest = event.req as WebRequestWithBody | undefined
  const body =
    typeof webRequest?.text === 'function'
      ? await webRequest.text()
      : typeof webRequest?.arrayBuffer === 'function'
        ? await webRequest.arrayBuffer()
      : nodeRequest && typeof nodeRequest.on === 'function'
        ? await readNodeBody(nodeRequest)
        : undefined

  return parseJsonBody<T>(body)
}
