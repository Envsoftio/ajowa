import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { setEventHeader } from '~/server/utils/http-event'
import { readUuidParam } from '~/server/utils/master-data'
import { downloadPrivateFile } from '~/server/utils/storage'
import { QR_SCAN_ROLES } from '~/shared/auth'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, QR_SCAN_ROLES)
  const id = readUuidParam(event)
  const query = getQuery(event)
  const cacheNonce = String(query.v ?? '').trim()

  const result = await getDatabasePool().query<{
    profile_image_path: string | null
    original_file_name: string | null
    mime_type: string | null
  }>(
    `
      select
        u.profile_image_path,
        fo.original_file_name,
        fo.mime_type
      from users u
      left join file_objects fo
        on fo.storage_object_key = u.profile_image_path
        and fo.storage_target_key = 'resident_documents'
        and fo.upload_status = 'READY'
      where u.id = $1
        and u.society_id = $2
        and u.role = 'RESIDENT'
        and u.is_active = true
      limit 1
    `,
    [id, authMe.user.societyId],
  )

  const resident = result.rows[0]
  if (!resident?.profile_image_path) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Resident photo not found.',
    })
  }

  const blob = await downloadPrivateFile({
    storageTargetKey: 'resident_documents',
    storageObjectKey: resident.profile_image_path,
    cacheNonce: cacheNonce || resident.profile_image_path,
    cache: 'no-store',
  })
  const buffer = Buffer.from(await blob.arrayBuffer())
  const fileName = (resident.original_file_name ?? 'resident-photo').replace(/"/g, '')

  setEventHeader(event, 'content-type', resident.mime_type ?? 'image/jpeg')
  setEventHeader(event, 'cache-control', 'private, no-store')
  setEventHeader(event, 'content-disposition', `inline; filename="${fileName}"`)

  return buffer
})
