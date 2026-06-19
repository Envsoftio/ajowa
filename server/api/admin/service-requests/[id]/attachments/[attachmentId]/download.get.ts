import { requireRole } from '~/server/utils/auth'
import { readUuidParam } from '~/server/utils/master-data'
import { downloadServiceRequestAttachment } from '~/server/utils/service-requests'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const attachmentId = readUuidParam(event, 'attachmentId')
  const attachment = await downloadServiceRequestAttachment(authMe, id, attachmentId, 'admin')

  setHeader(event, 'content-type', attachment.mimeType)
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'content-disposition', `inline; filename="${attachment.fileName.replace(/"/g, '')}"`)

  return attachment.buffer
})
