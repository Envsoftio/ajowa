import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PoolClient, QueryResultRow } from 'pg'
import { getDatabasePool } from './database'
import { getValidatedRuntimeConfig } from './env'
import { AppError } from './errors'
import { getSupabaseAdminClient } from './supabase'
import type { StoredFileMetadata, StoredFileUploadStatus } from '~/types/domain'

const FIVE_MEGABYTES = 5 * 1024 * 1024
const SIX_MEGABYTES = 6 * 1024 * 1024
const TEN_MEGABYTES = 10 * 1024 * 1024
const HUNDRED_MEGABYTES = 100 * 1024 * 1024

export const STORAGE_TARGETS = {
  residentDocuments: {
    key: 'resident_documents',
    providerContainer: 'resident-documents',
  },
  paymentProofs: {
    key: 'payment_proofs',
    providerContainer: 'payment-proofs',
  },
  receipts: {
    key: 'receipts',
    providerContainer: 'receipts',
  },
  qrImages: {
    key: 'qr_images',
    providerContainer: 'qr-images',
  },
  financeAttachments: {
    key: 'finance_attachments',
    providerContainer: 'finance-attachments',
  },
  ticketAttachments: {
    key: 'ticket_attachments',
    providerContainer: 'ticket-attachments',
  },
  noticeAttachments: {
    key: 'notice_attachments',
    providerContainer: 'notice-attachments',
  },
  reportExports: {
    key: 'report_exports',
    providerContainer: 'report-exports',
  },
} as const

export const STORAGE_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/zip',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

const STORAGE_MIME_TYPE_BY_EXTENSION: Record<string, (typeof STORAGE_ALLOWED_MIME_TYPES)[number]> = {
  pdf: 'application/pdf',
  zip: 'application/zip',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export const STORAGE_DEFAULT_MAX_FILE_SIZE_BYTES = TEN_MEGABYTES
export const STORAGE_REPORT_EXPORT_MAX_FILE_SIZE_BYTES = HUNDRED_MEGABYTES
const STORAGE_STANDARD_UPLOAD_RECOMMENDED_MAX_FILE_SIZE_BYTES = SIX_MEGABYTES
const STORAGE_RESUMABLE_UPLOAD_CHUNK_SIZE_BYTES = SIX_MEGABYTES

const STORAGE_TARGET_VALUES = Object.values(STORAGE_TARGETS)
const STORAGE_TARGET_KEYS = STORAGE_TARGET_VALUES.map((target) => target.key)

type StorageTarget = (typeof STORAGE_TARGET_VALUES)[number]
type StorageTargetKey = (typeof STORAGE_TARGET_KEYS)[number]

type StorageFileRecordRow = QueryResultRow & {
  id: string
  storage_target_key: StorageTargetKey
  storage_object_key: string
  original_file_name: string
  mime_type: string
  size_bytes: number | string
  checksum: string | null
  uploaded_by: string
  uploaded_at: string
  related_record_type: string
  related_record_id: string
  upload_status: StoredFileUploadStatus
  last_error: string | null
  created_at: string
  updated_at: string
}

type StorageFileRecordUpdate = Partial<
  Pick<
    StorageFileRecordRow,
    | 'storage_target_key'
    | 'storage_object_key'
    | 'original_file_name'
    | 'mime_type'
    | 'size_bytes'
    | 'checksum'
    | 'uploaded_by'
    | 'uploaded_at'
    | 'related_record_type'
    | 'related_record_id'
    | 'upload_status'
    | 'last_error'
  >
>

type StorageRelation = {
  recordType: string
  recordId: string
}

type StorageUploadBody =
  | ArrayBuffer
  | ArrayBufferView
  | Blob
  | Buffer
  | File
  | FormData
  | ReadableStream<Uint8Array>
  | string

type StorageUploadInput = {
  storageTargetKey: StorageTargetKey
  storageObjectKey: string
  originalFileName: string
  mimeType: string
  sizeBytes: number
  body: StorageUploadBody
  uploadedBy: string
  relation: StorageRelation
  checksum?: string
}

type StorageQueryClient = Pick<PoolClient, 'query'>

type ReplaceStoredFileInput = StorageUploadInput & {
  fileId: string
}

type DownloadStoredFileInput = {
  storageTargetKey: StorageTargetKey
  storageObjectKey: string
}

type SignedUrlInput = DownloadStoredFileInput & {
  expiresInSeconds?: number
}

type DeleteStoredFileInput = DownloadStoredFileInput & {
  fileId?: string
}

type CleanupFailedUploadsResult = {
  deletedFileRecords: number
  deletedStorageObjects: number
}

const isStorageTargetKey = (value: string): value is StorageTargetKey =>
  STORAGE_TARGET_KEYS.includes(value as StorageTargetKey)

const assertStorageTargetKey = (storageTargetKey: string): StorageTargetKey => {
  if (!isStorageTargetKey(storageTargetKey)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Unsupported storage target key "${storageTargetKey}".`,
    })
  }

  return storageTargetKey
}

const getStorageTarget = (storageTargetKey: StorageTargetKey): StorageTarget => {
  const storageTarget = STORAGE_TARGET_VALUES.find((target) => target.key === storageTargetKey)

  if (!storageTarget) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `No storage provider mapping exists for "${storageTargetKey}".`,
    })
  }

  return storageTarget
}

const normalizeStorageObjectKey = (storageObjectKey: string) => {
  const normalizedKey = storageObjectKey.trim().replace(/^\/+/, '').replace(/\/{2,}/g, '/')

  if (!normalizedKey || normalizedKey.includes('..')) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Storage object keys must be relative and must not contain "..".',
    })
  }

  return normalizedKey
}

const assertAllowedMimeType = (mimeType: string) => {
  if (!STORAGE_ALLOWED_MIME_TYPES.includes(mimeType as (typeof STORAGE_ALLOWED_MIME_TYPES)[number])) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Unsupported file type "${mimeType}". Allowed types: ${STORAGE_ALLOWED_MIME_TYPES.join(', ')}.`,
    })
  }
}

