import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { validatePayload, writeMasterAudit } from '~/server/utils/master-data'
import { dueReminderSchema, type DueReminderInput } from '~/server/utils/billing'
import { enqueueDueBillingContactNotifications } from '~/server/utils/notifications'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validatePayload<DueReminderInput>(dueReminderSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const dueResult = await client.query<{ id: string }>(
      `
        select md.id
        from maintenance_dues md
        inner join billing_periods bp on bp.id = md.billing_period_id
        inner join flats f on f.id = md.flat_id
        where md.society_id = $1
          and md.id = any($2::uuid[])
          and md.balance_amount > 0
          and md.status not in ('PAID', 'WAIVED', 'CANCELLED')
          and bp.is_locked = false
      `,
      [authMe.user.societyId, body.dueIds],
    )

    const dueIds = dueResult.rows.map((row) => row.id)
    const queued = await enqueueDueBillingContactNotifications(client, {
      societyId: authMe.user.societyId,
      dueIds,
      eventKey: 'maintenance_due.reminder',
      title: 'Maintenance payment reminder',
      bodyPrefix: 'Maintenance dues are pending for',
      channels: ['EMAIL'],
      triggeredByUserId: authMe.user.id,
    })

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'CREATED',
      eventKey: 'maintenance_due.reminders_queued',
      metadata: {
        requestedDueCount: body.dueIds.length,
        eligibleDueCount: dueIds.length,
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

    return createApiSuccess(event, {
      requested: body.dueIds.length,
      eligible: dueIds.length,
      ...queued,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
