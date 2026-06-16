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

  setHeader(
    event,
    'content-type',
    format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf',
  )
  setHeader(event, 'content-disposition', `attachment; filename="${buildReportFilename(report, extension)}"`)
  setHeader(event, 'x-report-generation-ms', String(report.performanceMs))

  return buffer
})
