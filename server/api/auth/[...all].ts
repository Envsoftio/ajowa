import { fromNodeHeaders } from 'better-auth/node'
import { createError } from 'h3'
import type { EventHandlerRequest, H3Event } from 'h3'
import { getAuth } from '~/server/utils/auth'
import { getValidatedRuntimeConfig } from '~/server/utils/env'
import { getRequestLogger } from '~/server/utils/logging'

type AuthEvent = H3Event<EventHandlerRequest>
type BodyChunk = ArrayBuffer | Buffer | Uint8Array | string
type BodyReader = {
  read: () => Promise<ReadableStreamReadResult<BodyChunk>>
  releaseLock?: () => void
}
type BodyStreamLike = {
  getReader?: () => BodyReader
}
type NodeRequestLike = {
  body?: unknown
  on?: (event: string, listener: (...args: unknown[]) => void) => NodeRequestLike
  setEncoding?: (encoding: BufferEncoding) => NodeRequestLike
}
type WebRequestLike = {
  method?: string
  url?: string
  headers?: Headers
  arrayBuffer?: () => Promise<ArrayBuffer>
  text?: () => Promise<string>
}

const chunkToBuffer = (chunk: BodyChunk) => {
  if (Buffer.isBuffer(chunk)) {
    return chunk
  }

  if (typeof chunk === 'string') {
    return Buffer.from(chunk)
  }

  if (chunk instanceof ArrayBuffer) {
    return Buffer.from(chunk)
  }

  return Buffer.from(chunk)
}

const readBodyStream = async (stream: BodyStreamLike) => {
  const reader = stream.getReader?.()

  if (!reader) {
    return undefined
  }

  const chunks: Buffer[] = []

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      if (value != null) {
        chunks.push(chunkToBuffer(value))
      }
    }
  } finally {
    reader.releaseLock?.()
  }

  return Buffer.concat(chunks).toString('utf8')
}

const readBodySource = async (source: unknown) => {
  if (source == null) {
    return undefined
  }

  if (typeof source === 'string') {
    return source
  }

  if (Buffer.isBuffer(source)) {
    return source.toString('utf8')
  }

  if (source instanceof ArrayBuffer) {
    return Buffer.from(source).toString('utf8')
  }

  if (source instanceof Uint8Array) {
    return Buffer.from(source).toString('utf8')
  }

  return readBodyStream(source as BodyStreamLike)
}

const readNodeRequestBody = async (request: NodeRequestLike) => {
  if (typeof request.on !== 'function') {
    return undefined
  }

  return await new Promise<string>((resolve, reject) => {
    let body = ''

    request.setEncoding?.('utf8')
    request.on?.('data', (chunk) => {
      body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
    })
    request.on?.('end', () => resolve(body))
    request.on?.('error', reject)
  })
}

const getRequestMethod = (event: AuthEvent) => event.node?.req.method ?? event.req.method

const getRequestUrl = (event: AuthEvent, baseUrl: string) => {
  const rawUrl = event.node?.req.url ?? event.req.url ?? '/'
  return new URL(rawUrl, baseUrl).toString()
}

const getRequestHeaders = (event: AuthEvent) => {
  if (event.node?.req.headers) {
    return fromNodeHeaders(event.node.req.headers)
  }

  return new Headers((event.req as WebRequestLike).headers)
}

const readRequestBody = async (event: AuthEvent) => {
  const method = getRequestMethod(event)

  if (method === 'GET' || method === 'HEAD') {
    return undefined
  }

  const nodeRequest = event.node?.req as NodeRequestLike | undefined

  if (nodeRequest?.body != null) {
    return readBodySource(nodeRequest.body)
  }

  const webRequest = event.req as WebRequestLike

  if (typeof webRequest.arrayBuffer === 'function') {
    return webRequest.arrayBuffer()
  }

  if (typeof webRequest.text === 'function') {
    return webRequest.text()
  }

  return nodeRequest ? readNodeRequestBody(nodeRequest) : undefined
}

const serializeError = (error: unknown) => {
  const issues = (error as { issues?: unknown }).issues

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      issues,
    }
  }

  return {
    message: String(error),
    issues,
  }
}

export default defineEventHandler(async (event) => {
  const logger = getRequestLogger(event)

  try {
    const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())
    const rawBody = await readRequestBody(event)
    const requestInit: RequestInit = {
      method: getRequestMethod(event),
      headers: getRequestHeaders(event),
    }

    if (rawBody != null) {
      requestInit.body = rawBody
    }

    const request = new Request(getRequestUrl(event, runtimeConfig.betterAuthUrl), requestInit)

    return getAuth().handler(request)
  } catch (error) {
    logger.error('Auth handler failed', serializeError(error))

    throw createError({
      statusCode: 500,
      statusMessage: 'AUTH_HANDLER_FAILED',
      data: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication service is temporarily unavailable.',
      },
    })
  }
})
