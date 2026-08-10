import { z } from 'zod'
import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { downloadPrivateFile } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'finance.view')
  const moveCaseId = z
    .string()
    .uuid()
    .parse(String(event.context.params?.id ?? ''))
  const attachmentId = z
    .string()
    .uuid()
    .parse(String(event.context.params?.attachmentId ?? ''))
  const result = await getDatabasePool().query<{
    file_name: string
    file_path: string
    mime_type: string
  }>(
    `
      select file_name, file_path, mime_type
      from tenant_move_attachments
      where id = $1
        and move_case_id = $2
        and society_id = $3
      limit 1
    `,
    [attachmentId, moveCaseId, authMe.user.societyId],
  )
  const attachment = result.rows[0]
  if (!attachment) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Attachment not found.',
    })
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