export const resolveStorageUploadMimeType = (fileName: string, mimeType?: string | null) => {
  const normalizedMimeType = mimeType?.trim().toLowerCase() ?? ''

  if (STORAGE_ALLOWED_MIME_TYPES.includes(normalizedMimeType as (typeof STORAGE_ALLOWED_MIME_TYPES)[number])) {
    return normalizedMimeType
  }

  const extension = fileName.includes('.') ? fileName.split('.').pop()?.trim().toLowerCase() ?? '' : ''
  const inferredMimeType = STORAGE_MIME_TYPE_BY_EXTENSION[extension]

  if (inferredMimeType) {
    return inferredMimeType
  }

  return normalizedMimeType || 'application/octet-stream'
}

const getStorageMaxFileSizeBytes = (storageTargetKey: StorageTargetKey) =>
  storageTargetKey === STORAGE_TARGETS.reportExports.key
    ? STORAGE_REPORT_EXPORT_MAX_FILE_SIZE_BYTES
    : storageTargetKey === STORAGE_TARGETS.ticketAttachments.key
      ? FIVE_MEGABYTES
    : STORAGE_DEFAULT_MAX_FILE_SIZE_BYTES

const assertAllowedFileSize = (sizeBytes: number, storageTargetKey: StorageTargetKey) => {
  const maxFileSizeBytes = getStorageMaxFileSizeBytes(storageTargetKey)

  if (sizeBytes <= 0 || sizeBytes > maxFileSizeBytes) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Files must be between 1 byte and ${maxFileSizeBytes} bytes.`,
    })
  }
}

const mapStoredFileRecord = (row: StorageFileRecordRow): StoredFileMetadata => ({
  id: row.id,
  storageTargetKey: row.storage_target_key,
  storageObjectKey: row.storage_object_key,
  originalFileName: row.original_file_name,
  mimeType: row.mime_type,
  sizeBytes: Number(row.size_bytes),
  ...(row.checksum ? { checksum: row.checksum } : {}),
  uploadedBy: row.uploaded_by,
  uploadedAt: row.uploaded_at,
  relatedRecordType: row.related_record_type,
  relatedRecordId: row.related_record_id,
  uploadStatus: row.upload_status,
  ...(row.last_error ? { lastError: row.last_error } : {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const toStorageError = (message: string, details?: Record<string, unknown>) =>
  new AppError({
    code: 'INTERNAL_ERROR',
    statusCode: 500,
    message,
    details,
  })

const fileRecordColumns = `
  id,
  storage_target_key,
  storage_object_key,
  original_file_name,
  mime_type,
  size_bytes::text as size_bytes,
  checksum,
  uploaded_by,
  uploaded_at::text as uploaded_at,
  related_record_type,
  related_record_id,
  upload_status,
  last_error,
  created_at::text as created_at,
  updated_at::text as updated_at
`

const fileRecordUpdateColumns = new Set([
  'storage_target_key',
  'storage_object_key',
  'original_file_name',
  'mime_type',
  'size_bytes',
  'checksum',
  'uploaded_by',
  'uploaded_at',
  'related_record_type',
  'related_record_id',
  'upload_status',
  'last_error',
  'updated_at',
])

const unknownErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

const readStorageProviderResponseError = async (response: Response) => {
  const fallback = `HTTP ${response.status} ${response.statusText}`.trim()

  try {
    const text = await response.text()

    if (!text.trim()) {
      return fallback
    }

    try {
      const parsed = JSON.parse(text) as {
        error?: unknown
        message?: unknown
        msg?: unknown
      }
      const message = parsed.message ?? parsed.error ?? parsed.msg

      if (typeof message === 'string' && message.trim()) {
        return `${fallback}: ${message}`
      }
    } catch {
      // Fall back to the raw response body below.
    }

    return `${fallback}: ${text.slice(0, 500)}`
  } catch {
    return fallback
  }
}

const toStorageProviderErrorDetails = (error: unknown) => {
  const cause = unknownErrorMessage(error, 'Unknown storage provider error.')

  if (!error || typeof error !== 'object') {
    return { cause }
  }

  const record = error as Record<string, unknown>

  return {
    cause,
    ...(typeof record.error === 'string' ? { providerError: record.error } : {}),
    ...(typeof record.statusCode === 'string' || typeof record.statusCode === 'number'
      ? { providerStatusCode: record.statusCode }
      : {}),
  }
}

const toBase64MetadataValue = (value: string) =>
  Buffer.from(value, 'utf8').toString('base64')

const toTusUploadMetadataHeader = (metadata: Record<string, string>) =>
  Object.entries(metadata)
    .map(([key, value]) => `${key} ${toBase64MetadataValue(value)}`)
    .join(',')

const resolveSupabaseResumableUploadEndpoint = () => {
  const config = getValidatedRuntimeConfig()
  const supabaseUrl = new URL(config.public.supabaseUrl)
  const hostedProjectRef = supabaseUrl.hostname.endsWith('.supabase.co')
    ? supabaseUrl.hostname.split('.')[0]
    : ''
  const origin = hostedProjectRef
    ? `https://${hostedProjectRef}.storage.supabase.co`
    : supabaseUrl.origin

  return {
    endpoint: `${origin}/storage/v1/upload/resumable`,
    serviceRoleKey: config.supabaseServiceRoleKey,
  }
}

