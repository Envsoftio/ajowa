import { requireActiveUser } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { setEventHeader } from '~/server/utils/http-event'
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
    is_current_period: boolean
  }>(
    `
      select
        at.qr_image_path,
        at.status,
        at.is_valid,
        coalesce(at.expires_at, at.valid_until)::text as expires_at,
        (
          bp.start_date <= (now() at time zone sp.timezone)::date
          and bp.end_date >= (now() at time zone sp.timezone)::date
        ) as is_current_period
      from access_tokens at
      inner join billing_periods bp on bp.id = at.billing_period_id
      inner join society_profile sp on sp.id = at.society_id
      where at.id = $1
        and at.user_id = $2
        and at.society_id = $3
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

  if (!token.is_current_period) {
    throw new AppError({ code: 'VALIDATION_ERROR', statusCode: 410, message: 'QR image is not for the current billing period.' })
  }

  if (!token.qr_image_path) {
    throw new AppError({ code: 'INTERNAL_ERROR', statusCode: 500, message: 'QR image is unavailable.' })
  }

  setEventHeader(event, 'content-type', 'image/png')
  setEventHeader(event, 'cache-control', 'private, no-store')
  setEventHeader(event, 'content-disposition', 'inline; filename="ajowa-gate-qr.png"')

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
