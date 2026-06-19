import { createHash } from 'node:crypto'
import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getQuerySafe } from '~/server/utils/master-data'
import {
  buildReport,
  buildReportFilename,
  generateReportPdf,
  generateReportWorkbook,
  parseReportFilters,
  type ExportFormat,
} from '~/server/utils/reports'
import { createStorageObjectKey, uploadPrivateFile } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = getQuerySafe(event)
  const format = String(query.format ?? 'pdf') as ExportFormat

  if (!['pdf', 'xlsx'].includes(format)) {
    return createApiSuccess(event, { message: 'Unsupported export format.' })
  }

  const filters = parseReportFilters(query, { limit: 10000 })
  const report = await buildReport({ societyId: authMe.user.societyId, filters, exportMode: true })
  const buffer =
    format === 'xlsx' ? generateReportWorkbook(report) : await generateReportPdf(report, authMe.user.societyId)
  const extension = format === 'xlsx' ? 'xlsx' : 'pdf'
  const fileName = buildReportFilename(report, extension)
  const mimeType = format === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/pdf'
  const storageObjectKey = createStorageObjectKey({
    recordType: 'finance-report-export',
    recordId: authMe.user.societyId,
    fileName,
  })

  await uploadPrivateFile({
    storageTargetKey: 'report_exports',
    storageObjectKey,
    originalFileName: fileName,
    mimeType,
    sizeBytes: buffer.length,
    body: buffer,
    uploadedBy: authMe.user.id,
    relation: {
      recordType: 'finance_reports',
      recordId: authMe.user.societyId,
    },
    checksum: createHash('sha256').update(buffer).digest('hex'),
  })

  setHeader(event, 'content-type', mimeType)
  setHeader(event, 'content-disposition', `attachment; filename="${fileName}"`)
  setHeader(event, 'x-report-generation-ms', String(report.performanceMs))
  setHeader(event, 'x-storage-object-key', storageObjectKey)

  return buffer
})
