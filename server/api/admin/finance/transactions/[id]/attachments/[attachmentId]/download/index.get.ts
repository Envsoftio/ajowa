import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { downloadPrivateFile } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const transactionId = String(event.context.params?.id ?? '')
  const attachmentId = String(event.context.params?.attachmentId ?? '')

  const result = await getDatabasePool().query<{
    file_name: string
    file_path: string
    mime_type: string
  }>(
    `
      select ta.file_name, ta.file_path, ta.mime_type
      from transaction_attachments ta
      join transactions t on t.id = ta.transaction_id
      where ta.id = $1 and ta.transaction_id = $2 and t.society_id = $3
      limit 1
    `,
    [attachmentId, transactionId, authMe.user.societyId],
  )

  const attachment = result.rows[0]
  if (!attachment) {
    throw createError({ statusCode: 404, statusMessage: 'Attachment not found.' })
  }

  const blob = await downloadPrivateFile({
    storageTargetKey: 'finance_attachments',
    storageObjectKey: attachment.file_path,
  })
  const buffer = Buffer.from(await blob.arrayBuffer())

  setHeader(event, 'content-type', attachment.mime_type)
  setHeader(
    event,
    'content-disposition',
    `inline; filename="${attachment.file_name.replace(/"/g, '')}"`,
  )

  return buffer
})
