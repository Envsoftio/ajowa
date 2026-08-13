import { z } from 'zod'
import {
  NOTIFICATION_WORKER_BATCH_SIZE,
  NOTIFICATION_WORKER_SECRET_HEADER,
  dispatchQueuedNotificationBatch,
  getClaimableNotificationSocietyIds,
  getNotificationWorkerSecret,
} from '../../server/utils/notification-worker-dispatch'

const notificationChannels = ['PUSH', 'EMAIL', 'WHATSAPP', 'IN_APP'] as const
const notificationCategories = [
  'BILLING',
  'PAYMENTS',
  'ACCESS_QR',
  'SERVICE_REQUESTS',
  'AMENITY_BOOKINGS',
  'NOTICES_ANNOUNCEMENTS',
  'ACCOUNT_ONBOARDING',
  'EMERGENCY_ALERTS',
] as const
const notificationPriorities = ['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'] as const

const workerPayloadSchema = z.object({
  societyId: z.string().uuid(),
  eventId: z.string().uuid().optional(),
  channel: z.enum(notificationChannels).optional(),
  eventKey: z.string().trim().min(1).max(120).regex(/^[a-z0-9_.-]+$/i).optional(),
  category: z.enum(notificationCategories).optional(),
  priority: z.enum(notificationPriorities).optional(),
})

const requestSchema = z.union([
  workerPayloadSchema,
  z.object({ wakeAll: z.literal(true) }),
])

const readJson = async (request: Request) => {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

const invokeWorker = async (request: Request, payload: z.output<typeof workerPayloadSchema>) => {
  const response = await fetch(request.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [NOTIFICATION_WORKER_SECRET_HEADER]: getNotificationWorkerSecret(),
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok && response.status !== 202) {
    throw new Error(`Notification continuation responded with HTTP ${response.status}.`)
  }
}

export default async (request: Request) => {
  const configuredSecret = getNotificationWorkerSecret()

  if (!configuredSecret) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'Notification worker secret is not configured.',
      }),
    )
    return new Response('Worker secret is not configured.', { status: 503 })
  }

  if (request.headers.get(NOTIFICATION_WORKER_SECRET_HEADER) !== configuredSecret) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'Rejected unauthorized notification worker invocation.',
      }),
    )
    return new Response('Unauthorized', { status: 401 })
  }

  const parsed = requestSchema.safeParse(await readJson(request))

  if (!parsed.success) {
    return Response.json(
      { message: 'A valid notification worker payload or recovery wake request is required.' },
      { status: 400 },
    )
  }

  if ('wakeAll' in parsed.data) {
    const societyIds = await getClaimableNotificationSocietyIds()

    for (const societyId of societyIds) {
      await invokeWorker(request, { societyId })
    }

    console.info(
      JSON.stringify({
        level: 'info',
        message: 'Notification recovery scan completed.',
        wokenSocietyCount: societyIds.length,
      }),
    )
    return new Response(null, { status: 204 })
  }

  const startedAt = Date.now()
  const workerPayload = {
    societyId: parsed.data.societyId,
    ...(parsed.data.eventId ? { eventId: parsed.data.eventId } : {}),
    ...(parsed.data.channel ? { channel: parsed.data.channel } : {}),
    ...(parsed.data.eventKey ? { eventKey: parsed.data.eventKey } : {}),
    ...(parsed.data.category ? { category: parsed.data.category } : {}),
    ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
  }
  const result = await dispatchQueuedNotificationBatch(workerPayload)
  const shouldContinue = result.claimed === NOTIFICATION_WORKER_BATCH_SIZE

  if (shouldContinue) {
    await invokeWorker(request, workerPayload)
  }

  console.info(
    JSON.stringify({
      level: 'info',
      message: 'Notification background batch completed.',
      durationMs: Date.now() - startedAt,
      ...workerPayload,
      ...result,
      continuationQueued: shouldContinue,
    }),
  )

  return new Response(null, { status: 204 })
}

export const config = {
  background: true,
  path: '/api/background/notifications',
  method: 'POST',
}
