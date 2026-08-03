import process from 'node:process'
import { getDatabasePool } from './database'
import { dispatchNotificationJobs } from './notifications'

export const BILL_EMAIL_NOTIFICATION_BATCH_SIZE = 5
export const BILL_EMAIL_NOTIFICATION_EVENT_KEY = 'maintenance_due.bill'
export const BILL_EMAIL_NOTIFICATION_LOCK_TIMEOUT_MINUTES = 10
export const BILL_EMAIL_NOTIFICATION_WAKE_SOCIETY_LIMIT = 100
export const BILL_EMAIL_NOTIFICATION_WORKER_PATH =
  '/api/background/billing-email-notifications'
export const BILL_EMAIL_NOTIFICATION_WORKER_SECRET_HEADER =
  'x-bill-notification-secret'

export const getBillEmailNotificationWorkerSecret = () =>
  process.env.BILL_NOTIFICATION_WORKER_SECRET ??
  process.env.BETTER_AUTH_SECRET ??
  ''

const getBillEmailNotificationWorkerEndpoint = () => {
  const siteUrl = process.env.DEPLOY_PRIME_URL ?? process.env.URL
  return siteUrl
    ? new URL(BILL_EMAIL_NOTIFICATION_WORKER_PATH, siteUrl).toString()
    : null
}

export const invokeBillEmailNotificationWorker = async (societyId: string) => {
  const workerSecret = getBillEmailNotificationWorkerSecret()

  if (!workerSecret && process.env.NETLIFY === 'true') {
    return false
  }

  const headers: HeadersInit = {
    'content-type': 'application/json',
  }

  if (workerSecret) {
    headers[BILL_EMAIL_NOTIFICATION_WORKER_SECRET_HEADER] = workerSecret
  }

  const workerEndpoint = workerSecret ? getBillEmailNotificationWorkerEndpoint() : null
  if (workerSecret && !workerEndpoint && process.env.NETLIFY === 'true') {
    return false
  }

  if (workerSecret && workerEndpoint) {
    try {
      const response = await fetch(workerEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ societyId }),
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

  void drainQueuedBillEmails(societyId).catch((error) => {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'Local bill email notification worker failed.',
        societyId,
        cause: error instanceof Error ? error.message : String(error),
      }),
    )
  })

  return true
}

export const dispatchQueuedBillEmailBatch = async (societyId: string) => {
  const client = await getDatabasePool().connect()

  try {
    return await dispatchNotificationJobs(client, {
      limit: BILL_EMAIL_NOTIFICATION_BATCH_SIZE,
      societyId,
      eventKey: BILL_EMAIL_NOTIFICATION_EVENT_KEY,
      channel: 'EMAIL',
      lockTimeoutMinutes: BILL_EMAIL_NOTIFICATION_LOCK_TIMEOUT_MINUTES,
    })
  } finally {
    client.release()
  }
}

export const getClaimableBillEmailSocietyIds = async () => {
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
              and nj.locked_at < now() - ($2::integer * interval '1 minute')
            )
          )
          and nj.channel = 'EMAIL'
          and ne.event_key = $1
          and coalesce(nj.scheduled_for, ne.scheduled_for, now()) <= now()
          and coalesce(nj.next_attempt_at, now()) <= now()
          and (
            nj.locked_at is null
            or nj.locked_at < now() - ($2::integer * interval '1 minute')
          )
          and ne.status not in ('CANCELLED', 'FAILED')
        order by ne.society_id
        limit $3
      `,
      [
        BILL_EMAIL_NOTIFICATION_EVENT_KEY,
        BILL_EMAIL_NOTIFICATION_LOCK_TIMEOUT_MINUTES,
        BILL_EMAIL_NOTIFICATION_WAKE_SOCIETY_LIMIT,
      ],
    )

    return result.rows.map((row) => row.society_id)
  } finally {
    client.release()
  }
}

export const drainQueuedBillEmails = async (societyId: string) => {
  let batchCount = 0

  while (true) {
    const result = await dispatchQueuedBillEmailBatch(societyId)
    batchCount += 1

    if (result.claimed !== BILL_EMAIL_NOTIFICATION_BATCH_SIZE) {
      break
    }
  }

  return { batchCount }
}
