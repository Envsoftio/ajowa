import { createHash } from 'node:crypto'
import { createApiSuccess } from '~/server/utils/api'
import { accessSharedReport } from '~/server/utils/report-shares'
import { buildReportFilename, generateReportPdf } from '~/server/utils/reports'
import { createStorageObjectKey, uploadPrivateFile } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const token = String(event.context.params?.token ?? '')
  const result = await accessSharedReport(token, true)

  if (result.state !== 'OK' || !result.report || !result.share) {
    return createApiSuccess(event, result)
  }

  const buffer = await generateReportPdf(result.report, result.share.societyId)
  const fileName = buildReportFilename(result.report, 'pdf')
  const storageObjectKey = createStorageObjectKey({
    recordType: 'shared-report-export',
    recordId: result.share.id,
    fileName,
  })

  await uploadPrivateFile({
    storageTargetKey: 'report_exports',
    storageObjectKey,
    originalFileName: fileName,
    mimeType: 'application/pdf',
    sizeBytes: buffer.length,
    body: buffer,
    uploadedBy: `shared-report:${result.share.id}`,
    relation: {
      recordType: 'shared_report_links',
      recordId: result.share.id,
    },
    checksum: createHash('sha256').update(buffer).digest('hex'),
  })

  setHeader(event, 'content-type', 'application/pdf')
  setHeader(event, 'content-disposition', `attachment; filename="${fileName}"`)
  setHeader(event, 'x-storage-object-key', storageObjectKey)

  return buffer
})
