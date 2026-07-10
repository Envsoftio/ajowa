type FileDisposition = 'inline' | 'attachment'

type FileResponseInput = {
  buffer: Buffer | Uint8Array
  fileName: string
  mimeType?: string | null
  disposition?: FileDisposition
  cacheControl?: string
}

const fallbackFileName = 'attachment'

const stripHeaderControlCharacters = (value: string) =>
  Array.from(value).filter((character) => {
    const code = character.charCodeAt(0)

    return code > 31 && code !== 127
  }).join('')

const sanitizeFileName = (value: string, fallback = fallbackFileName) => {
  const sanitized = stripHeaderControlCharacters(value)
    .replace(/[\\/]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

  return sanitized || fallback
}

const asciiFileName = (value: string, fallback = fallbackFileName) => {
  const ascii = sanitizeFileName(value, fallback)
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/["\\;]/g, '')
    .trim()

  return ascii || fallback
}

const encodeRFC5987Value = (value: string) =>
  encodeURIComponent(value).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )

export const createContentDisposition = (
  disposition: FileDisposition,
  fileName: string,
) => {
  const safeFileName = sanitizeFileName(fileName)
  const fallbackName = asciiFileName(safeFileName)

  return `${disposition}; filename="${fallbackName}"; filename*=UTF-8''${encodeRFC5987Value(safeFileName)}`
}

export const createFileResponse = (input: FileResponseInput) => {
  const disposition = input.disposition ?? 'inline'

  return new Response(new Uint8Array(input.buffer), {
    headers: {
      'cache-control': input.cacheControl ?? 'private, no-store',
      'content-disposition': createContentDisposition(disposition, input.fileName),
      'content-length': String(input.buffer.byteLength),
      'content-type': input.mimeType?.trim() || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    },
  })
}
