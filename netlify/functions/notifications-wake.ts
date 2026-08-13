import {
  NOTIFICATION_WORKER_PATH,
  NOTIFICATION_WORKER_SECRET_HEADER,
  getNotificationWorkerSecret,
} from '../../server/utils/notification-worker-dispatch'

export default async (request: Request) => {
  const workerSecret = getNotificationWorkerSecret()

  if (!workerSecret) {
    throw new Error('Notification worker secret is not configured.')
  }

  const response = await fetch(new URL(NOTIFICATION_WORKER_PATH, request.url), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [NOTIFICATION_WORKER_SECRET_HEADER]: workerSecret,
    },
    body: JSON.stringify({ wakeAll: true }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok && response.status !== 202) {
    throw new Error(`Notification recovery worker responded with HTTP ${response.status}.`)
  }

  return new Response(null, { status: 204 })
}

export const config = {
  schedule: '*/5 * * * *',
}
