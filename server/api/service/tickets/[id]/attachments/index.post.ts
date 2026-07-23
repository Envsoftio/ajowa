import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { readUuidParam } from '~/server/utils/master-data'
import { readMultipartFormParts } from '~/server/utils/multipart'
import { uploadServiceRequestAttachment } from '~/server/utils/service-requests'
import { resolveStorageUploadMimeType } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['SERVICE_STAFF'])
  const id = readUuidParam(event)
  const parts = await readMultipartFormParts(event)
  const filePart = parts?.find((part) => part.name === 'file' && part.filename)
  const fileMimeType = filePart?.filename
    ? resolveStorageUploadMimeType(filePart.filename, filePart.type)
    : 'application/octet-stream'

  if (!filePart?.filename || !filePart.data?.byteLength) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A service request attachment is required.',
    })
  }

  const attachment = await uploadServiceRequestAttachment(
    authMe,
    id,
    {
      fileName: filePart.filename,
      mimeType: fileMimeType,
      sizeBytes: filePart.data.byteLength,
      body: Buffer.from(filePart.data),
    },
    'service',
    {
      waitUntil: event.waitUntil.bind(event),
    },
  )

  return createApiSuccess(event, attachment)
})
