import { z } from 'zod'
import {
  SERVICE_REQUEST_NOTIFICATION_BATCH_SIZE,
  SERVICE_REQUEST_NOTIFICATION_WORKER_SECRET_HEADER,
  dispatchQueuedServiceRequestNotificationBatch,
  getClaimableServiceRequestNotificationEventIds,
  getServiceRequestNotificationWorkerSecret,
} from '../../server/utils/service-request-notification-dispatch'

const requestSchema = z.union([
  z.object({ eventId: z.string().uuid() }),
  z.object({ wakeAll: z.literal(true) }),
])

const readJson = async (request: Request) => {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

const invokeWorker = async (request: Request, payload: { eventId: string }) => {
  const response = await fetch(request.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [SERVICE_REQUEST_NOTIFICATION_WORKER_SECRET_HEADER]:
        getServiceRequestNotificationWorkerSecret(),
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok && response.status !== 202) {
    throw new Error(
      `Service request notification continuation responded with HTTP ${response.status}.`,
    )
  }
}

export default async (request: Request) => {
  const configuredSecret = getServiceRequestNotificationWorkerSecret()

  if (!configuredSecret) {
    console.error(
      JSON.stringify({
        level: 'error',
        message:
          'Service request notification worker secret is not configured.',
      }),
    )
    return new Response('Worker secret is not configured.', { status: 503 })
  }

  if (
    request.headers.get(SERVICE_REQUEST_NOTIFICATION_WORKER_SECRET_HEADER) !==
    configuredSecret
  ) {
    console.error(
      JSON.stringify({
        level: 'error',
        message:
          'Rejected unauthorized service request notification worker invocation.',
      }),
    )
    return new Response('Unauthorized', { status: 401 })
  }

  const parsed = requestSchema.safeParse(await readJson(request))

  if (!parsed.success) {
    return Response.json(
      { message: 'A valid eventId or recovery wake request is required.' },
      { status: 400 },
    )
  }

  if ('wakeAll' in parsed.data) {
    const eventIds = await getClaimableServiceRequestNotificationEventIds()

    for (const eventId of eventIds) {
      await invokeWorker(request, { eventId })
    }

    console.info(
      JSON.stringify({
        level: 'info',
        message: 'Service request notification recovery scan completed.',
        wokenEventCount: eventIds.length,
      }),
    )
    return new Response(null, { status: 204 })
  }

  const startedAt = Date.now()
  const result = await dispatchQueuedServiceRequestNotificationBatch(
    parsed.data.eventId,
  )
  const shouldContinue =
    result.claimed === SERVICE_REQUEST_NOTIFICATION_BATCH_SIZE

  if (shouldContinue) {
    await invokeWorker(request, { eventId: parsed.data.eventId })
  }

  console.info(
    JSON.stringify({
      level: 'info',
      message: 'Service request notification background batch completed.',
      eventId: parsed.data.eventId,
      durationMs: Date.now() - startedAt,
      ...result,
      continuationQueued: shouldContinue,
    }),
  )

  return new Response(null, { status: 204 })
}

export const config = {
  background: true,
  path: '/api/background/service-request-notifications',
  method: 'POST',
}
