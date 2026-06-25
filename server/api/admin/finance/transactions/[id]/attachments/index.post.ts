import { createHash } from 'node:crypto'
import { getRequestURL, setResponseStatus, type H3Event } from 'h3'
import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError, type AppErrorCode } from '~/server/utils/errors'
import { readMultipartFormParts } from '~/server/utils/multipart'
import {
  createStorageObjectKey,
  deletePrivateFile,
  uploadPrivateFile,
} from '~/server/utils/storage'
import type { FinanceTransactionAttachment, StoredFileMetadata } from '~/types/domain'

const normalizeFinanceAttachmentMimeType = (mimeType: string) =>
  mimeType === 'image/jpg' || mimeType === 'image/pjpeg'
    ? 'image/jpeg'
    : mimeType

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }

  return 'Unknown finance attachment error.'
}

const getErrorCause = (error: unknown) => {
  if (
    error instanceof AppError &&
    typeof error.details?.cause === 'string' &&
    error.details.cause.trim()
  ) {
    return error.details.cause.trim().replace(/\s+/g, ' ').slice(0, 500)
  }

  return getErrorMessage(error).replace(/\s+/g, ' ').slice(0, 500)
}

const formatErrorMessage = (message: string, error: unknown) => {
  const cause = getErrorCause(error)

  if (!cause || cause === message) {
    return message
  }

  return `${message}: ${cause}`
}

type FinanceAttachmentFailure = {
  code: AppErrorCode
  statusCode: number
  message: string
  details?: Record<string, unknown>
}

const isFinanceAttachmentFailure = (value: unknown): value is FinanceAttachmentFailure => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const failure = value as Partial<FinanceAttachmentFailure>

  return (
    typeof failure.code === 'string' &&
    typeof failure.statusCode === 'number' &&
    typeof failure.message === 'string'
  )
}

const toFinanceAttachmentFailure = (
  error: unknown,
  fallbackMessage: string,
): FinanceAttachmentFailure => {
  if (isFinanceAttachmentFailure(error)) {
    return error
  }

  if (error instanceof AppError) {
    return {
      code: error.code,
      statusCode: error.statusCode,
      message:
        error.statusCode >= 500
          ? formatErrorMessage(error.message, error)
          : error.message,
      ...(error.details ? { details: error.details } : {}),
    }
  }

  return {
    code: 'INTERNAL_ERROR',
    statusCode: 500,
    message: formatErrorMessage(fallbackMessage, error),
    details: {
      cause: getErrorCause(error),
    },
  }
}

const createFinanceAttachmentErrorResponse = (
  event: H3Event,
  failure: FinanceAttachmentFailure,
) => {
  setResponseStatus(event, failure.statusCode, failure.code)

  return {
    error: true,
    ok: false,
    url: getRequestURL(event).toString(),
    statusCode: failure.statusCode,
    statusMessage: failure.code,
    code: failure.code,
    message: failure.message,
    data: {
      code: failure.code,
      message: failure.message,
      ...(failure.details ? { details: failure.details } : {}),
    },
    ...(failure.details ? { details: failure.details } : {}),
  }
}

const warnFinanceAttachmentFailure = (
  transactionId: string,
  phase: string,
  failure: FinanceAttachmentFailure,
) => {
  console.warn(JSON.stringify({
    level: 'warn',
    message: 'Finance attachment upload failed.',
    phase,
    transactionId,
    code: failure.code,
    statusCode: failure.statusCode,
    failureMessage: failure.message,
    details: failure.details,
  }))
}

const createStaticFailure = (
  event: H3Event,
  failure: FinanceAttachmentFailure,
) => {
  warnFinanceAttachmentFailure(
    String(event.context.params?.id ?? ''),
    'request-validation',
    failure,
  )
  return createFinanceAttachmentErrorResponse(event, failure)
}

