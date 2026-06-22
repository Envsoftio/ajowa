import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { dueBillSendSchema } from '~/server/utils/billing'
import { getDatabasePool } from '~/server/utils/database'
import { validatePayload, writeMasterAudit } from '~/server/utils/master-data'
import { enqueueDueBillingContactNotifications } from '~/server/utils/notifications'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validatePayload(dueBillSendSchema, await readJsonBody(event))
  const channels = body.channels ?? ['EMAIL']
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const dueResult = await client.query<{ id: string }>(
      `
        select md.id
        from maintenance_dues md
        where md.society_id = $1
          and md.id = any($2::uuid[])
          and md.status <> 'CANCELLED'
        order by md.created_at asc
      `,
      [authMe.user.societyId, body.dueIds],
    )
    const dueIds = dueResult.rows.map((row) => row.id)

    const queued = await enqueueDueBillingContactNotifications(client, {
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

    return createApiSuccess(event, {
      requested: body.dueIds.length,
      eligible: dueIds.length,
      channels,
      ...queued,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
