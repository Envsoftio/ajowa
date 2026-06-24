import {
  getRequestHeader,
  readMultipartFormData,
  readRawBody,
  type H3Event,
} from 'h3'
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

const readRequestBodyBuffer = async (event: H3Event) => {
  const body = await readRawBody(event, false)

  if (body) {
    return Buffer.from(body)
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
  parts.flatMap((part) => {
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
    const message = error instanceof Error ? error.message : 'Unknown multipart parser error.'
    console.warn(
      JSON.stringify({
        level: 'warn',
        message: 'Native multipart parser failed; falling back to raw multipart parser.',
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

export const readMultipartFormParts = async (event: H3Event): Promise<MultipartFormPart[]> => {
  const nativeParts = await readNativeMultipartFormParts(event)

  if (nativeParts) {
    return nativeParts
  }

  const boundary = getMultipartBoundary(getRequestHeader(event, 'content-type'))

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
        cause: error instanceof Error ? error.message : 'Unknown multipart request error.',
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