const getBufferUploadBody = (body: StorageUploadBody) => {
  if (Buffer.isBuffer(body)) {
    return body
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body)
  }

  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength)
  }

  return null
}

const toArrayBufferUploadBody = (body: Buffer): ArrayBuffer => {
  const view = new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
  const copy = new Uint8Array(view.byteLength)
  copy.set(view)

  return copy.buffer
}

const shouldUseResumableStorageUpload = (input: ReturnType<typeof validateStorageUploadInput>) =>
  input.storageTargetKey === STORAGE_TARGETS.reportExports.key &&
  input.sizeBytes > STORAGE_STANDARD_UPLOAD_RECOMMENDED_MAX_FILE_SIZE_BYTES &&
  getBufferUploadBody(input.body) !== null

const parseTusUploadOffset = (value: string | null, fallback: number) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

const uploadResumableSupabaseFile = async (
  storageTarget: StorageTarget,
  input: ReturnType<typeof validateStorageUploadInput>,
) => {
  const body = getBufferUploadBody(input.body)

  if (!body) {
    throw toStorageError('Unable to upload this file with the resumable storage uploader.', {
      cause: 'The upload body is not a binary buffer.',
      storageTargetKey: input.storageTargetKey,
      storageObjectKey: input.storageObjectKey,
    })
  }

  const { endpoint, serviceRoleKey } = resolveSupabaseResumableUploadEndpoint()
  const baseHeaders = {
    authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    'tus-resumable': '1.0.0',
  }
  const firstChunk = body.subarray(
    0,
    Math.min(STORAGE_RESUMABLE_UPLOAD_CHUNK_SIZE_BYTES, body.byteLength),
  )
  const createResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...baseHeaders,
      'content-type': 'application/offset+octet-stream',
      'upload-length': String(body.byteLength),
      'upload-metadata': toTusUploadMetadataHeader({
        bucketName: storageTarget.providerContainer,
        objectName: input.storageObjectKey,
        contentType: input.mimeType,
        cacheControl: '3600',
      }),
    },
    body: toArrayBufferUploadBody(firstChunk),
  })

  if (!createResponse.ok) {
    throw toStorageError('Unable to start the resumable storage upload.', {
      cause: await readStorageProviderResponseError(createResponse),
      storageTargetKey: input.storageTargetKey,
      storageObjectKey: input.storageObjectKey,
    })
  }

  const uploadUrlHeader = createResponse.headers.get('location')

  if (!uploadUrlHeader) {
    throw toStorageError('Unable to start the resumable storage upload.', {
      cause: 'The storage provider did not return an upload URL.',
      storageTargetKey: input.storageTargetKey,
      storageObjectKey: input.storageObjectKey,
    })
  }

  const uploadUrl = new URL(uploadUrlHeader, endpoint).toString()
  let offset = parseTusUploadOffset(createResponse.headers.get('upload-offset'), firstChunk.length)

  while (offset < body.byteLength) {
    const chunk = body.subarray(
      offset,
      Math.min(offset + STORAGE_RESUMABLE_UPLOAD_CHUNK_SIZE_BYTES, body.byteLength),
    )
    const previousOffset = offset
    const patchResponse = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        ...baseHeaders,
        'content-type': 'application/offset+octet-stream',
        'upload-offset': String(offset),
      },
      body: toArrayBufferUploadBody(chunk),
    })

    if (!patchResponse.ok) {
      throw toStorageError('Unable to upload a resumable storage chunk.', {
        cause: await readStorageProviderResponseError(patchResponse),
        storageTargetKey: input.storageTargetKey,
        storageObjectKey: input.storageObjectKey,
        uploadOffset: offset,
      })
    }

    offset = parseTusUploadOffset(
      patchResponse.headers.get('upload-offset'),
      offset + chunk.length,
    )

    if (offset <= previousOffset) {
      throw toStorageError('Unable to upload a resumable storage chunk.', {
        cause: 'The storage provider did not advance the upload offset.',
        storageTargetKey: input.storageTargetKey,
        storageObjectKey: input.storageObjectKey,
        uploadOffset: previousOffset,
      })
    }
  }
}