const createStorageFailure = (
  event: H3Event,
  transactionId: string,
  error: unknown,
) => {
  const failure = toFinanceAttachmentFailure(
    error,
    'Finance attachment upload failed before the file could be linked to the entry.',
  )

  warnFinanceAttachmentFailure(transactionId, 'storage-upload', failure)
  return createFinanceAttachmentErrorResponse(event, failure)
}

const createPersistenceFailure = (
  event: H3Event,
  transactionId: string,
  error: unknown,
) => {
  const failure = toFinanceAttachmentFailure(
    error,
    'The file uploaded, but AJOWA could not attach it to this finance entry. Please retry the attachment upload.',
  )

  warnFinanceAttachmentFailure(transactionId, 'metadata-persistence', failure)
  return createFinanceAttachmentErrorResponse(event, failure)
}

const createUnhandledFailure = (
  event: H3Event,
  transactionId: string,
  phase: string,
  error: unknown,
) => {
  const failure = toFinanceAttachmentFailure(
    error,
    'Finance attachment upload failed before AJOWA could finish processing the file.',
  )
  const failureWithPhase: FinanceAttachmentFailure = {
    ...failure,
    details: {
      ...(failure.details ?? {}),
      phase,
    },
  }

  warnFinanceAttachmentFailure(transactionId, phase, failureWithPhase)
  return createFinanceAttachmentErrorResponse(event, failureWithPhase)
}

const createCleanupFailure = (
  transactionId: string,
  storageObjectKey: string,
  storedFile: StoredFileMetadata,
  error: unknown,
) => {
  console.warn(JSON.stringify({
    level: 'warn',
    message: 'Unable to clean up a finance attachment after database persistence failed.',
    transactionId,
    storageObjectKey,
    fileId: storedFile.id,
    cause: getErrorCause(error),
  }))
}

const notFoundFailure = (message: string): FinanceAttachmentFailure => ({
  code: 'NOT_FOUND',
  statusCode: 404,
  message,
})

const validationFailure = (message: string): FinanceAttachmentFailure => ({
  code: 'VALIDATION_ERROR',
  statusCode: 400,
  message,
})

const internalFailure = (
  message: string,
  details?: Record<string, unknown>,
): FinanceAttachmentFailure => ({
  code: 'INTERNAL_ERROR',
  statusCode: 500,
  message,
  ...(details ? { details } : {}),
})

const cleanupStoredFinanceAttachment = async (
  transactionId: string,
  storageObjectKey: string,
  storedFile: StoredFileMetadata,
) => {
  try {
    await deletePrivateFile({
      storageTargetKey: 'finance_attachments',
      storageObjectKey,
      fileId: storedFile.id,
    })
  } catch (error) {
    createCleanupFailure(transactionId, storageObjectKey, storedFile, error)
  }
}

const rollbackFinanceAttachmentTransaction = async (
  transactionId: string,
  rollback: Promise<unknown>,
) => {
  try {
    await rollback
  } catch (rollbackError) {
    console.warn(JSON.stringify({
      level: 'warn',
      message: 'Unable to roll back a failed finance attachment transaction.',
      transactionId,
      cause: getErrorCause(rollbackError),
    }))
  }
}

