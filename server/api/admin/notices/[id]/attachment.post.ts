import { createHash } from 'node:crypto'
import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { readMultipartFormParts } from '~/server/utils/multipart'
import { createStorageObjectKey, uploadPrivateFile } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const noticeId = readUuidParam(event)
  const parts = await readMultipartFormParts(event)
  const filePart = parts?.find((part) => part.name === 'file' && part.filename)
  const labelPart = parts?.find((part) => part.name === 'label')
  const label = labelPart ? Buffer.from(labelPart.data).toString('utf8').trim() : ''
  const fileMimeType = filePart?.type || 'application/octet-stream'

  if (!filePart?.filename || !filePart.data?.byteLength) {
    throw createError({ statusCode: 400, statusMessage: 'A notice attachment file is required.' })
  }

  const pool = getDatabasePool()
  const notice = await pool.query<{ id: string }>(
    'select id from notices where id = $1 and society_id = $2 limit 1',
    [noticeId, authMe.user.societyId],
  )

  if (!notice.rows[0]) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Notice not found.' })
  }

  const storageObjectKey = createStorageObjectKey({
    recordType: 'notice',
    recordId: noticeId,
    fileName: filePart.filename,
  })
  const checksum = createHash('sha256').update(filePart.data).digest('hex')
  const storedFile = await uploadPrivateFile({
    storageTargetKey: 'notice_attachments',
    storageObjectKey,
    originalFileName: filePart.filename,
    mimeType: fileMimeType,
    sizeBytes: filePart.data.byteLength,
    body: filePart.data,
    uploadedBy: authMe.user.id,
    relation: {
      recordType: 'notices',
      recordId: noticeId,
    },
    checksum,
  })

  await pool.query(
    `
      update notices
      set attachment_file_id = $3,
          attachment_label = $4,
          updated_at = now()
      where id = $1 and society_id = $2
    `,
    [noticeId, authMe.user.societyId, storedFile.id, label || filePart.filename],
  )

  return createApiSuccess(event, {
    id: storedFile.id,
    fileName: filePart.filename,
    label: label || filePart.filename,
    downloadUrl: `/api/admin/notices/${noticeId}/attachment`,
  })
})
