import { createHash } from 'node:crypto'
import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
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

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown finance attachment error.'

const toFinanceStorageError = (error: unknown) => {
  if (error instanceof AppError && error.code === 'VALIDATION_ERROR') {
    return error
  }

  const details =
    error instanceof AppError
      ? {
          ...error.details,
          cause: error.message,
        }
      : {
          cause: getErrorMessage(error),
        }

  return new AppError({
    code: 'INTERNAL_ERROR',
    statusCode: 500,
    message:
      'Finance attachment storage is not ready. Check the finance-attachments bucket and file metadata setup, then retry.',
    details,
  })
}

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
    console.warn(
      JSON.stringify({
        level: 'warn',
        message: 'Unable to clean up a finance attachment after database persistence failed.',
        transactionId,
        storageObjectKey,
        fileId: storedFile.id,
        cause: getErrorMessage(error),
      }),
    )
  }
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const transactionId = String(event.context.params?.id ?? '')
  const pool = getDatabasePool()

  const transaction = await pool.query<{ id: string }>(
    'select id from transactions where id = $1 and society_id = $2 limit 1',
    [transactionId, authMe.user.societyId],
  )
  if (!transaction.rows[0]) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Transaction not found.' })
  }

  const parts = await readMultipartFormParts(event)
  const filePart = parts?.find((part) => part.name === 'file' && part.filename)
  const replacePart = parts?.find((part) => part.name === 'replacesAttachmentId')
  const replacesAttachmentId = replacePart
    ? Buffer.from(replacePart.data).toString('utf8')
    : undefined

  if (!filePart?.filename || !filePart.type) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'A file attachment is required.',
    })
  }

  const storageObjectKey = createStorageObjectKey({
    recordType: 'finance-transaction',
    recordId: transactionId,
    fileName: filePart.filename,
  })
  const mimeType = normalizeFinanceAttachmentMimeType(filePart.type)
  const checksum = createHash('sha256').update(filePart.data).digest('hex')

  let storedFile: StoredFileMetadata
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
    throw toFinanceStorageError(error)
  }

  const client = await pool.connect()
  try {
    await client.query('begin')
    if (replacesAttachmentId) {
      await client.query(
        `
          update transaction_attachments
          set replaced_at = now()
          where id = $1 and transaction_id = $2 and replaced_at is null
        `,
        [replacesAttachmentId, transactionId],
      )
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
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Attachment save failed.',
      })
    }

    await client.query('commit')

    const attachment: FinanceTransactionAttachment = {
      id: row.id,
      transactionId: row.transaction_id,
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
    await client.query('rollback')
    await cleanupStoredFinanceAttachment(transactionId, storageObjectKey, storedFile)

    if (error instanceof AppError) {
      throw error
    }

    throw new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message:
        'The file uploaded, but AJOWA could not attach it to this finance entry. Please retry the attachment upload.',
      details: {
        cause: getErrorMessage(error),
        transactionId,
      },
    })
  } finally {
    client.release()
  }
})
