import { requireRole } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { downloadPrivateFile } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const noticeId = readUuidParam(event)
  const result = await queryRows<{
    storage_object_key: string | null
    original_file_name: string | null
    mime_type: string | null
  }>(
    `
      select
        fo.storage_object_key,
        fo.original_file_name,
        fo.mime_type
      from notices n
      left join file_objects fo on fo.id = n.attachment_file_id
      where n.id = $1 and n.society_id = $2
      limit 1
    `,
    [noticeId, authMe.user.societyId],
  )
  const attachment = result.rows[0]

  if (!attachment?.storage_object_key) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Notice attachment not found.' })
  }

  const blob = await downloadPrivateFile({
    storageTargetKey: 'notice_attachments',
    storageObjectKey: attachment.storage_object_key,
  })
  const fileName = (attachment.original_file_name ?? 'notice-attachment').replace(/"/g, '')

  setHeader(event, 'content-type', attachment.mime_type ?? 'application/octet-stream')
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'content-disposition', `inline; filename="${fileName}"`)

  return Buffer.from(await blob.arrayBuffer())
})