const validateStorageUploadInput = (input: StorageUploadInput) => {
  const storageTargetKey = assertStorageTargetKey(input.storageTargetKey)
  const storageObjectKey = normalizeStorageObjectKey(input.storageObjectKey)

  assertAllowedMimeType(input.mimeType)
  assertAllowedFileSize(input.sizeBytes, storageTargetKey)

  if (!input.originalFileName.trim()) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'A file name is required for storage uploads.',
    })
  }

  if (!input.uploadedBy.trim() || !input.relation.recordType.trim() || !input.relation.recordId.trim()) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Uploaded files must include uploader and related record information.',
    })
  }

  return {
    ...input,
    storageTargetKey,
    storageObjectKey,
  }
}

const insertPendingFileRecord = async (
  fileId: string,
  input: ReturnType<typeof validateStorageUploadInput>,
  dbClient?: StorageQueryClient,
) => {
  const timestamp = new Date().toISOString()
  try {
    const queryable = dbClient ?? getDatabasePool()
    const result = await queryable.query<StorageFileRecordRow>(
      `
        insert into public.file_objects (
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
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING', null, $9, $9)
        returning ${fileRecordColumns}
      `,
      [
        fileId,
        input.storageTargetKey,
        input.storageObjectKey,
        input.originalFileName,
        input.mimeType,
        input.sizeBytes,
        input.checksum ?? null,
        input.uploadedBy,
        timestamp,
        input.relation.recordType,
        input.relation.recordId,
      ],
    )
    const row = result.rows[0]

    if (!row) {
      throw new Error('Insert returned no file metadata row.')
    }

    return row
  } catch (error) {
    throw toStorageError('Unable to create the file metadata record.', {
      cause: unknownErrorMessage(error, 'Unknown file metadata insert error.'),
      storageTargetKey: input.storageTargetKey,
      storageObjectKey: input.storageObjectKey,
    })
  }
}

