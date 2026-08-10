import { createHash } from 'node:crypto'
import { z } from 'zod'
import { createApiSuccess } from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { writeFinanceAudit } from '~/server/utils/finance'
import { readMultipartFormParts } from '~/server/utils/multipart'
import { tenantMoveAttachmentTypeSchema } from '~/server/utils/tenant-moves'
import {
  createStorageObjectKey,
  deletePrivateFile,
  resolveStorageUploadMimeType,
  STORAGE_DEFAULT_MAX_FILE_SIZE_BYTES,
  uploadPrivateFile,
} from '~/server/utils/storage'

type MoveCaseStatus =
  | 'OCCUPIED'
  | 'MOVE_OUT_REQUESTED'
  | 'REFUND_PENDING'
  | 'CLOSED'
  | 'CANCELLED'

const assertAttachmentAllowed = (
  status: MoveCaseStatus,
  attachmentType: z.infer<typeof tenantMoveAttachmentTypeSchema>,
) => {
  if (status === 'CANCELLED') {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'Attachments cannot be added to a cancelled tenant move record.',
    })
  }
  if (status === 'CLOSED' && attachmentType !== 'REFUND') {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'Only refund proof can be added after settlement.',
    })
  }
  if (status !== 'CLOSED' && attachmentType === 'REFUND') {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'Refund proof can be added after the settlement is posted.',
    })
  }
}

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'finance.manage')
  const moveCaseId = z
    .string()
    .uuid()
    .parse(String(event.context.params?.id ?? ''))
  const parts = await readMultipartFormParts(event)
  const filePart = parts?.find((part) => part.name === 'file' && part.filename)
  const typePart = parts?.find((part) => part.name === 'attachmentType')
  const attachmentType = tenantMoveAttachmentTypeSchema.parse(
    typePart ? Buffer.from(typePart.data).toString('utf8') : '',
  )

  if (!filePart?.filename || !filePart.data?.byteLength) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Select an inspection image or PDF to upload.',
    })
  }
  if (filePart.data.byteLength > STORAGE_DEFAULT_MAX_FILE_SIZE_BYTES) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Tenant move attachments must be 10 MB or smaller.',
    })
  }

  const pool = getDatabasePool()
  const moveCaseResult = await pool.query<{
    id: string
    status: MoveCaseStatus
  }>(
    `
      select id, status
      from tenant_move_cases
      where id = $1 and society_id = $2
      limit 1
    `,
    [moveCaseId, authMe.user.societyId],
  )
  if (!moveCaseResult.rows[0]) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Tenant move record was not found.',
    })
  }
  assertAttachmentAllowed(moveCaseResult.rows[0].status, attachmentType)

  const mimeType = resolveStorageUploadMimeType(
    filePart.filename,
    filePart.type,
  )
  if (
    !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(
      mimeType,
    )
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Tenant move evidence must be a PDF, JPEG, PNG, or WebP file.',
    })
  }
  const checksum = createHash('sha256').update(filePart.data).digest('hex')
  const filePath = createStorageObjectKey({
    recordType: 'tenant-move-evidence',
    recordId: moveCaseId,
    fileName: filePart.filename,
  })
  const storedFile = await uploadPrivateFile({
    storageTargetKey: 'finance_attachments',
    storageObjectKey: filePath,
    originalFileName: filePart.filename,
    mimeType,
    sizeBytes: filePart.data.byteLength,
    body: filePart.data,
    uploadedBy: authMe.user.id,
    relation: { recordType: 'tenant_move_cases', recordId: moveCaseId },
    checksum,
  })

  const client = await pool.connect()
  try {
    await client.query('begin')
    const lockedCase = await client.query<{ status: MoveCaseStatus }>(
      `
        select status
        from tenant_move_cases
        where id = $1 and society_id = $2
        for update
      `,
      [moveCaseId, authMe.user.societyId],
    )
    if (!lockedCase.rows[0]) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Tenant move record was not found.',
      })
    }
    assertAttachmentAllowed(lockedCase.rows[0].status, attachmentType)

    const result = await client.query<{ id: string; created_at: string }>(
      `
        insert into tenant_move_attachments (
          society_id,
          move_case_id,
          attachment_type,
          file_name,
          file_path,
          mime_type,
          size_bytes,
          checksum,
          uploaded_by_user_id
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        returning id, created_at::text
      `,
      [
        authMe.user.societyId,
        moveCaseId,
        attachmentType,
        filePart.filename,
        filePath,
        mimeType,
        filePart.data.byteLength,
        checksum,
        authMe.user.id,
      ],
    )
    const attachment = result.rows[0]
    if (!attachment) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Tenant move attachment could not be linked.',
      })
    }

    await writeFinanceAudit({
      client,
      event,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'CREATED',
      eventKey: 'finance.tenant_moves.attachment_added',
      afterState: {
        attachmentType,
        fileName: filePart.filename,
        mimeType,
        sizeBytes: filePart.data.byteLength,
      },
      relatedEntities: [
        { entityTable: 'tenant_move_cases', entityId: moveCaseId },
        { entityTable: 'tenant_move_attachments', entityId: attachment.id },
      ],
    })
    await client.query('commit')
    return createApiSuccess(event, {
      id: attachment.id,
      attachmentType,
      fileName: filePart.filename,
      mimeType,
      sizeBytes: filePart.data.byteLength,
      createdAt: attachment.created_at,
      downloadUrl: `/api/admin/finance/tenant-moves/${moveCaseId}/attachments/${attachment.id}/download`,
    })
  } catch (error) {
    await client.query('rollback')
    await deletePrivateFile({
      storageTargetKey: 'finance_attachments',
      storageObjectKey: filePath,
      fileId: storedFile.id,
    }).catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
})
