import { createHash } from 'node:crypto'
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

const allowedPaymentQrMimeTypes = new Set(['image/png', 'image/jpeg'])

const toPaymentQrFile = (
  file: {
    id: string
    originalFileName: string
    mimeType: string
    sizeBytes: number
    uploadedAt: string
  },
): SocietyPaymentQrFile => ({
  id: file.id,
  fileName: file.originalFileName,
  mimeType: file.mimeType,
  sizeBytes: file.sizeBytes,
  uploadedAt: file.uploadedAt,
  downloadUrl: '/api/admin/society/payment-qr',
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const parts = await readMultipartFormData(event)
  const filePart = parts?.find((part) => part.name === 'file' && part.filename)

  if (!filePart?.filename || !filePart.type) {
    throw createError({ statusCode: 400, statusMessage: 'A payment QR image is required.' })
  }

  if (!allowedPaymentQrMimeTypes.has(filePart.type)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Upload a PNG or JPG payment QR image.',
    })
  }

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
    mimeType: filePart.type,
    sizeBytes: filePart.data.byteLength,
    body: filePart.data,
    uploadedBy: authMe.user.id,
    relation: {
      recordType: 'society_profile',
      recordId: authMe.user.societyId,
    },
    checksum,
  })

  try {
    await pool.query(
      `
        update society_profile
        set payment_qr_file_id = $2,
            updated_at = now()
        where id = $1
      `,
      [authMe.user.societyId, storedFile.id],
    )
  } catch (error) {
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
