import { createApiSuccess } from '~/server/utils/api'
import { accessSharedReport } from '~/server/utils/report-shares'
import type { H3Event } from 'h3'
import { setHeader, setResponseStatus } from 'h3'

const readRequestHeader = (event: H3Event, name: string) => {
  const lowerName = name.toLowerCase()
  const webHeaders = event.req?.headers as Headers | undefined

  if (typeof webHeaders?.get === 'function') {
    return webHeaders.get(lowerName) ?? undefined
  }

  const nodeHeaders = event.node?.req.headers?.[lowerName]

  if (Array.isArray(nodeHeaders)) {
    return nodeHeaders[0]
  }

  return typeof nodeHeaders === 'string' ? nodeHeaders : undefined
}

export default defineEventHandler(async (event) => {
  const token = String(event.context.params?.token ?? '')

  const acceptHeader = String(readRequestHeader(event, 'accept') ?? '')
  const fetchDestination = String(readRequestHeader(event, 'sec-fetch-dest') ?? '')
  const fetchMode = String(readRequestHeader(event, 'sec-fetch-mode') ?? '')
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
