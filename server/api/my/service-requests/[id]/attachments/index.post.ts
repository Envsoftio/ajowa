import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { readUuidParam } from '~/server/utils/master-data'
import { uploadServiceRequestAttachment } from '~/server/utils/service-requests'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const id = readUuidParam(event)
  const parts = await readMultipartFormData(event)
  const filePart = parts?.find((part) => part.name === 'file' && part.filename)

  if (!filePart?.filename || !filePart.type) {
    throw createError({ statusCode: 400, statusMessage: 'A service request attachment is required.' })
  }

  const attachment = await uploadServiceRequestAttachment(
    authMe,
    id,
    {
      fileName: filePart.filename,
      mimeType: filePart.type,
      sizeBytes: filePart.data.byteLength,
      body: Buffer.from(filePart.data),
    },
    'resident',
  )

  return createApiSuccess(event, attachment)
})
