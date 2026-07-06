import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import {
  buildDefaulterExportFilename,
  buildDefaulterPdf,
  buildDefaulterWorkbook,
  listDefaulters,
  parseDefaulterFilters,
} from '~/server/utils/defaulters'
import { setEventHeader } from '~/server/utils/http-event'
import { getQuerySafe } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = getQuerySafe(event)
  const filters = parseDefaulterFilters(query)
  const defaulters = await listDefaulters({
    societyId: authMe.user.societyId,
    filters,
  })
  const exportFormat = String(query.export ?? '').toLowerCase()

  if (exportFormat === 'pdf') {
    const fileName = buildDefaulterExportFilename('pdf')

    setEventHeader(event, 'content-type', 'application/pdf')
    setEventHeader(
      event,
      'content-disposition',
      `attachment; filename="${fileName}"`,
    )

    return await buildDefaulterPdf(defaulters, authMe.user.societyId, filters)
  }

  if (exportFormat === 'excel' || exportFormat === 'xlsx') {
    const fileName = buildDefaulterExportFilename('xlsx')

    setEventHeader(
      event,
      'content-type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    setEventHeader(
      event,
      'content-disposition',
      `attachment; filename="${fileName}"`,
    )

    return buildDefaulterWorkbook(defaulters, filters)
  }

  if (exportFormat) {
    return createApiSuccess(event, { message: 'Unsupported export format.' })
  }

  return createApiSuccess(event, defaulters)
})
