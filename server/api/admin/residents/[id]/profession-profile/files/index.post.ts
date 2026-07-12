import { createHash } from 'node:crypto'
import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam, writeMasterAudit } from '~/server/utils/master-data'
import { readMultipartFormParts } from '~/server/utils/multipart'
import {
  createStorageObjectKey,
  uploadPrivateFile,
} from '~/server/utils/storage'

const TEN_MEGABYTES = 10 * 1024 * 1024

const proofMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])

const proofFileFields = {
  professionConsentProofFilePath: {
    column: 'profession_consent_proof_file_path',
    label: 'Profession consent proof',
    recordType: 'resident-profession-consent',
    recordedAtColumn: 'profession_consent_recorded_at',
    recordedByColumn: 'profession_consent_recorded_by_user_id',
  },
  contactConsentProofFilePath: {
    column: 'contact_consent_proof_file_path',
    label: 'Contact sharing consent proof',
    recordType: 'resident-profession-contact-consent',
    recordedAtColumn: 'contact_consent_recorded_at',
    recordedByColumn: 'contact_consent_recorded_by_user_id',
  },
} as const

type ProofFileField = keyof typeof proofFileFields

const isProofFileField = (value: string): value is ProofFileField =>
  value in proofFileFields

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const parts = await readMultipartFormParts(event)
  const fieldPart = parts?.find((part) => part.name === 'field')
  const filePart = parts?.find((part) => part.name === 'file' && part.filename)
  const field = fieldPart ? Buffer.from(fieldPart.data).toString('utf8') : ''
  const fileMimeType = filePart?.type || 'application/octet-stream'

  if (!isProofFileField(field)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Unsupported profession proof field.',
    })
  }

  const config = proofFileFields[field]

  if (!filePart?.filename || !filePart.data?.byteLength) {
    throw createError({
      statusCode: 400,
      statusMessage: `${config.label} file is required.`,
    })
  }

  if (!proofMimeTypes.has(fileMimeType)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Upload a PDF, PNG, JPG, JPEG, or WebP proof file.',
    })
  }

  if (
    filePart.data.byteLength <= 0 ||
    filePart.data.byteLength > TEN_MEGABYTES
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Consent proof files must be 10 MB or smaller.',
    })
  }

  const pool = getDatabasePool()
  const profileResult = await pool.query<{
    profile_id: string
    resident_name: string
    file_path: string | null
  }>(
    `
      select
        rpp.id as profile_id,
        u.full_name as resident_name,
        rpp.${config.column} as file_path
      from resident_profession_profiles rpp
      inner join users u on u.id = rpp.user_id
      where rpp.user_id = $1
        and rpp.society_id = $2
        and u.role = 'RESIDENT'
      limit 1
    `,
    [id, authMe.user.societyId],
  )
  const profile = profileResult.rows[0]

  if (!profile) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Save a profession profile before uploading consent proof.',
    })
  }

  const storageObjectKey = createStorageObjectKey({
    recordType: config.recordType,
    recordId: profile.profile_id,
    fileName: filePart.filename,
  })
  const checksum = createHash('sha256').update(filePart.data).digest('hex')

  await uploadPrivateFile({
    storageTargetKey: 'resident_documents',
    storageObjectKey,
    originalFileName: filePart.filename,
    mimeType: fileMimeType,
    sizeBytes: filePart.data.byteLength,
    body: filePart.data,
    uploadedBy: authMe.user.id,
    relation: {
      recordType: 'resident_profession_profiles',
      recordId: profile.profile_id,
    },
    checksum,
  })

  const client = await pool.connect()

  try {
    await client.query('begin')

    const updateResult = await client.query<{
      file_path: string
      updated_at: string
    }>(
      `
        update resident_profession_profiles
        set
          ${config.column} = $3,
          ${config.recordedAtColumn} = case
            when ${config.recordedAtColumn} is null then now()
            when is_public = true then now()
            else ${config.recordedAtColumn}
          end,
          ${config.recordedByColumn} = case
            when ${config.recordedByColumn} is null then $4
            when is_public = true then $4
            else ${config.recordedByColumn}
          end,
          updated_at = now()
        where user_id = $1 and society_id = $2
        returning ${config.column} as file_path, updated_at::text
      `,
      [id, authMe.user.societyId, storageObjectKey, authMe.user.id],
    )
    const updated = updateResult.rows[0]

    if (!updated) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Profession profile not found.',
      })
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'UPDATED',
      eventKey: 'resident_professions.consent_file.updated',
      beforeState: {
        residentName: profile.resident_name,
        [field]: profile.file_path,
      },
      afterState: {
        residentName: profile.resident_name,
        [field]: updated.file_path,
      },
      relatedEntities: [
        {
          entityTable: 'users',
          entityId: id,
          entityLabel: profile.resident_name,
        },
        {
          entityTable: 'resident_profession_profiles',
          entityId: profile.profile_id,
        },
      ],
      targetUserId: id,
    })

    await client.query('commit')

    return createApiSuccess(event, {
      field,
      filePath: updated.file_path,
      fileUrl: `/api/admin/residents/${id}/profession-profile/files/${field}?v=${encodeURIComponent(updated.updated_at)}`,
      updatedAt: updated.updated_at,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
