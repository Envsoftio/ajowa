import { createApiSuccess } from '~/server/utils/api'
import { accessSharedReport } from '~/server/utils/report-shares'
import { buildReportFilename, generateReportPdf } from '~/server/utils/reports'

export default defineEventHandler(async (event) => {
  const token = String(event.context.params?.token ?? '')
  const result = await accessSharedReport(token, true)

  if (result.state !== 'OK' || !result.report || !result.share) {
    return createApiSuccess(event, result)
  }

  const buffer = await generateReportPdf(result.report)
  setHeader(event, 'content-type', 'application/pdf')
  setHeader(event, 'content-disposition', `attachment; filename="${buildReportFilename(result.report, 'pdf')}"`)

  return buffer
})
