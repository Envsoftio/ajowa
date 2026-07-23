import { createHash } from 'node:crypto'
import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam, writeMasterAudit } from '~/server/utils/master-data'
import { readMultipartFormParts } from '~/server/utils/multipart'
import {
  createStorageObjectKey,
  replacePrivateFile,
  uploadPrivateFile,
} from '~/server/utils/storage'

const ONE_MEGABYTE = 1024 * 1024
const TEN_MEGABYTES = 10 * 1024 * 1024

const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const documentMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])

const residentFileFields = {
  profileImagePath: {
    column: 'profile_image_path',
    label: 'Profile photo',
    recordType: 'resident-profile-photo',
    allowedMimeTypes: imageMimeTypes,
    maxSizeBytes: ONE_MEGABYTE,
    invalidTypeMessage: 'Upload a PNG, JPG, JPEG, or WebP profile photo.',
    invalidSizeMessage: 'Profile photos must be 1 MB or smaller.',
  },
  governmentIdDocumentPath: {
    column: 'government_id_document_path',
    label: 'Government ID document',
    recordType: 'resident-government-id',
    allowedMimeTypes: documentMimeTypes,
    maxSizeBytes: TEN_MEGABYTES,
    invalidTypeMessage: 'Upload a PDF, PNG, JPG, JPEG, or WebP document.',
    invalidSizeMessage: 'Resident documents must be 10 MB or smaller.',
  },
  ownershipProofPath: {
    column: 'ownership_proof_path',
    label: 'Ownership proof',
    recordType: 'resident-ownership-proof',
    allowedMimeTypes: documentMimeTypes,
    maxSizeBytes: TEN_MEGABYTES,
    invalidTypeMessage: 'Upload a PDF, PNG, JPG, JPEG, or WebP document.',
    invalidSizeMessage: 'Resident documents must be 10 MB or smaller.',
  },
  leaseAgreementPath: {
    column: 'lease_agreement_path',
    label: 'Lease agreement',
    recordType: 'resident-lease-agreement',
    allowedMimeTypes: documentMimeTypes,
    maxSizeBytes: TEN_MEGABYTES,
    invalidTypeMessage: 'Upload a PDF, PNG, JPG, JPEG, or WebP document.',
    invalidSizeMessage: 'Resident documents must be 10 MB or smaller.',
  },
} as const

type ResidentFileField = keyof typeof residentFileFields

const isResidentFileField = (value: string): value is ResidentFileField =>
  value in residentFileFields

const getProfilePhotoStorageObjectKey = (userId: string, fileName: string) => {
  const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() ?? 'webp' : 'webp'
  return `resident-profile-photo/${userId}/profile.${extension}`
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const parts = await readMultipartFormParts(event)
  const fieldPart = parts?.find((part) => part.name === 'field')
  const filePart = parts?.find((part) => part.name === 'file' && part.filename)
  const field = fieldPart ? Buffer.from(fieldPart.data).toString('utf8') : ''
  const fileMimeType = filePart?.type || 'application/octet-stream'

  if (!isResidentFileField(field)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported resident file field.' })
  }

  const config = residentFileFields[field]

  if (!filePart?.filename || !filePart.data?.byteLength) {
    throw createError({ statusCode: 400, statusMessage: `${config.label} file is required.` })
  }

  if (!config.allowedMimeTypes.has(fileMimeType)) {
    throw createError({ statusCode: 400, statusMessage: config.invalidTypeMessage })
  }

  if (filePart.data.byteLength <= 0 || filePart.data.byteLength > config.maxSizeBytes) {
    throw createError({ statusCode: 400, statusMessage: config.invalidSizeMessage })
  }

  const pool = getDatabasePool()
  const residentResult = await pool.query<{
    full_name: string
    file_path: string | null
    file_id: string | null
  }>(
    `
      select
        u.full_name,
        u.${config.column} as file_path,
        fo.id as file_id
      from users u
      left join file_objects fo
        on fo.storage_object_key = u.${config.column}
        and fo.storage_target_key = 'resident_documents'
      where u.id = $1 and u.society_id = $2 and u.role = 'RESIDENT'
      limit 1
    `,
    [id, authMe.user.societyId],
  )
  const resident = residentResult.rows[0]

  if (!resident) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Resident not found.',
    })
  }

  const storageObjectKey = field === 'profileImagePath'
    ? getProfilePhotoStorageObjectKey(id, filePart.filename)
    : createStorageObjectKey({
        recordType: config.recordType,
        recordId: id,
        fileName: filePart.filename,
      })
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
      recordId: id,
    },
    checksum,
  } as const

  if (field === 'profileImagePath' && resident.file_id) {
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
      file_path: string
      updated_at: string
    }>(
      `
        update users
        set
          ${config.column} = $3,
          updated_at = now()
        where id = $1 and society_id = $2 and role = 'RESIDENT'
        returning ${config.column} as file_path, updated_at::text
      `,
      [id, authMe.user.societyId, storageObjectKey],
    )
    const updated = updateResult.rows[0]

    if (!updated) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Resident not found.',
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
        [field]: resident.file_path,
      },
      afterState: {
        fullName: resident.full_name,
        [field]: updated.file_path,
      },
      relatedEntities: [{ entityTable: 'users', entityId: id, entityLabel: resident.full_name }],
      targetUserId: id,
    })

    await client.query('commit')

    return createApiSuccess(event, {
      field,
      filePath: updated.file_path,
      fileUrl: `/api/admin/residents/${id}/files/${field}?v=${encodeURIComponent(updated.updated_at)}`,
      updatedAt: updated.updated_at,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
