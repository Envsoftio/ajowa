import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { downloadPrivateFile } from '~/server/utils/storage'

type ResidentPhotoRow = {
  profile_image_path: string | null
  original_file_name: string | null
  mime_type: string | null
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])

  const result = await getDatabasePool().query<ResidentPhotoRow>(
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
      limit 1
    `,
    [authMe.user.id, authMe.user.societyId],
  )
  const resident = result.rows[0]

  if (!resident?.profile_image_path) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Profile photo not found.',
    })
  }

  const blob = await downloadPrivateFile({
    storageTargetKey: 'resident_documents',
    storageObjectKey: resident.profile_image_path,
  })
  const buffer = Buffer.from(await blob.arrayBuffer())
  const fileName = (resident.original_file_name ?? 'profile-photo').replace(/"/g, '')

  setHeader(event, 'content-type', resident.mime_type ?? 'image/webp')
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'content-disposition', `inline; filename="${fileName}"`)

  return buffer
})
