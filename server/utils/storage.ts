import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError } from './errors'
import { getSupabaseAdminClient } from './supabase'
import type { StoredFileMetadata, StoredFileUploadStatus } from '~/types/domain'

const TEN_MEGABYTES = 10 * 1024 * 1024

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
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export const STORAGE_MAX_FILE_SIZE_BYTES = TEN_MEGABYTES

const STORAGE_TARGET_VALUES = Object.values(STORAGE_TARGETS)
const STORAGE_TARGET_KEYS = STORAGE_TARGET_VALUES.map((target) => target.key)

type StorageTarget = (typeof STORAGE_TARGET_VALUES)[number]
type StorageTargetKey = (typeof STORAGE_TARGET_KEYS)[number]

type StorageFileRecordRow = {
  id: string
  storage_target_key: StorageTargetKey
  storage_object_key: string
  original_file_name: string
  mime_type: string
  size_bytes: number
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

const assertAllowedFileSize = (sizeBytes: number) => {
  if (sizeBytes <= 0 || sizeBytes > STORAGE_MAX_FILE_SIZE_BYTES) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Files must be between 1 byte and ${STORAGE_MAX_FILE_SIZE_BYTES} bytes.`,
    })
  }
}

const mapStoredFileRecord = (row: StorageFileRecordRow): StoredFileMetadata => ({
  id: row.id,
  storageTargetKey: row.storage_target_key,
  storageObjectKey: row.storage_object_key,
  originalFileName: row.original_file_name,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
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

const validateStorageUploadInput = (input: StorageUploadInput) => {
  const storageTargetKey = assertStorageTargetKey(input.storageTargetKey)
  const storageObjectKey = normalizeStorageObjectKey(input.storageObjectKey)

  assertAllowedMimeType(input.mimeType)
  assertAllowedFileSize(input.sizeBytes)

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
  supabaseAdmin: SupabaseClient,
  fileId: string,
  input: ReturnType<typeof validateStorageUploadInput>,
) => {
  const timestamp = new Date().toISOString()
  const payload = {
    id: fileId,
    storage_target_key: input.storageTargetKey,
    storage_object_key: input.storageObjectKey,
    original_file_name: input.originalFileName,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    checksum: input.checksum ?? null,
    uploaded_by: input.uploadedBy,
    uploaded_at: timestamp,
    related_record_type: input.relation.recordType,
    related_record_id: input.relation.recordId,
    upload_status: 'PENDING' as const,
    last_error: null,
    created_at: timestamp,
    updated_at: timestamp,
  }

  const { data, error } = await supabaseAdmin
    .from('file_objects')
    .insert(payload)
    .select('*')
    .single<StorageFileRecordRow>()

  if (error || !data) {
    throw toStorageError('Unable to create the file metadata record.', {
      cause: error?.message,
      storageTargetKey: input.storageTargetKey,
      storageObjectKey: input.storageObjectKey,
    })
  }

  return data
}

const updateFileRecord = async (
  supabaseAdmin: SupabaseClient,
  fileId: string,
  updates: Partial<StorageFileRecordRow>,
) => {
  const { data, error } = await supabaseAdmin
    .from('file_objects')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', fileId)
    .select('*')
    .single<StorageFileRecordRow>()

  if (error || !data) {
    throw toStorageError('Unable to update the file metadata record.', {
      cause: error?.message,
      fileId,
    })
  }

  return data
}

const removeStorageObjectQuietly = async (
  supabaseAdmin: SupabaseClient,
  storageTargetKey: StorageTargetKey,
  storageObjectKey: string,
) => {
  const storageTarget = getStorageTarget(storageTargetKey)
  await supabaseAdmin.storage.from(storageTarget.providerContainer).remove([storageObjectKey])
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

  return `${safeSegment(recordType)}/${safeSegment(recordId)}/${Date.now()}-${baseName}${suffix}`
}

export const uploadPrivateFile = async (input: StorageUploadInput) => {
  const supabaseAdmin = getSupabaseAdminClient()
  const validInput = validateStorageUploadInput(input)
  const storageTarget = getStorageTarget(validInput.storageTargetKey)
  const fileId = randomUUID()

  await insertPendingFileRecord(supabaseAdmin, fileId, validInput)

  try {
    const { error } = await supabaseAdmin
      .storage
      .from(storageTarget.providerContainer)
      .upload(validInput.storageObjectKey, validInput.body, {
        contentType: validInput.mimeType,
        upsert: false,
      })

    if (error) {
      throw toStorageError('Unable to upload the file to the configured storage provider.', {
        cause: error.message,
        storageTargetKey: validInput.storageTargetKey,
        storageObjectKey: validInput.storageObjectKey,
      })
    }

    const readyRecord = await updateFileRecord(supabaseAdmin, fileId, {
      upload_status: 'READY',
      uploaded_at: new Date().toISOString(),
      last_error: null,
    })

    return mapStoredFileRecord(readyRecord)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown storage upload error.'

    await updateFileRecord(supabaseAdmin, fileId, {
      upload_status: 'FAILED',
      last_error: message,
    })
    await removeStorageObjectQuietly(
      supabaseAdmin,
      validInput.storageTargetKey,
      validInput.storageObjectKey,
    )

    throw error
  }
}

export const replacePrivateFile = async (input: ReplaceStoredFileInput) => {
  const supabaseAdmin = getSupabaseAdminClient()
  const validInput = validateStorageUploadInput(input)
  const storageTarget = getStorageTarget(validInput.storageTargetKey)
  const { data: existingRecord, error } = await supabaseAdmin
    .from('file_objects')
    .select('*')
    .eq('id', input.fileId)
    .single<StorageFileRecordRow>()

  if (error || !existingRecord) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'The file metadata record could not be found for replacement.',
    })
  }

  await updateFileRecord(supabaseAdmin, input.fileId, {
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

    const readyRecord = await updateFileRecord(supabaseAdmin, input.fileId, {
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

    await updateFileRecord(supabaseAdmin, input.fileId, {
      upload_status: 'FAILED',
      last_error: message,
    })

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
    const { error: metadataError } = await supabaseAdmin.from('file_objects').delete().eq('id', input.fileId)

    if (metadataError) {
      throw toStorageError(
        'The file was removed from storage, but its metadata record could not be deleted.',
        {
          fileId: input.fileId,
          cause: metadataError.message,
        },
      )
    }
  }
}

export const cleanupFailedUploads = async (olderThanHours = 24): Promise<CleanupFailedUploadsResult> => {
  const supabaseAdmin = getSupabaseAdminClient()
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('file_objects')
    .select('*')
    .in('upload_status', ['PENDING', 'FAILED'])
    .lte('updated_at', cutoff)
    .returns<StorageFileRecordRow[]>()

  if (error) {
    throw toStorageError('Unable to query failed or stale uploads for cleanup.', {
      cause: error.message,
      olderThanHours,
    })
  }

  let deletedStorageObjects = 0
  let deletedFileRecords = 0

  for (const row of data ?? []) {
    await removeStorageObjectQuietly(supabaseAdmin, row.storage_target_key, row.storage_object_key)
    deletedStorageObjects += 1

    const { error: deleteError } = await supabaseAdmin.from('file_objects').delete().eq('id', row.id)

    if (deleteError) {
      throw toStorageError('Unable to delete a stale file metadata record during cleanup.', {
        cause: deleteError.message,
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
