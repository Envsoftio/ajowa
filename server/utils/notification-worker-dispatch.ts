import process from 'node:process'
import { getDatabasePool } from './database'
import {
  dispatchNotificationJobs,
  type NotificationJobClaimFilters,
} from './notifications'

export const NOTIFICATION_WORKER_BATCH_SIZE = 5
export const NOTIFICATION_WORKER_LOCK_TIMEOUT_MINUTES = 10
export const NOTIFICATION_WORKER_WAKE_SOCIETY_LIMIT = 100
export const NOTIFICATION_WORKER_PATH = '/api/background/notifications'
export const NOTIFICATION_WORKER_SECRET_HEADER = 'x-notification-worker-secret'

export type NotificationWorkerPayload = {
  societyId: string
  eventId?: string
} & NotificationJobClaimFilters

export const getNotificationWorkerSecret = () =>
  process.env.NOTIFICATION_WORKER_SECRET ??
  process.env.BETTER_AUTH_SECRET ??
  ''

const getNotificationWorkerEndpoint = () => {
  const siteUrl = process.env.DEPLOY_PRIME_URL ?? process.env.URL
  return siteUrl ? new URL(NOTIFICATION_WORKER_PATH, siteUrl).toString() : null
}

export const invokeNotificationWorker = async (payload: NotificationWorkerPayload) => {
  const workerSecret = getNotificationWorkerSecret()

  if (!workerSecret && process.env.NETLIFY === 'true') {
    return false
  }

  const headers: HeadersInit = {
    'content-type': 'application/json',
  }

  if (workerSecret) {
    headers[NOTIFICATION_WORKER_SECRET_HEADER] = workerSecret
  }

  const workerEndpoint = workerSecret ? getNotificationWorkerEndpoint() : null
  if (workerSecret && !workerEndpoint && process.env.NETLIFY === 'true') {
    return false
  }

  if (workerSecret && workerEndpoint) {
    try {
      const response = await fetch(workerEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5_000),
      })

      if (response.ok || response.status === 202) {
        return true
      }

      if (process.env.NETLIFY === 'true') {
        return false
      }
    } catch {
      if (process.env.NETLIFY === 'true') {
        return false
      }
    }
  }

  void drainQueuedNotifications(payload).catch((error) => {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'Local notification worker failed.',
        societyId: payload.societyId,
        eventId: payload.eventId ?? null,
        cause: error instanceof Error ? error.message : String(error),
      }),
    )
  })

  return true
}

export const dispatchQueuedNotificationBatch = async (payload: NotificationWorkerPayload) => {
  const client = await getDatabasePool().connect()

  try {
    return await dispatchNotificationJobs(client, {
      limit: NOTIFICATION_WORKER_BATCH_SIZE,
      societyId: payload.societyId,
      lockTimeoutMinutes: NOTIFICATION_WORKER_LOCK_TIMEOUT_MINUTES,
      ...(payload.eventId ? { eventId: payload.eventId } : {}),
      ...(payload.channel ? { channel: payload.channel } : {}),
      ...(payload.eventKey ? { eventKey: payload.eventKey } : {}),
      ...(payload.category ? { category: payload.category } : {}),
      ...(payload.priority ? { priority: payload.priority } : {}),
    })
  } finally {
    client.release()
  }
}

export const getClaimableNotificationSocietyIds = async () => {
  const client = await getDatabasePool().connect()

  try {
    const result = await client.query<{ society_id: string }>(
      `
        select distinct ne.society_id
        from notification_jobs nj
        inner join notification_events ne
          on ne.id = nj.notification_event_id
        where (
            nj.status in ('QUEUED', 'RETRYING')
            or (
              nj.status = 'PROCESSING'
              and nj.locked_at < now() - ($1::integer * interval '1 minute')
            )
          )
          and coalesce(nj.scheduled_for, ne.scheduled_for, now()) <= now()
          and coalesce(nj.next_attempt_at, now()) <= now()
          and (
            nj.locked_at is null
            or nj.locked_at < now() - ($1::integer * interval '1 minute')
          )
          and ne.status not in ('CANCELLED', 'FAILED')
        order by ne.society_id
        limit $2
      `,
      [NOTIFICATION_WORKER_LOCK_TIMEOUT_MINUTES, NOTIFICATION_WORKER_WAKE_SOCIETY_LIMIT],
    )

    return result.rows.map((row) => row.society_id)
  } finally {
    client.release()
  }
}

export const drainQueuedNotifications = async (payload: NotificationWorkerPayload) => {
  let batchCount = 0

  while (true) {
    const result = await dispatchQueuedNotificationBatch(payload)
    batchCount += 1

    if (result.claimed !== NOTIFICATION_WORKER_BATCH_SIZE) {
      break
    }
  }

  return { batchCount }
}