const updateFileRecord = async (
  fileId: string,
  updates: StorageFileRecordUpdate,
  dbClient?: StorageQueryClient,
) => {
  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
  }
  const entries = Object.entries(payload).filter((entry) => {
    const [column, value] = entry
    return value !== undefined && fileRecordUpdateColumns.has(column)
  })

  try {
    const assignments = entries.map(([column], index) => `${column} = $${index + 2}`)
    const values = [fileId, ...entries.map(([, value]) => value)]
    const queryable = dbClient ?? getDatabasePool()
    const result = await queryable.query<StorageFileRecordRow>(
      `
        update public.file_objects
        set ${assignments.join(', ')}
        where id = $1
        returning ${fileRecordColumns}
      `,
      values,
    )
    const row = result.rows[0]

    if (!row) {
      throw new Error('Update returned no file metadata row.')
    }

    return row
  } catch (error) {
    throw toStorageError('Unable to update the file metadata record.', {
      cause: unknownErrorMessage(error, 'Unknown file metadata update error.'),
      fileId,
    })
  }
}

const removeStorageObjectQuietly = async (
  supabaseAdmin: SupabaseClient,
  storageTargetKey: StorageTargetKey,
  storageObjectKey: string,
) => {
  try {
    const storageTarget = getStorageTarget(storageTargetKey)
    const { error } = await supabaseAdmin.storage.from(storageTarget.providerContainer).remove([storageObjectKey])

    if (error) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          message: 'Unable to remove a storage object during cleanup.',
          storageTargetKey,
          storageObjectKey,
          cause: error.message,
        }),
      )

      return false
    }

    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown storage cleanup error.'
    console.warn(
      JSON.stringify({
        level: 'warn',
        message: 'Storage object cleanup threw unexpectedly.',
        storageTargetKey,
        storageObjectKey,
        cause: message,
      }),
    )

    return false
  }
}

const markFileRecordFailedQuietly = async (
  fileId: string,
  message: string,
) => {
  try {
    await updateFileRecord(fileId, {
      upload_status: 'FAILED',
      last_error: message,
    })
  } catch (error) {
    const cause = error instanceof Error ? error.message : 'Unknown file metadata update error.'
    console.warn(
      JSON.stringify({
        level: 'warn',
        message: 'Unable to mark a file metadata record as FAILED.',
        fileId,
        cause,
      }),
    )
  }
}

export const createStorageObjectKey = ({
  recordType,
  recordId,
  fileName,
}: {
  recordType: string
  recordId: string
  fileName: string
}) => {
  const safeSegment = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)

  const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() ?? '' : ''
  const baseName = safeSegment(fileName.replace(/\.[^.]+$/, '')) || 'file'
  const suffix = extension ? `.${extension}` : ''
  const uniqueSuffix = randomUUID().slice(0, 8)

  return `${safeSegment(recordType)}/${safeSegment(recordId)}/${Date.now()}-${uniqueSuffix}-${baseName}${suffix}`
}

