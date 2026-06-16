import { createApiSuccess } from '~/server/utils/api'
import { accessSharedReport } from '~/server/utils/report-shares'

export default defineEventHandler(async (event) => {
  const token = String(event.context.params?.token ?? '')
  const result = await accessSharedReport(token, true)

  return createApiSuccess(event, result)
})
