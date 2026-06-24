import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import type { PoolClient } from 'pg'
import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import {
  createStorageObjectKey,
  deletePrivateFile,
  uploadPrivateFile,
} from '~/server/utils/storage'
import type { SocietyPaymentQrFile } from '~/types/domain'

const allowedPaymentQrMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
])

const normalizePaymentQrMimeType = (mimeType: string) =>
  mimeType === 'image/jpg' || mimeType === 'image/pjpeg'
    ? 'image/jpeg'
    : mimeType

type MultipartFilePart = {
  filename: string
  type: string
  data: Buffer
}

type PaymentQrStoredFile = {
  id: string
  storageObjectKey: string
  originalFileName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
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

const readPaymentQrMultipartFile = async (event: H3Event): Promise<MultipartFilePart | null> => {
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
    const fieldName = dispositionParams.get('name')
    const filename = dispositionParams.get('filename')

    if (fieldName !== 'file' || !filename) {
      continue
    }

    let data = segment.subarray(headerEndIndex + headerSeparator.length)
    if (data.subarray(-2).equals(Buffer.from('\r\n'))) {
      data = data.subarray(0, -2)
    }

    return {
      filename,
      type: headers.get('content-type')?.split(';')[0]?.trim() ?? '',
      data,
    }
  }

  return null
}

const toPaymentQrFile = (
  file: PaymentQrStoredFile,
): SocietyPaymentQrFile => ({
  id: file.id,
  fileName: file.originalFileName,
  mimeType: file.mimeType,
  sizeBytes: file.sizeBytes,
  uploadedAt: file.uploadedAt,
  downloadUrl: '/api/admin/society/payment-qr',
})

const ensurePaymentQrFileMetadata = async (
  client: PoolClient,
  input: {
    file: PaymentQrStoredFile
    uploadedBy: string
    societyId: string
    checksum: string
  },
) => {
  await client.query(
    `
      insert into file_objects (
        id,
        storage_target_key,
        storage_object_key,
        original_file_name,
        mime_type,
        size_bytes,
        checksum,
        uploaded_by,
        uploaded_at,
        related_record_type,
        related_record_id,
        upload_status,
        last_error,
        created_at,
        updated_at
      )
      values (
        $1,
        'qr_images',
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        coalesce($8::timestamptz, now()),
        'society_profile',
        $9,
        'READY',
        null,
        now(),
        now()
      )
      on conflict (id) do update
      set
        storage_target_key = excluded.storage_target_key,
        storage_object_key = excluded.storage_object_key,
        original_file_name = excluded.original_file_name,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        checksum = excluded.checksum,
        uploaded_by = excluded.uploaded_by,
        uploaded_at = excluded.uploaded_at,
        related_record_type = excluded.related_record_type,
        related_record_id = excluded.related_record_id,
        upload_status = 'READY',
        last_error = null,
        updated_at = now()
    `,
    [
      input.file.id,
      input.file.storageObjectKey,
      input.file.originalFileName,
      input.file.mimeType,
      input.file.sizeBytes,
      input.checksum,
      input.uploadedBy,
      input.file.uploadedAt,
      input.societyId,
    ],
  )
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const filePart = await readPaymentQrMultipartFile(event)

  if (!filePart?.filename || !filePart.type) {
    throw createError({ statusCode: 400, statusMessage: 'A payment QR image is required.' })
  }

  if (!allowedPaymentQrMimeTypes.has(filePart.type)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Upload a PNG or JPG payment QR image.',
    })
  }
  const mimeType = normalizePaymentQrMimeType(filePart.type)

  const pool = getDatabasePool()
  const existingResult = await pool.query<{
    id: string
    payment_qr_file_id: string | null
    storage_object_key: string | null
  }>(
    `
      select
        sp.id,
        sp.payment_qr_file_id,
        payment_qr.storage_object_key
      from society_profile sp
      left join file_objects payment_qr on payment_qr.id = sp.payment_qr_file_id
      where sp.id = $1
      limit 1
    `,
    [authMe.user.societyId],
  )
  const society = existingResult.rows[0]

  if (!society) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Society profile not found.',
    })
  }

  const storageObjectKey = createStorageObjectKey({
    recordType: 'society-payment-qr',
    recordId: authMe.user.societyId,
    fileName: filePart.filename,
  })
  const checksum = createHash('sha256').update(filePart.data).digest('hex')
  const storedFile = await uploadPrivateFile({
    storageTargetKey: 'qr_images',
    storageObjectKey,
    originalFileName: filePart.filename,
    mimeType,
    sizeBytes: filePart.data.byteLength,
    body: filePart.data,
    uploadedBy: authMe.user.id,
    relation: {
      recordType: 'society_profile',
      recordId: authMe.user.societyId,
    },
    checksum,
  })
  const client = await pool.connect()

  try {
    await client.query('begin')
    await ensurePaymentQrFileMetadata(client, {
      file: storedFile,
      uploadedBy: authMe.user.id,
      societyId: authMe.user.societyId,
      checksum,
    })
    await client.query(
      `
        update society_profile
        set payment_qr_file_id = $2,
            updated_at = now()
        where id = $1
      `,
      [authMe.user.societyId, storedFile.id],
    )
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch((rollbackError) => {
      console.warn(
        JSON.stringify({
          level: 'warn',
          message: 'Unable to roll back payment QR profile update.',
          fileId: storedFile.id,
          cause: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        }),
      )
    })
    await deletePrivateFile({
      storageTargetKey: 'qr_images',
      storageObjectKey: storedFile.storageObjectKey,
      fileId: storedFile.id,
    }).catch((cleanupError) => {
      console.warn(
        JSON.stringify({
          level: 'warn',
          message: 'Unable to clean up payment QR upload after profile update failed.',
          fileId: storedFile.id,
          cause: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        }),
      )
    })
    throw error
  } finally {
    client.release()
  }

  if (society.payment_qr_file_id && society.storage_object_key) {
    await deletePrivateFile({
      storageTargetKey: 'qr_images',
      storageObjectKey: society.storage_object_key,
      fileId: society.payment_qr_file_id,
    }).catch((error) => {
      console.warn(
        JSON.stringify({
          level: 'warn',
          message: 'Unable to remove the previous society payment QR image.',
          fileId: society.payment_qr_file_id,
          cause: error instanceof Error ? error.message : String(error),
        }),
      )
    })
  }

  return createApiSuccess(event, toPaymentQrFile(storedFile))
})
