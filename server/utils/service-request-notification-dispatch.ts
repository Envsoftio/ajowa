import process from 'node:process'
import { getDatabasePool } from './database'
import { dispatchNotificationJobs } from './notifications'

export const SERVICE_REQUEST_NOTIFICATION_BATCH_SIZE = 5
export const SERVICE_REQUEST_NOTIFICATION_EVENT_KEY = 'service_request.updated'
export const SERVICE_REQUEST_NOTIFICATION_LOCK_TIMEOUT_MINUTES = 10
export const SERVICE_REQUEST_NOTIFICATION_WAKE_EVENT_LIMIT = 100
export const SERVICE_REQUEST_NOTIFICATION_WORKER_PATH =
  '/api/background/service-request-notifications'
export const SERVICE_REQUEST_NOTIFICATION_WORKER_SECRET_HEADER =
  'x-service-request-notification-secret'

export const getServiceRequestNotificationWorkerSecret = () =>
  process.env.SERVICE_REQUEST_NOTIFICATION_WORKER_SECRET ??
  process.env.BETTER_AUTH_SECRET ??
  ''

const getServiceRequestNotificationWorkerEndpoint = () => {
  const siteUrl = process.env.DEPLOY_PRIME_URL ?? process.env.URL
  return siteUrl
    ? new URL(SERVICE_REQUEST_NOTIFICATION_WORKER_PATH, siteUrl).toString()
    : null
}

export const invokeServiceRequestNotificationWorker = async (
  eventId: string,
) => {
  const workerSecret = getServiceRequestNotificationWorkerSecret()
  const workerEndpoint = workerSecret
    ? getServiceRequestNotificationWorkerEndpoint()
    : null

  if (process.env.NETLIFY === 'true' && (!workerSecret || !workerEndpoint)) {
    return false
  }

  if (workerSecret && workerEndpoint) {
    try {
      const response = await fetch(workerEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SERVICE_REQUEST_NOTIFICATION_WORKER_SECRET_HEADER]: workerSecret,
        },
        body: JSON.stringify({ eventId }),
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

  void drainQueuedServiceRequestNotifications(eventId).catch((error) => {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'Local service request notification worker failed.',
        eventId,
        cause: error instanceof Error ? error.message : String(error),
      }),
    )
  })

  return true
}

export const invokeServiceRequestNotificationWorkers = async (
  eventIds: string[],
) => {
  let allStarted = true

  for (const eventId of new Set(eventIds)) {
    if (!(await invokeServiceRequestNotificationWorker(eventId))) {
      allStarted = false
    }
  }

  return allStarted
}

export const dispatchQueuedServiceRequestNotificationBatch = async (
  eventId: string,
) => {
  const client = await getDatabasePool().connect()

  try {
    const allowed = await client.query<{ id: string }>(
      `
        select id
        from notification_events
        where id = $1
          and event_key = $2
          and source_table = 'service_requests'
        limit 1
      `,
      [eventId, SERVICE_REQUEST_NOTIFICATION_EVENT_KEY],
    )

    if (!allowed.rows[0]) {
      return { claimed: 0, sent: 0, failed: 0, retried: 0, skipped: 0 }
    }

    return await dispatchNotificationJobs(client, {
      eventId,
      limit: SERVICE_REQUEST_NOTIFICATION_BATCH_SIZE,
      lockTimeoutMinutes: SERVICE_REQUEST_NOTIFICATION_LOCK_TIMEOUT_MINUTES,
    })
  } finally {
    client.release()
  }
}

const drainQueuedServiceRequestNotifications = async (eventId: string) => {
  let result

  do {
    result = await dispatchQueuedServiceRequestNotificationBatch(eventId)
  } while (result.claimed === SERVICE_REQUEST_NOTIFICATION_BATCH_SIZE)

  return result
}

export const getClaimableServiceRequestNotificationEventIds = async () => {
  const client = await getDatabasePool().connect()

  try {
    const result = await client.query<{ event_id: string }>(
      `
        select distinct ne.id as event_id
        from notification_jobs nj
        inner join notification_events ne
          on ne.id = nj.notification_event_id
        where (
            nj.status in ('QUEUED', 'RETRYING')
            or (
              nj.status = 'PROCESSING'
              and nj.locked_at < now() - ($2::integer * interval '1 minute')
            )
          )
          and ne.event_key = $1
          and ne.source_table = 'service_requests'
          and coalesce(nj.scheduled_for, ne.scheduled_for, now()) <= now()
          and coalesce(nj.next_attempt_at, now()) <= now()
          and (
            nj.locked_at is null
            or nj.locked_at < now() - ($2::integer * interval '1 minute')
          )
          and ne.status not in ('CANCELLED', 'FAILED')
        order by ne.id
        limit $3
      `,
      [
        SERVICE_REQUEST_NOTIFICATION_EVENT_KEY,
        SERVICE_REQUEST_NOTIFICATION_LOCK_TIMEOUT_MINUTES,
        SERVICE_REQUEST_NOTIFICATION_WAKE_EVENT_LIMIT,
      ],
    )

    return result.rows.map((row) => row.event_id)
  } finally {
    client.release()
  }
}
