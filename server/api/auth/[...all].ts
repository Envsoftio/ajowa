import { auth } from '~/server/utils/auth'
import { getValidatedRuntimeConfig } from '~/server/utils/env'

type RequestChunk = Buffer | Uint8Array | string

const readNodeRequestBody = async (request: AsyncIterable<RequestChunk>) => {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

export default defineEventHandler(async (event) => {
  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())
  const requestUrl = new URL(event.req.url, runtimeConfig.betterAuthUrl).toString()
  const rawBody =
    event.req.method === 'GET' || event.req.method === 'HEAD'
      ? undefined
      : await readNodeRequestBody(event.req as unknown as AsyncIterable<RequestChunk>)

  const requestInit: RequestInit = {
    method: event.req.method,
    headers: event.req.headers,
  }

  if (rawBody != null) {
    requestInit.body = rawBody
  }

  const request = new Request(requestUrl, requestInit)

  return auth.handler(request)
})
