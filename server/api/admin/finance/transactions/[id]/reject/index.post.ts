import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { financeRejectSchema, writeFinanceAudit } from '~/server/utils/finance'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN'])
  const transactionId = readUuidParam(event)
  const input = validateInput(financeRejectSchema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const nextStatus = input.returnForCorrection ? 'RETURNED' : 'REJECTED'
    const result = await client.query<{ id: string }>(
      `
        update transactions
        set status = $3::finance_lifecycle_status,
            approved_by_user_id = $4,
            approved_at = now()
        where id = $1
          and society_id = $2
          and status in ('DRAFT', 'PENDING_REVIEW', 'RETURNED')
        returning id
      `,
      [transactionId, authMe.user.societyId, nextStatus, authMe.user.id],
    )
    if (!result.rows[0]) {
      throw new AppError({ code: 'CONFLICT', statusCode: 409, message: 'Only draft, returned, or pending transactions can be rejected or returned.' })
    }
    await writeFinanceAudit({
      client,
      event,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'STATE_CHANGED',
      eventKey: input.returnForCorrection ? 'finance.transactions.returned' : 'finance.transactions.rejected',
      metadata: { reason: input.reason },
      relatedEntities: [{ entityTable: 'transactions', entityId: transactionId }],
    })
    await client.query('commit')
    return createApiSuccess(event, { id: transactionId, status: nextStatus })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
