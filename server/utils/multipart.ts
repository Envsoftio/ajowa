import { readMultipartFormData, type H3Event } from 'h3'
import { AppError } from './errors'

export type MultipartFormPart = {
  name: string
  filename?: string
  type: string
  data: Buffer
}

type BodyChunk = ArrayBuffer | Buffer | Uint8Array | string
type BodyStreamSource = {
  on?: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => BodyStreamSource
}
type WebBodySource = {
  arrayBuffer?: () => Promise<ArrayBuffer>
  body?: {
    getReader?: () => {
      read: () => Promise<{ done: boolean; value?: BodyChunk }>
      releaseLock?: () => void
    }
  } | null
}
type EventWithBody = H3Event & {
  _requestBody?: unknown
  web?: {
    request?: WebBodySource
  }
  req?: WebBodySource
}

const getMultipartBoundary = (contentType: string | null | undefined) => {
  const match = contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
  return match?.[1] ?? match?.[2]?.trim() ?? null
}

const getRequestHeaderValue = (event: H3Event, name: string) => {
  const lowerName = name.toLowerCase()
  const webHeaders = event.req?.headers as unknown as Headers | undefined

  if (typeof webHeaders?.get === 'function') {
    return webHeaders.get(lowerName) ?? undefined
  }

  const nodeHeaders = event.node?.req.headers?.[lowerName]

  if (Array.isArray(nodeHeaders)) {
    return nodeHeaders[0]
  }

  return typeof nodeHeaders === 'string' ? nodeHeaders : undefined
}

const bodyChunkToBuffer = (chunk: BodyChunk) => {
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

const readNodeBodyBuffer = (request: BodyStreamSource) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []

    request.on?.('data', (chunk) => {
      chunks.push(bodyChunkToBuffer(chunk as BodyChunk))
    })
    request.on?.('end', () => resolve(Buffer.concat(chunks)))
    request.on?.('error', reject)
  })

const readWebBodyBuffer = async (request: WebBodySource) => {
  if (typeof request.arrayBuffer === 'function') {
    return Buffer.from(await request.arrayBuffer())
  }

  const reader = request.body?.getReader?.()

  if (!reader) {
    return null
  }

  const chunks: Buffer[] = []

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      if (value != null) {
        chunks.push(bodyChunkToBuffer(value))
      }
    }
  } finally {
    reader.releaseLock?.()
  }

  return Buffer.concat(chunks)
}

const normalizeBodyValue = (body: unknown) => {
  if (body == null) {
    return null
  }

  if (
    Buffer.isBuffer(body) ||
    body instanceof ArrayBuffer ||
    body instanceof Uint8Array ||
    typeof body === 'string'
  ) {
    return bodyChunkToBuffer(body)
  }

  return null
}

const readRequestBodyBuffer = async (event: H3Event) => {
  const rawEvent = event as EventWithBody
  const rawBody =
    normalizeBodyValue(rawEvent._requestBody) ??
    normalizeBodyValue(
      (event.node?.req as { rawBody?: unknown } | undefined)?.rawBody,
    ) ??
    normalizeBodyValue(
      (event.node?.req as { body?: unknown } | undefined)?.body,
    )
  const body =
    rawBody ??
    (await readWebBodyBuffer(rawEvent.web?.request ?? rawEvent.req ?? {})) ??
    (event.node?.req && typeof event.node.req.on === 'function'
      ? await readNodeBodyBuffer(event.node.req)
      : null)

  if (body?.byteLength) {
    return body
  }

  throw new AppError({
    code: 'VALIDATION_ERROR',
    statusCode: 400,
    message: 'Unable to read the upload request body.',
  })
}

const toMultipartFormParts = (
  parts: Awaited<ReturnType<typeof readMultipartFormData>>,
): MultipartFormPart[] =>
  (parts ?? []).flatMap((part) => {
    if (!part.name) {
      return []
    }

    return [
      {
        name: part.name,
        ...(part.filename ? { filename: part.filename } : {}),
        type: part.type ?? '',
        data: Buffer.from(part.data),
      },
    ]
  })

