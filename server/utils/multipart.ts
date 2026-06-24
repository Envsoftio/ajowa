import type { H3Event } from 'h3'
import { AppError } from './errors'

export type MultipartFormPart = {
  name: string
  filename?: string
  type: string
  data: Buffer
}

const getMultipartBoundary = (contentType: string | null | undefined) => {
  const match = contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
  return match?.[1] ?? match?.[2]?.trim() ?? null
}

const getRequestHeaderValue = (event: H3Event, name: string) => {
  const lowerName = name.toLowerCase()
  const nodeHeaders = event.node?.req?.headers
  const nodeValue = nodeHeaders?.[lowerName]

  if (Array.isArray(nodeValue)) {
    return nodeValue.join(', ')
  }

  if (typeof nodeValue === 'string') {
    return nodeValue
  }

  const requestHeaders = (event as unknown as {
    req?: {
      headers?: {
        get?: unknown
      } | Record<string, string | string[] | undefined>
    }
  }).req?.headers

  if (
    requestHeaders &&
    typeof (requestHeaders as { get?: unknown }).get === 'function'
  ) {
    const value = (requestHeaders as { get: (key: string) => string | null }).get(name)
    if (value) return value
  }

  const fallbackValue = (requestHeaders as Record<string, string | string[] | undefined> | undefined)?.[lowerName]

  if (Array.isArray(fallbackValue)) {
    return fallbackValue.join(', ')
  }

  return fallbackValue ?? null
}

const readRequestBodyBuffer = async (event: H3Event) => {
  const nodeRequest = event.node?.req

  if (nodeRequest) {
    const chunks: Buffer[] = []

    for await (const chunk of nodeRequest) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }

    return Buffer.concat(chunks)
  }

  const request = (event as unknown as {
    req?: {
      arrayBuffer?: unknown
    }
  }).req

  if (request && typeof request.arrayBuffer === 'function') {
    return Buffer.from(await (request.arrayBuffer as () => Promise<ArrayBuffer>)())
  }

  throw new AppError({
    code: 'VALIDATION_ERROR',
    statusCode: 400,
    message: 'Unable to read the upload request body.',
  })
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

export const readMultipartFormParts = async (event: H3Event): Promise<MultipartFormPart[]> => {
  const boundary = getMultipartBoundary(getRequestHeaderValue(event, 'content-type'))

  if (!boundary) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Upload request must be multipart/form-data.',
    })
  }

  const body = await readRequestBodyBuffer(event)
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
