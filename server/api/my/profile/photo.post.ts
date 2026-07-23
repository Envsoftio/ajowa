import { createHash } from 'node:crypto'
import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { writeMasterAudit } from '~/server/utils/master-data'
import { readMultipartFormParts } from '~/server/utils/multipart'
import { replacePrivateFile, uploadPrivateFile } from '~/server/utils/storage'

const ONE_MEGABYTE = 1024 * 1024
const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

const getProfilePhotoStorageObjectKey = (userId: string, fileName: string) => {
  const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() ?? 'webp' : 'webp'
  return `resident-profile-photo/${userId}/profile.${extension}`
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const parts = await readMultipartFormParts(event)
  const filePart = parts.find((part) => part.name === 'file' && part.filename)
  const fileMimeType = filePart?.type || 'application/octet-stream'

  if (!filePart?.filename || !filePart.data?.byteLength) {
    throw createError({ statusCode: 400, statusMessage: 'Profile photo file is required.' })
  }

  if (!imageMimeTypes.has(fileMimeType)) {
    throw createError({ statusCode: 400, statusMessage: 'Upload a PNG, JPG, JPEG, or WebP profile photo.' })
  }

  if (filePart.data.byteLength <= 0 || filePart.data.byteLength > ONE_MEGABYTE) {
    throw createError({ statusCode: 400, statusMessage: 'Profile photo must be 1 MB or smaller.' })
  }

  const pool = getDatabasePool()
  const residentResult = await pool.query<{
    full_name: string
    profile_image_path: string | null
    file_id: string | null
  }>(
    `
      select
        u.full_name,
        u.profile_image_path,
        fo.id as file_id
      from users u
      left join file_objects fo
        on fo.storage_object_key = u.profile_image_path
        and fo.storage_target_key = 'resident_documents'
      where u.id = $1
        and u.society_id = $2
        and u.role = 'RESIDENT'
        and u.deleted_at is null
      limit 1
    `,
    [authMe.user.id, authMe.user.societyId],
  )
  const resident = residentResult.rows[0]

  if (!resident) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Resident profile not found.',
    })
  }

  const storageObjectKey = getProfilePhotoStorageObjectKey(authMe.user.id, filePart.filename)
  const checksum = createHash('sha256').update(filePart.data).digest('hex')
  const fileInput = {
    storageTargetKey: 'resident_documents',
    storageObjectKey,
    originalFileName: filePart.filename,
    mimeType: fileMimeType,
    sizeBytes: filePart.data.byteLength,
    body: filePart.data,
    uploadedBy: authMe.user.id,
    relation: {
      recordType: 'users',
      recordId: authMe.user.id,
    },
    checksum,
  } as const

  if (resident.file_id) {
    await replacePrivateFile({
      ...fileInput,
      fileId: resident.file_id,
    })
  } else {
    await uploadPrivateFile(fileInput)
  }

  const client = await pool.connect()

  try {
    await client.query('begin')

    const updateResult = await client.query<{
      profile_image_path: string
      updated_at: string
    }>(
      `
        update users
        set
          profile_image_path = $3,
          updated_at = now()
        where id = $1
          and society_id = $2
          and role = 'RESIDENT'
          and deleted_at is null
        returning profile_image_path, updated_at::text
      `,
      [authMe.user.id, authMe.user.societyId, storageObjectKey],
    )
    const updated = updateResult.rows[0]

    if (!updated) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Resident profile not found.',
      })
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'UPDATED',
      eventKey: 'residents.file.updated',
      beforeState: {
        fullName: resident.full_name,
        profileImagePath: resident.profile_image_path,
      },
      afterState: {
        fullName: resident.full_name,
        profileImagePath: updated.profile_image_path,
      },
      relatedEntities: [{ entityTable: 'users', entityId: authMe.user.id, entityLabel: resident.full_name }],
      targetUserId: authMe.user.id,
    })

    await client.query('commit')

    return createApiSuccess(event, {
      profileImagePath: updated.profile_image_path,
      profileImageUrl: `/api/my/profile/photo?v=${encodeURIComponent(updated.updated_at)}`,
      updatedAt: updated.updated_at,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
