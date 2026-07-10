import { requireRole } from '~/server/utils/auth'
import { createFileResponse } from '~/server/utils/file-response'
import { getEventQuery } from '~/server/utils/http-event'
import { readUuidParam } from '~/server/utils/master-data'
import { downloadServiceRequestAttachment } from '~/server/utils/service-requests'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['SERVICE_STAFF'])
  const id = readUuidParam(event)
  const attachmentId = readUuidParam(event, 'attachmentId')
  const attachment = await downloadServiceRequestAttachment(authMe, id, attachmentId, 'service')
  const disposition = getEventQuery(event).download === '1' ? 'attachment' : 'inline'

  return createFileResponse({
    buffer: attachment.buffer,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    disposition,
  })
})
