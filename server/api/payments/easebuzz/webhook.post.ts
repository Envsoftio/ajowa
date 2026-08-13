import { setResponseStatus } from 'h3'
import { readEasebuzzFormBody } from '~/server/utils/easebuzz'
import { persistEasebuzzEvent } from '~/server/utils/online-payments'

export default defineEventHandler(async (event) => {
  const body = await readEasebuzzFormBody(event)
  const result = await persistEasebuzzEvent({ eventKind: 'WEBHOOK', ...body })
  setResponseStatus(event, result.accepted ? 204 : 400)
  return null
})