export const uploadPrivateFile = async (
  input: StorageUploadInput,
  options?: { dbClient?: StorageQueryClient },
) => {
  const supabaseAdmin = getSupabaseAdminClient()
  const validInput = validateStorageUploadInput(input)
  const storageTarget = getStorageTarget(validInput.storageTargetKey)
  const fileId = randomUUID()
  const dbClient = options?.dbClient

  await insertPendingFileRecord(fileId, validInput, dbClient)

  try {
    if (shouldUseResumableStorageUpload(validInput)) {
      await uploadResumableSupabaseFile(storageTarget, validInput)
    } else {
      const { error } = await supabaseAdmin
        .storage
        .from(storageTarget.providerContainer)
        .upload(validInput.storageObjectKey, validInput.body, {
          contentType: validInput.mimeType,
          upsert: false,
        })

      if (error) {
        throw toStorageError('Unable to upload the file to the configured storage provider.', {
          ...toStorageProviderErrorDetails(error),
          storageTargetKey: validInput.storageTargetKey,
          storageObjectKey: validInput.storageObjectKey,
        })
      }
    }

    const readyRecord = await updateFileRecord(fileId, {
      upload_status: 'READY',
      uploaded_at: new Date().toISOString(),
      last_error: null,
    }, dbClient)

    return mapStoredFileRecord(readyRecord)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown storage upload error.'

    await removeStorageObjectQuietly(
      supabaseAdmin,
      validInput.storageTargetKey,
      validInput.storageObjectKey,
    )
    await markFileRecordFailedQuietly(fileId, message)

    throw error
  }
}

export const replacePrivateFile = async (input: ReplaceStoredFileInput) => {
  const supabaseAdmin = getSupabaseAdminClient()
  const validInput = validateStorageUploadInput(input)
  const storageTarget = getStorageTarget(validInput.storageTargetKey)
  const existingResult = await getDatabasePool().query<StorageFileRecordRow>(
    `
      select ${fileRecordColumns}
      from public.file_objects
      where id = $1
      limit 1
    `,
    [input.fileId],
  )
  const existingRecord = existingResult.rows[0]

  if (!existingRecord) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'The file metadata record could not be found for replacement.',
    })
  }

  await updateFileRecord(input.fileId, {
    storage_target_key: validInput.storageTargetKey,
    storage_object_key: validInput.storageObjectKey,
    original_file_name: validInput.originalFileName,
    mime_type: validInput.mimeType,
    size_bytes: validInput.sizeBytes,
    checksum: validInput.checksum ?? null,
    uploaded_by: validInput.uploadedBy,
    related_record_type: validInput.relation.recordType,
    related_record_id: validInput.relation.recordId,
    upload_status: 'PENDING',
    last_error: null,
  })

  try {
    const { error: uploadError } = await supabaseAdmin
      .storage
      .from(storageTarget.providerContainer)
      .upload(validInput.storageObjectKey, validInput.body, {
        contentType: validInput.mimeType,
        upsert: true,
      })

    if (uploadError) {
      throw toStorageError('Unable to replace the file in the configured storage provider.', {
        cause: uploadError.message,
        storageTargetKey: validInput.storageTargetKey,
        storageObjectKey: validInput.storageObjectKey,
      })
    }

    const readyRecord = await updateFileRecord(input.fileId, {
      upload_status: 'READY',
      uploaded_at: new Date().toISOString(),
      last_error: null,
    })

    if (
      existingRecord.storage_target_key !== validInput.storageTargetKey ||
      existingRecord.storage_object_key !== validInput.storageObjectKey
    ) {
      await removeStorageObjectQuietly(
        supabaseAdmin,
        existingRecord.storage_target_key,
        existingRecord.storage_object_key,
      )
    }

    return mapStoredFileRecord(readyRecord)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown storage replace error.'

    if (
      existingRecord.storage_target_key !== validInput.storageTargetKey ||
      existingRecord.storage_object_key !== validInput.storageObjectKey
    ) {
      await removeStorageObjectQuietly(
        supabaseAdmin,
        validInput.storageTargetKey,
        validInput.storageObjectKey,
      )
    }
    await markFileRecordFailedQuietly(input.fileId, message)

    throw error
  }
}

