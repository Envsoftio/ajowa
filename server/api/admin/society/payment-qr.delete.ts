import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { deletePrivateFile } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const pool = getDatabasePool()
  const result = await pool.query<{
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
  const society = result.rows[0]

  if (!society) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Society profile not found.',
    })
  }

  if (!society.payment_qr_file_id) {
    return createApiSuccess(event, { removed: false })
  }

  await pool.query(
    `
      update society_profile
      set payment_qr_file_id = null,
          updated_at = now()
      where id = $1 and payment_qr_file_id = $2
    `,
    [authMe.user.societyId, society.payment_qr_file_id],
  )

  if (society.storage_object_key) {
    await deletePrivateFile({
      storageTargetKey: 'qr_images',
      storageObjectKey: society.storage_object_key,
      fileId: society.payment_qr_file_id,
    }).catch((error) => {
      console.warn(
        JSON.stringify({
          level: 'warn',
          message: 'Unable to remove society payment QR image after clearing profile reference.',
          fileId: society.payment_qr_file_id,
          cause: error instanceof Error ? error.message : String(error),
        }),
      )
    })
  }

  return createApiSuccess(event, { removed: true })
})
