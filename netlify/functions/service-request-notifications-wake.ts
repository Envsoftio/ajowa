import {
  SERVICE_REQUEST_NOTIFICATION_WORKER_PATH,
  SERVICE_REQUEST_NOTIFICATION_WORKER_SECRET_HEADER,
  getServiceRequestNotificationWorkerSecret,
} from '../../server/utils/service-request-notification-dispatch'

export default async (request: Request) => {
  const workerSecret = getServiceRequestNotificationWorkerSecret()

  if (!workerSecret) {
    throw new Error(
      'Service request notification worker secret is not configured.',
    )
  }

  const response = await fetch(
    new URL(SERVICE_REQUEST_NOTIFICATION_WORKER_PATH, request.url),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [SERVICE_REQUEST_NOTIFICATION_WORKER_SECRET_HEADER]: workerSecret,
      },
      body: JSON.stringify({ wakeAll: true }),
      signal: AbortSignal.timeout(10_000),
    },
  )

  if (!response.ok && response.status !== 202) {
    throw new Error(
      `Service request notification recovery worker responded with HTTP ${response.status}.`,
    )
  }

  return new Response(null, { status: 204 })
}

export const config = {
  schedule: '*/5 * * * *',
}
