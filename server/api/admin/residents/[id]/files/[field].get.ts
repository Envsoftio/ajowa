import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { downloadPrivateFile } from '~/server/utils/storage'

const residentFileFields = {
  profileImagePath: 'profile_image_path',
  governmentIdDocumentPath: 'government_id_document_path',
  ownershipProofPath: 'ownership_proof_path',
  leaseAgreementPath: 'lease_agreement_path',
} as const

type ResidentFileField = keyof typeof residentFileFields

type ResidentFileRow = {
  file_path: string | null
  original_file_name: string | null
  mime_type: string | null
}

const isResidentFileField = (value: string): value is ResidentFileField =>
  value in residentFileFields

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const field = String(event.context.params?.field ?? '')
  const query = getQuery(event)
  const cacheNonce = String(query.v ?? '').trim()

  if (!isResidentFileField(field)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported resident file field.' })
  }

  const column = residentFileFields[field]
  const result = await getDatabasePool().query<ResidentFileRow>(
    `
      select
        u.${column} as file_path,
        fo.original_file_name,
        fo.mime_type
      from users u
      left join file_objects fo on fo.storage_object_key = u.${column}
      where u.id = $1 and u.society_id = $2 and u.role = 'RESIDENT'
      limit 1
    `,
    [id, authMe.user.societyId],
  )
  const residentFile = result.rows[0]

  if (!residentFile?.file_path) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Resident file not found.',
    })
  }

  const blob = await downloadPrivateFile({
    storageTargetKey: 'resident_documents',
    storageObjectKey: residentFile.file_path,
    ...(field === 'profileImagePath'
      ? {
          cacheNonce: cacheNonce || residentFile.file_path,
          cache: 'no-store' as const,
        }
      : {}),
  })
  const buffer = Buffer.from(await blob.arrayBuffer())
  const fileName = (residentFile.original_file_name ?? field).replace(/"/g, '')

  setHeader(event, 'content-type', residentFile.mime_type ?? 'application/octet-stream')
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'content-disposition', `inline; filename="${fileName}"`)

  return buffer
})
