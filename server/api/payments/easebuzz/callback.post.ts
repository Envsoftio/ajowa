import { sendRedirect } from 'h3'
import { readEasebuzzFormBody } from '~/server/utils/easebuzz'
import { persistEasebuzzEvent } from '~/server/utils/online-payments'

export default defineEventHandler(async (event) => {
  let paymentId: string | null = null
  let accepted = false
  try {
    const body = await readEasebuzzFormBody(event)
    const result = await persistEasebuzzEvent({
      eventKind: 'CALLBACK',
      ...body,
    })
    paymentId = result.paymentId ?? null
    accepted = result.accepted
  } catch {
    // The browser is always returned to a safe local page. Malformed messages
    // must not disclose verification details or block the resident indefinitely.
  }

  const params = new URLSearchParams({
    payment: accepted ? 'processing' : 'review',
  })
  if (paymentId) params.set('paymentId', paymentId)
  return sendRedirect(event, `/my/dues?${params.toString()}`, 303)
})
