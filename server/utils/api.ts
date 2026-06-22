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
  pipe?: unknown
  setEncoding?: (encoding: BufferEncoding) => void
}
type WebBodyStreamSource = {
  getReader?: () => {
    read: () => Promise<{ done: boolean; value?: BodyChunk }>
    releaseLock?: () => void
  }
  pipeTo?: (destination: WritableStream<BodyChunk>) => Promise<void>
}
type NodeRequestWithBody = BodyStreamSource & {
  body?: unknown
  rawBody?: unknown
}
type WebRequestWithBody = {
  body?: unknown
  clone?: () => WebRequestWithBody
  text?: () => Promise<string>
  arrayBuffer?: () => Promise<ArrayBuffer>
}
type EventWithRawBody = H3Event & {
  _requestBody?: unknown
  web?: {
    request?: WebRequestWithBody
  }
  req?: WebRequestWithBody
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

const isReadableBody = (value: unknown): value is BodyStreamSource | WebBodyStreamSource =>
  Boolean(value) &&
  typeof value === 'object' &&
  (typeof (value as WebBodyStreamSource).getReader === 'function' ||
    typeof (value as WebBodyStreamSource).pipeTo === 'function' ||
    typeof (value as BodyStreamSource).on === 'function' ||
    typeof (value as BodyStreamSource).pipe === 'function')

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

const readWebBody = async (stream: WebBodyStreamSource) => {
  const chunks: BodyChunk[] = []

  if (typeof stream.getReader === 'function') {
    const reader = stream.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        if (value != null) {
          chunks.push(value)
        }
      }
    } finally {
      reader.releaseLock?.()
    }
  } else {
    await stream.pipeTo?.(
      new WritableStream({
        write(chunk) {
          chunks.push(chunk)
        },
      }),
    )
  }

  return chunks.map(bodyChunkToString).join('')
}

const readBodyValue = async (body: unknown) => {
  if (!isReadableBody(body)) {
    return body
  }

  if (
    typeof (body as WebBodyStreamSource).getReader === 'function' ||
    typeof (body as WebBodyStreamSource).pipeTo === 'function'
  ) {
    return readWebBody(body as WebBodyStreamSource)
  }

  return readNodeBody(body as BodyStreamSource)
}

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
  const rawEvent = event as EventWithRawBody
  const nodeRequest = event.node?.req as NodeRequestWithBody | undefined
  const bodyCandidates = [
    rawEvent._requestBody,
    nodeRequest?.rawBody,
    nodeRequest?.body,
    rawEvent.web?.request?.body,
    rawEvent.req?.body,
  ]

  for (const candidate of bodyCandidates) {
    if (candidate != null) {
      return parseJsonBody<T>(await readBodyValue(candidate))
    }
  }

  if (nodeRequest && typeof nodeRequest.on === 'function') {
    return parseJsonBody<T>(await readNodeBody(nodeRequest))
  }

  const webRequest = rawEvent.req?.clone?.() ?? rawEvent.req
  const body =
    typeof webRequest?.text === 'function'
      ? await webRequest.text()
      : typeof webRequest?.arrayBuffer === 'function'
        ? await webRequest.arrayBuffer()
        : undefined

  return parseJsonBody<T>(body)
}
