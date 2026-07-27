import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { getManagedFamilyMember } from '~/server/utils/family-members'
import { setEventHeader } from '~/server/utils/http-event'
import { readUuidParam } from '~/server/utils/master-data'
import { downloadPrivateFile } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const userId = readUuidParam(event)
  const query = getQuery(event)
  const cacheNonce = String(query.v ?? '').trim()
  const client = await getDatabasePool().connect()

  try {
    const member = await getManagedFamilyMember(client, authMe, userId)

    if (!member.profile_image_path) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Family member photo not found.',
      })
    }

    const fileResult = await client.query<{
      original_file_name: string | null
      mime_type: string | null
    }>(
      `
        select original_file_name, mime_type
        from file_objects
        where storage_object_key = $1
          and storage_target_key = 'resident_documents'
          and upload_status = 'READY'
        limit 1
      `,
      [member.profile_image_path],
    )

    const blob = await downloadPrivateFile({
      storageTargetKey: 'resident_documents',
      storageObjectKey: member.profile_image_path,
      cacheNonce: cacheNonce || member.profile_image_path,
      cache: 'no-store',
    })
    const buffer = Buffer.from(await blob.arrayBuffer())
    const fileName = (fileResult.rows[0]?.original_file_name ?? 'family-member-photo').replace(/"/g, '')

    setEventHeader(event, 'content-type', fileResult.rows[0]?.mime_type ?? 'image/jpeg')
    setEventHeader(event, 'cache-control', 'private, no-store')
    setEventHeader(event, 'content-disposition', `inline; filename="${fileName}"`)

    return buffer
  } finally {
    client.release()
  }
})
