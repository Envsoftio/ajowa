import process from 'node:process'
import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import {
  BILL_EMAIL_NOTIFICATION_WORKER_PATH,
  BILL_EMAIL_NOTIFICATION_WORKER_SECRET_HEADER,
  drainQueuedBillEmails,
  getBillEmailNotificationWorkerSecret,
} from '~/server/utils/bill-notification-dispatch'
import { dueBillSendSchema } from '~/server/utils/billing'
import { getDatabasePool } from '~/server/utils/database'
import { getRequestLogger } from '~/server/utils/logging'
import { validatePayload, writeMasterAudit } from '~/server/utils/master-data'
import { enqueueDueBillingContactNotifications } from '~/server/utils/notifications'

const getWorkerEndpoint = () => {
  const siteUrl = process.env.DEPLOY_PRIME_URL ?? process.env.URL
  return siteUrl
    ? new URL(BILL_EMAIL_NOTIFICATION_WORKER_PATH, siteUrl).toString()
    : null
}

const invokeBillEmailWorker = async (societyId: string) => {
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

  const workerEndpoint = workerSecret ? getWorkerEndpoint() : null
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

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validatePayload(dueBillSendSchema, await readJsonBody(event))
  const channels = body.channels ?? ['EMAIL']
  const logger = getRequestLogger(event)
  const pool = getDatabasePool()
  const client = await pool.connect()
  let transactionOpen = false
  let dueIds: string[]
  let queued: { eventCount: number; audienceCount: number; jobCount: number }

  try {
    await client.query('begin')
    transactionOpen = true

    const dueResult = await client.query<{ id: string }>(
      `
        select md.id
        from maintenance_dues md
        inner join billing_periods bp on bp.id = md.billing_period_id
        inner join flats f on f.id = md.flat_id
        where md.society_id = $1
          and md.id = any($2::uuid[])
          and md.status <> 'CANCELLED'
        order by md.created_at asc
      `,
      [authMe.user.societyId, body.dueIds],
    )
    dueIds = dueResult.rows.map((row) => row.id)

    queued = await enqueueDueBillingContactNotifications(client, {
      societyId: authMe.user.societyId,
      dueIds,
      eventKey: 'maintenance_due.bill',
      title: 'Maintenance bill generated',
      bodyPrefix: 'Your maintenance bill is ready for',
      channels,
      recipientRelationshipTypes: ['OWNER'],
      triggeredByUserId: authMe.user.id,
    })

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'CREATED',
      eventKey: 'maintenance_due.bills_queued',
      metadata: {
        requestedDueCount: body.dueIds.length,
        eligibleDueCount: dueIds.length,
        channels,
        recipientRelationshipTypes: ['OWNER'],
        eventCount: queued.eventCount,
        audienceCount: queued.audienceCount,
        jobCount: queued.jobCount,
      },
      relatedEntities: [
        {
          entityTable: 'society_profile',
          entityId: authMe.user.societyId,
          entityLabel: 'AJOWA',
        },
      ],
    })

    await client.query('commit')
    transactionOpen = false
  } catch (error) {
    if (transactionOpen) {
      await client.query('rollback')
    }
    throw error
  } finally {
    client.release()
  }

  const hasQueuedJobs = queued.jobCount > 0
  const shouldStartEmailWorker =
    dueIds.length > 0 && channels.includes('EMAIL')
  const workerStarted = shouldStartEmailWorker
    ? await invokeBillEmailWorker(authMe.user.societyId)
    : false

  logger.info('Maintenance bill notification jobs queued.', {
    operation: 'maintenance_due.bills_queued',
    requestedDueCount: body.dueIds.length,
    eligibleDueCount: dueIds.length,
    channels,
    eventCount: queued.eventCount,
    audienceCount: queued.audienceCount,
    jobCount: queued.jobCount,
    queued: hasQueuedJobs,
    workerStarted,
  })

  if (shouldStartEmailWorker && !workerStarted) {
    logger.error('Bill email notification worker could not be started.', {
      operation: 'maintenance_due.bills_queued',
      societyId: authMe.user.societyId,
      jobCount: queued.jobCount,
    })
  }

  return createApiSuccess(event, {
    requested: body.dueIds.length,
    eligible: dueIds.length,
    channels,
    queued: hasQueuedJobs,
    workerStarted,
    ...queued,
  })
})
