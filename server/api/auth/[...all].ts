import { fromNodeHeaders } from 'better-auth/node'
import { createError } from 'h3'
import type { EventHandlerRequest, H3Event } from 'h3'
import { getAuth } from '~/server/utils/auth'
import { getValidatedRuntimeConfig } from '~/server/utils/env'
import { getRequestLogger } from '~/server/utils/logging'

type AuthEvent = H3Event<EventHandlerRequest>
type RequestChunk = Buffer | Uint8Array | string
type WebRequestLike = {
  method?: string
  url?: string
  headers?: Headers
  arrayBuffer?: () => Promise<ArrayBuffer>
  text?: () => Promise<string>
}

const readNodeRequestBody = async (request: AsyncIterable<RequestChunk>) => {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
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

  const webRequest = event.req as WebRequestLike

  if (typeof webRequest.arrayBuffer === 'function') {
    return webRequest.arrayBuffer()
  }

  if (typeof webRequest.text === 'function') {
    return webRequest.text()
  }

  const nodeRequest = event.node?.req as unknown

  if (
    nodeRequest &&
    typeof (nodeRequest as AsyncIterable<RequestChunk>)[Symbol.asyncIterator] === 'function'
  ) {
    return readNodeRequestBody(nodeRequest as AsyncIterable<RequestChunk>)
  }

  return undefined
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
