import {
  BILL_EMAIL_NOTIFICATION_WORKER_PATH,
  BILL_EMAIL_NOTIFICATION_WORKER_SECRET_HEADER,
  getBillEmailNotificationWorkerSecret,
} from '../../server/utils/bill-notification-dispatch'

export default async (request: Request) => {
  const workerSecret = getBillEmailNotificationWorkerSecret()

  if (!workerSecret) {
    throw new Error('Bill email notification worker secret is not configured.')
  }

  const response = await fetch(
    new URL(BILL_EMAIL_NOTIFICATION_WORKER_PATH, request.url),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [BILL_EMAIL_NOTIFICATION_WORKER_SECRET_HEADER]: workerSecret,
      },
      body: JSON.stringify({ wakeAll: true }),
      signal: AbortSignal.timeout(10_000),
    },
  )

  if (!response.ok && response.status !== 202) {
    throw new Error(
      `Bill email notification recovery worker responded with HTTP ${response.status}.`,
    )
  }

  console.info(
    JSON.stringify({
      level: 'info',
      message: 'Scheduled bill email notification recovery worker started.',
    }),
  )

  return new Response(null, { status: 204 })
}

export const config = {
  schedule: '*/5 * * * *',
}
