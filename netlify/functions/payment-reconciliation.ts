import {
  getPaymentReconciliationWorkerSecret,
  PAYMENT_RECONCILIATION_WORKER_SECRET_HEADER,
  runPaymentReconciliationBatch,
} from '../../server/utils/payment-reconciliation'

export default async (request: Request) => {
  const secret = getPaymentReconciliationWorkerSecret()
  if (!secret)
    return new Response('Worker secret is not configured.', { status: 503 })
  if (
    request.headers.get(PAYMENT_RECONCILIATION_WORKER_SECRET_HEADER) !== secret
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const result = await runPaymentReconciliationBatch()
  return Response.json(result)
}

export const config = {
  background: true,
  path: '/api/background/payment-reconciliation',
  method: 'POST',
}
