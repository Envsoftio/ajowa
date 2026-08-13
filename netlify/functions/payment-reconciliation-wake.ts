import {
  getPaymentReconciliationWorkerSecret,
  PAYMENT_RECONCILIATION_WORKER_PATH,
  PAYMENT_RECONCILIATION_WORKER_SECRET_HEADER,
} from '../../server/utils/payment-reconciliation'

export default async (request: Request) => {
  const secret = getPaymentReconciliationWorkerSecret()
  if (!secret)
    throw new Error('Payment reconciliation worker secret is not configured.')

  const response = await fetch(
    new URL(PAYMENT_RECONCILIATION_WORKER_PATH, request.url),
    {
      method: 'POST',
      headers: { [PAYMENT_RECONCILIATION_WORKER_SECRET_HEADER]: secret },
      signal: AbortSignal.timeout(10_000),
    },
  )
  if (!response.ok && response.status !== 202) {
    throw new Error(
      `Payment reconciliation worker responded with HTTP ${response.status}.`,
    )
  }
  return new Response(null, { status: 204 })
}

export const config = { schedule: '*/5 * * * *' }
