import { createApiSuccess } from '~/server/utils/api'
import { accessSharedReport } from '~/server/utils/report-shares'
import { getHeader, setHeader, setResponseStatus } from 'h3'

export default defineEventHandler(async (event) => {
  const token = String(event.context.params?.token ?? '')

  const acceptHeader = String(getHeader(event, 'accept') ?? '')
  const fetchDestination = String(getHeader(event, 'sec-fetch-dest') ?? '')
  const fetchMode = String(getHeader(event, 'sec-fetch-mode') ?? '')
  const isBrowserNavigation =
    fetchDestination === 'document' ||
    (fetchMode === 'navigate' && acceptHeader.includes('text/html'))

  if (isBrowserNavigation) {
    setResponseStatus(event, 302, 'Found')
    setHeader(event, 'location', `/shared/report/${token}`)
    return
  }

  const result = await accessSharedReport(token, true)

  return createApiSuccess(event, result)
})