export default defineEventHandler(async (event) => {
  const transactionId = String(event.context.params?.id ?? '')
  let phase = 'authentication'

  try {
    const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
    const pool = getDatabasePool()

    phase = 'transaction-lookup'
    const transaction = await pool.query<{ id: string }>(
      'select id from transactions where id = $1 and society_id = $2 limit 1',
      [transactionId, authMe.user.societyId],
    )
    if (!transaction.rows[0]) {
      return createStaticFailure(event, notFoundFailure('Transaction not found.'))
    }

    phase = 'multipart-parse'
    const parts = await readMultipartFormParts(event)
    const filePart = parts?.find((part) => part.name === 'file' && part.filename)
    const replacePart = parts?.find((part) => part.name === 'replacesAttachmentId')
    const replacesAttachmentId = replacePart
      ? Buffer.from(replacePart.data).toString('utf8')
      : undefined

    phase = 'file-validation'
    if (!filePart?.filename || !filePart.type) {
      return createStaticFailure(event, validationFailure('A file attachment is required.'))
    }

    phase = 'storage-key'
    const storageObjectKey = createStorageObjectKey({
      recordType: 'finance-transaction',
      recordId: transactionId,
      fileName: filePart.filename,
    })
    const mimeType = normalizeFinanceAttachmentMimeType(filePart.type)
    const checksum = createHash('sha256').update(filePart.data).digest('hex')

    let storedFile: StoredFileMetadata
    phase = 'storage-upload'
    try {
      storedFile = await uploadPrivateFile({
        storageTargetKey: 'finance_attachments',
        storageObjectKey,
        originalFileName: filePart.filename,
        mimeType,
        sizeBytes: filePart.data.byteLength,
        body: filePart.data,
        uploadedBy: authMe.user.id,
        relation: {
          recordType: 'transactions',
          recordId: transactionId,
        },
        checksum,
      })
    } catch (error) {
      return createStorageFailure(event, transactionId, error)
    }

    phase = 'database-connection'
    const client = await pool.connect()
    try {
      phase = 'metadata-persistence'
      await client.query('begin')
      if (replacesAttachmentId) {
        const replacementResult = await client.query(
          `
            update transaction_attachments
            set replaced_at = now()
            where id = $1 and transaction_id = $2 and replaced_at is null
          `,
          [replacesAttachmentId, transactionId],
        )
        if (replacementResult.rowCount !== 1) {
          throw validationFailure('The attachment being replaced could not be found for this transaction.')
        }
      }

      const result = await client.query<{
        id: string
        transaction_id: string
        file_name: string
        file_path: string
        mime_type: string
        size_bytes: number
        checksum: string | null
        uploaded_by_user_id: string | null
        replaces_attachment_id: string | null
        replaced_at: string | null
        created_at: string
      }>(
        `
          insert into transaction_attachments (
            transaction_id,
            file_name,
            file_path,
            mime_type,
            size_bytes,
            checksum,
            uploaded_by_user_id,
            replaces_attachment_id
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8)
          returning
            id,
            transaction_id,
            file_name,
            file_path,
            mime_type,
            size_bytes,
            checksum,
            uploaded_by_user_id,
            replaces_attachment_id,
            replaced_at::text,
            created_at::text
        `,
        [
          transactionId,
          filePart.filename,
          storageObjectKey,
          mimeType,
          filePart.data.byteLength,
          checksum,
          authMe.user.id,
          replacesAttachmentId || null,
        ],
      )
      const row = result.rows[0]
      if (!row) {
        throw internalFailure('Attachment save failed.')
      }

      await client.query('commit')

      const attachment: FinanceTransactionAttachment = {
        id: row.id,
        transactionId,
        fileName: row.file_name,
        filePath: row.file_path,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        checksum: row.checksum,
        uploadedByUserId: row.uploaded_by_user_id,
        uploadedByName: authMe.user.fullName,
        replacesAttachmentId: row.replaces_attachment_id,
        replacedAt: row.replaced_at,
        downloadUrl: `/api/admin/finance/transactions/${transactionId}/attachments/${row.id}/download`,
        createdAt: row.created_at,
        updatedAt: row.created_at,
      }

      return createApiSuccess(event, attachment)
    } catch (error) {
      await rollbackFinanceAttachmentTransaction(transactionId, client.query('rollback'))
      await cleanupStoredFinanceAttachment(transactionId, storageObjectKey, storedFile)
      return createPersistenceFailure(event, transactionId, error)
    } finally {
      client.release()
    }
  } catch (error) {
    return createUnhandledFailure(event, transactionId, phase, error)
  }
})
