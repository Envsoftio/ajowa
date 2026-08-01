import { z } from 'zod'
import {
  BILL_EMAIL_NOTIFICATION_BATCH_SIZE,
  BILL_EMAIL_NOTIFICATION_WORKER_SECRET_HEADER,
  dispatchQueuedBillEmailBatch,
  getBillEmailNotificationWorkerSecret,
  getClaimableBillEmailSocietyIds,
} from '../../server/utils/bill-notification-dispatch'

const requestSchema = z.union([
  z.object({ societyId: z.string().uuid() }),
  z.object({ wakeAll: z.literal(true) }),
])

const readJson = async (request: Request) => {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

const invokeWorker = async (request: Request, societyId: string) => {
  const headers: HeadersInit = {
    'content-type': 'application/json',
  }
  const workerSecret = getBillEmailNotificationWorkerSecret()

  if (workerSecret) {
    headers[BILL_EMAIL_NOTIFICATION_WORKER_SECRET_HEADER] = workerSecret
  }

  const response = await fetch(request.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ societyId }),
  })

  if (!response.ok && response.status !== 202) {
    throw new Error(
      `Bill email notification continuation responded with HTTP ${response.status}.`,
    )
  }
}

export default async (request: Request) => {
  const configuredSecret = getBillEmailNotificationWorkerSecret()

  if (!configuredSecret) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'Bill email notification worker secret is not configured.',
      }),
    )
    return new Response('Worker secret is not configured.', { status: 503 })
  }

  if (
    request.headers.get(BILL_EMAIL_NOTIFICATION_WORKER_SECRET_HEADER) !==
    configuredSecret
  ) {
    console.error(
      JSON.stringify({
        level: 'error',
        message:
          'Rejected unauthorized bill email notification worker invocation.',
      }),
    )
    return new Response('Unauthorized', { status: 401 })
  }

  const parsed = requestSchema.safeParse(await readJson(request))

  if (!parsed.success) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'Rejected invalid bill email notification worker payload.',
      }),
    )
    return Response.json(
      { message: 'A valid societyId or recovery wake request is required.' },
      { status: 400 },
    )
  }

  if ('wakeAll' in parsed.data) {
    const societyIds = await getClaimableBillEmailSocietyIds()
    await Promise.all(
      societyIds.map((societyId) => invokeWorker(request, societyId)),
    )

    console.info(
      JSON.stringify({
        level: 'info',
        message: 'Bill email notification recovery scan completed.',
        wokenSocietyCount: societyIds.length,
      }),
    )
    return new Response(null, { status: 204 })
  }

  const startedAt = Date.now()
  const result = await dispatchQueuedBillEmailBatch(parsed.data.societyId)
  const shouldContinue = result.claimed === BILL_EMAIL_NOTIFICATION_BATCH_SIZE

  if (shouldContinue) {
    await invokeWorker(request, parsed.data.societyId)
  }

  console.info(
    JSON.stringify({
      level: 'info',
      message: 'Bill email notification background batch completed.',
      societyId: parsed.data.societyId,
      durationMs: Date.now() - startedAt,
      ...result,
      continuationQueued: shouldContinue,
    }),
  )

  return new Response(null, { status: 204 })
}

export const config = {
  background: true,
  path: '/api/background/billing-email-notifications',
  method: 'POST',
}
