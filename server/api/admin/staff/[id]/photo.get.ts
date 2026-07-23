import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { downloadPrivateFile } from '~/server/utils/storage'

type StaffPhotoRow = {
  profile_image_path: string | null
  original_file_name: string | null
  mime_type: string | null
}

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'staff.manage')
  const id = readUuidParam(event)
  const query = getQuery(event)
  const cacheNonce = String(query.v ?? '').trim()
  const result = await getDatabasePool().query<StaffPhotoRow>(
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
        and u.role in ('MANAGER', 'SERVICE_STAFF', 'GUARD')
        and u.deleted_at is null
      limit 1
    `,
    [id, authMe.user.societyId],
  )
  const staff = result.rows[0]

  if (!staff?.profile_image_path) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Staff profile photo was not found.',
    })
  }

  const blob = await downloadPrivateFile({
    storageTargetKey: 'resident_documents',
    storageObjectKey: staff.profile_image_path,
    cacheNonce: cacheNonce || staff.profile_image_path,
    cache: 'no-store',
  })
  const buffer = Buffer.from(await blob.arrayBuffer())
  const fileName = (staff.original_file_name ?? 'profile-photo').replace(/"/g, '')

  setHeader(event, 'content-type', staff.mime_type ?? 'image/webp')
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'content-disposition', `inline; filename="${fileName}"`)

  return buffer
})
