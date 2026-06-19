import { setHeader } from 'h3'
import { requireActiveUser } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { downloadPrivateFile } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const id = readUuidParam(event)

  const result = await getDatabasePool().query<{
    qr_image_path: string | null
    status: string
    is_valid: boolean
    expires_at: string | null
  }>(
    `
      select qr_image_path, status, is_valid, expires_at::text
      from access_tokens
      where id = $1
        and user_id = $2
        and society_id = $3
      limit 1
    `,
    [id, authMe.user.id, authMe.user.societyId],
  )

  const token = result.rows[0]
  if (!token || token.status !== 'ACTIVE' || !token.is_valid) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'QR image not found.' })
  }

  if (token.expires_at && new Date(token.expires_at).getTime() <= Date.now()) {
    throw new AppError({ code: 'VALIDATION_ERROR', statusCode: 410, message: 'QR image has expired.' })
  }

  if (!token.qr_image_path) {
    throw new AppError({ code: 'INTERNAL_ERROR', statusCode: 500, message: 'QR image is unavailable.' })
  }

  setHeader(event, 'content-type', 'image/png')
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'content-disposition', 'inline; filename="ajowa-gate-qr.png"')

  const imageMatch = token.qr_image_path.match(/^data:image\/png;base64,(.+)$/)
  if (imageMatch?.[1]) {
    return Buffer.from(imageMatch[1], 'base64')
  }

  const blob = await downloadPrivateFile({
    storageTargetKey: 'qr_images',
    storageObjectKey: token.qr_image_path,
  })

  return Buffer.from(await blob.arrayBuffer())
})