const readNativeMultipartFormParts = async (event: H3Event) => {
  try {
    return toMultipartFormParts(await readMultipartFormData(event))
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown multipart parser error.'
    console.warn(
      JSON.stringify({
        level: 'warn',
        message:
          'Native multipart parser failed; falling back to raw multipart parser.',
        cause: message,
      }),
    )

    return null
  }
}

const splitBuffer = (buffer: Buffer, delimiter: Buffer) => {
  const segments: Buffer[] = []
  let cursor = 0
  let index = buffer.indexOf(delimiter, cursor)

  while (index !== -1) {
    segments.push(buffer.subarray(cursor, index))
    cursor = index + delimiter.length
    index = buffer.indexOf(delimiter, cursor)
  }

  segments.push(buffer.subarray(cursor))
  return segments
}

const parseMultipartHeaderParams = (value: string) => {
  const params = new Map<string, string>()
  const regex = /;\s*([^=]+)=("(?:[^"\\]|\\.)*"|[^;]*)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(value))) {
    const key = match[1]?.trim()
    const rawValue = match[2]?.trim() ?? ''

    if (!key) continue

    params.set(
      key,
      rawValue.startsWith('"') && rawValue.endsWith('"')
        ? rawValue.slice(1, -1).replace(/\\"/g, '"')
        : rawValue,
    )
  }

  return params
}

export const readMultipartFormParts = async (
  event: H3Event,
): Promise<MultipartFormPart[]> => {
  const nativeParts = await readNativeMultipartFormParts(event)

  if (nativeParts) {
    return nativeParts
  }

  const boundary = getMultipartBoundary(
    getRequestHeaderValue(event, 'content-type'),
  )

  if (!boundary) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Upload request must be multipart/form-data.',
    })
  }

  let body: Buffer

  try {
    body = await readRequestBodyBuffer(event)
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }

    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Unable to parse the multipart upload request.',
      details: {
        cause:
          error instanceof Error
            ? error.message
            : 'Unknown multipart request error.',
      },
    })
  }
  const delimiter = Buffer.from(`--${boundary}`)
  const headerSeparator = Buffer.from('\r\n\r\n')
  const parts: MultipartFormPart[] = []

  for (let segment of splitBuffer(body, delimiter).slice(1)) {
    if (segment.subarray(0, 2).equals(Buffer.from('--'))) {
      break
    }

    if (segment.subarray(0, 2).equals(Buffer.from('\r\n'))) {
      segment = segment.subarray(2)
    }

    const headerEndIndex = segment.indexOf(headerSeparator)
    if (headerEndIndex === -1) {
      continue
    }

    const headers = new Map<string, string>()
    const headerText = segment.subarray(0, headerEndIndex).toString('latin1')

    for (const line of headerText.split('\r\n')) {
      const separatorIndex = line.indexOf(':')
      if (separatorIndex === -1) continue
      headers.set(
        line.slice(0, separatorIndex).trim().toLowerCase(),
        line.slice(separatorIndex + 1).trim(),
      )
    }

    const disposition = headers.get('content-disposition')
    if (!disposition) {
      continue
    }

    const dispositionParams = parseMultipartHeaderParams(disposition)
    const name = dispositionParams.get('name')

    if (!name) {
      continue
    }

    let data = segment.subarray(headerEndIndex + headerSeparator.length)
    if (data.subarray(-2).equals(Buffer.from('\r\n'))) {
      data = data.subarray(0, -2)
    }

    const filename = dispositionParams.get('filename')
    parts.push({
      name,
      ...(filename ? { filename } : {}),
      type: headers.get('content-type')?.split(';')[0]?.trim() ?? '',
      data,
    })
  }

  return parts
}
