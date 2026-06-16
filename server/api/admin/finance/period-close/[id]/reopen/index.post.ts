import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { financeDecisionSchema, writeFinanceAudit } from '~/server/utils/finance'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN'])
  const periodId = readUuidParam(event)
  const input = validateInput(financeDecisionSchema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const policy = await client.query<{ settings: Record<string, unknown> }>(
      'select settings from society_profile where id = $1 limit 1',
      [authMe.user.societyId],
    )
    const settings = policy.rows[0]?.settings ?? {}
    if (settings.periodReopenAllowed === false) {
      throw new AppError({ code: 'FORBIDDEN', statusCode: 403, message: 'Financial period reopen is disabled by society policy.' })
    }

    const result = await client.query<{ id: string }>(
      `
        update financial_period_close
        set is_reopened = true,
            reopened_at = now(),
            reopened_by_user_id = $3,
            reopen_reason = $4
        where id = $1
          and society_id = $2
          and is_reopened = false
        returning id
      `,
      [periodId, authMe.user.societyId, authMe.user.id, input.reason],
    )
    if (!result.rows[0]) {
      throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Closed financial period not found.' })
    }
    await writeFinanceAudit({
      client,
      event,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'STATE_CHANGED',
      eventKey: 'finance.periods.reopened',
      metadata: { reason: input.reason },
      relatedEntities: [{ entityTable: 'financial_period_close', entityId: periodId }],
    })
    await client.query('commit')
    return createApiSuccess(event, { id: periodId, isReopened: true })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