export const downloadPrivateFile = async (input: DownloadStoredFileInput) => {
  const storageTargetKey = assertStorageTargetKey(input.storageTargetKey)
  const storageObjectKey = normalizeStorageObjectKey(input.storageObjectKey)
  const storageTarget = getStorageTarget(storageTargetKey)
  const supabaseAdmin = getSupabaseAdminClient()
  const { data, error } = await supabaseAdmin.storage
    .from(storageTarget.providerContainer)
    .download(storageObjectKey)

  if (error || !data) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'The requested file could not be downloaded.',
      details: {
        storageTargetKey,
        storageObjectKey,
        cause: error?.message,
      },
    })
  }

  return data
}

export const createPrivateSignedUrl = async (input: SignedUrlInput) => {
  const storageTargetKey = assertStorageTargetKey(input.storageTargetKey)
  const storageObjectKey = normalizeStorageObjectKey(input.storageObjectKey)
  const storageTarget = getStorageTarget(storageTargetKey)
  const expiresInSeconds = input.expiresInSeconds ?? 60 * 15
  const supabaseAdmin = getSupabaseAdminClient()
  const { data, error } = await supabaseAdmin.storage
    .from(storageTarget.providerContainer)
    .createSignedUrl(storageObjectKey, expiresInSeconds)

  if (error || !data?.signedUrl) {
    throw toStorageError('Unable to create a signed download URL.', {
      storageTargetKey,
      storageObjectKey,
      cause: error?.message,
    })
  }

  return data.signedUrl
}

export const deletePrivateFile = async (input: DeleteStoredFileInput) => {
  const storageTargetKey = assertStorageTargetKey(input.storageTargetKey)
  const storageObjectKey = normalizeStorageObjectKey(input.storageObjectKey)
  const storageTarget = getStorageTarget(storageTargetKey)
  const supabaseAdmin = getSupabaseAdminClient()

  const { error: storageError } = await supabaseAdmin.storage
    .from(storageTarget.providerContainer)
    .remove([storageObjectKey])

  if (storageError) {
    throw toStorageError('Unable to remove the stored file.', {
      storageTargetKey,
      storageObjectKey,
      cause: storageError.message,
    })
  }

  if (input.fileId) {
    try {
      await getDatabasePool().query('delete from public.file_objects where id = $1', [input.fileId])
    } catch (error) {
      throw toStorageError(
        'The file was removed from storage, but its metadata record could not be deleted.',
        {
          fileId: input.fileId,
          cause: unknownErrorMessage(error, 'Unknown file metadata delete error.'),
        },
      )
    }
  }
}

export const cleanupFailedUploads = async (olderThanHours = 24): Promise<CleanupFailedUploadsResult> => {
  const supabaseAdmin = getSupabaseAdminClient()
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString()
  let rows: StorageFileRecordRow[]

  try {
    const result = await getDatabasePool().query<StorageFileRecordRow>(
      `
        select ${fileRecordColumns}
        from public.file_objects
        where upload_status = any($1::text[])
          and updated_at <= $2
      `,
      [['PENDING', 'FAILED'], cutoff],
    )
    rows = result.rows
  } catch (error) {
    throw toStorageError('Unable to query failed or stale uploads for cleanup.', {
      cause: unknownErrorMessage(error, 'Unknown failed upload cleanup query error.'),
      olderThanHours,
    })
  }

  let deletedStorageObjects = 0
  let deletedFileRecords = 0

  for (const row of rows) {
    const storageObjectDeleted = await removeStorageObjectQuietly(
      supabaseAdmin,
      row.storage_target_key,
      row.storage_object_key,
    )

    if (storageObjectDeleted) {
      deletedStorageObjects += 1
    }

    try {
      await getDatabasePool().query('delete from public.file_objects where id = $1', [row.id])
    } catch (error) {
      throw toStorageError('Unable to delete a stale file metadata record during cleanup.', {
        cause: unknownErrorMessage(error, 'Unknown stale file metadata delete error.'),
        fileId: row.id,
      })
    }

    deletedFileRecords += 1
  }

  return {
    deletedFileRecords,
    deletedStorageObjects,
  }
}
