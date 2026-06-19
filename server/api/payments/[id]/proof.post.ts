import { createHash } from 'node:crypto'
import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { createStorageObjectKey, uploadPrivateFile } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const paymentId = readUuidParam(event)
  const parts = await readMultipartFormData(event)
  const filePart = parts?.find((part) => part.name === 'file' && part.filename)

  if (!filePart?.filename || !filePart.type) {
    throw createError({ statusCode: 400, statusMessage: 'A payment proof file is required.' })
  }

  const pool = getDatabasePool()
  const payment = await pool.query<{ id: string }>(
    'select id from payments where id = $1 and society_id = $2 limit 1',
    [paymentId, authMe.user.societyId],
  )

  if (!payment.rows[0]) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Payment not found.' })
  }

  const storageObjectKey = createStorageObjectKey({
    recordType: 'payment-proof',
    recordId: paymentId,
    fileName: filePart.filename,
  })
  const checksum = createHash('sha256').update(filePart.data).digest('hex')

  await uploadPrivateFile({
    storageTargetKey: 'payment_proofs',
    storageObjectKey,
    originalFileName: filePart.filename,
    mimeType: filePart.type,
    sizeBytes: filePart.data.byteLength,
    body: filePart.data,
    uploadedBy: authMe.user.id,
    relation: {
      recordType: 'payments',
      recordId: paymentId,
    },
    checksum,
  })

  await pool.query(
    `
      update payments
      set proof_file_path = $3,
          updated_at = now()
      where id = $1 and society_id = $2
    `,
    [paymentId, authMe.user.societyId, storageObjectKey],
  )

  return createApiSuccess(event, {
    fileName: filePart.filename,
    filePath: storageObjectKey,
    mimeType: filePart.type,
    sizeBytes: filePart.data.byteLength,
    checksum,
    downloadUrl: `/api/payments/${paymentId}/proof`,
  })
})
