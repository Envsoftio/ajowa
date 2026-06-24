import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { downloadPrivateFile } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const result = await getDatabasePool().query<{
    storage_object_key: string | null
    original_file_name: string | null
    mime_type: string | null
  }>(
    `
      select
        payment_qr.storage_object_key,
        payment_qr.original_file_name,
        payment_qr.mime_type
      from society_profile sp
      left join file_objects payment_qr
        on payment_qr.id = sp.payment_qr_file_id
        and payment_qr.storage_target_key = 'qr_images'
        and payment_qr.upload_status = 'READY'
      where sp.id = $1
      limit 1
    `,
    [authMe.user.societyId],
  )
  const paymentQr = result.rows[0]

  if (!paymentQr?.storage_object_key) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Payment QR code not found.',
    })
  }

  const blob = await downloadPrivateFile({
    storageTargetKey: 'qr_images',
    storageObjectKey: paymentQr.storage_object_key,
  })
  const fileName = (paymentQr.original_file_name ?? 'payment-qr').replace(/"/g, '')

  setHeader(event, 'content-type', paymentQr.mime_type ?? 'application/octet-stream')
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'content-disposition', `inline; filename="${fileName}"`)

  return Buffer.from(await blob.arrayBuffer())
})
