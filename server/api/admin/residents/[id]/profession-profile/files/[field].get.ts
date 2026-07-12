import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { downloadPrivateFile } from '~/server/utils/storage'

const proofFileFields = {
  professionConsentProofFilePath: 'profession_consent_proof_file_path',
  contactConsentProofFilePath: 'contact_consent_proof_file_path',
} as const

type ProofFileField = keyof typeof proofFileFields

type ProofFileRow = {
  file_path: string | null
  original_file_name: string | null
  mime_type: string | null
}

const isProofFileField = (value: string): value is ProofFileField =>
  value in proofFileFields

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const field = String(event.context.params?.field ?? '')

  if (!isProofFileField(field)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Unsupported profession proof field.',
    })
  }

  const column = proofFileFields[field]
  const result = await getDatabasePool().query<ProofFileRow>(
    `
      select
        rpp.${column} as file_path,
        fo.original_file_name,
        fo.mime_type
      from resident_profession_profiles rpp
      inner join users u on u.id = rpp.user_id
      left join file_objects fo
        on fo.storage_object_key = rpp.${column}
        and fo.storage_target_key = 'resident_documents'
      where rpp.user_id = $1
        and rpp.society_id = $2
        and u.role = 'RESIDENT'
      limit 1
    `,
    [id, authMe.user.societyId],
  )
  const proofFile = result.rows[0]

  if (!proofFile?.file_path) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Consent proof file not found.',
    })
  }

  const blob = await downloadPrivateFile({
    storageTargetKey: 'resident_documents',
    storageObjectKey: proofFile.file_path,
  })
  const buffer = Buffer.from(await blob.arrayBuffer())
  const fileName = (proofFile.original_file_name ?? field).replace(/"/g, '')

  setHeader(
    event,
    'content-type',
    proofFile.mime_type ?? 'application/octet-stream',
  )
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'content-disposition', `inline; filename="${fileName}"`)

  return buffer
})
