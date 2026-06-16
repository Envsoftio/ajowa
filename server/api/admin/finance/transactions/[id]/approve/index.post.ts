import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { readUuidParam } from '~/server/utils/master-data'
import { approveFinanceTransaction, writeFinanceAudit } from '~/server/utils/finance'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN'])
  const transactionId = readUuidParam(event)
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    await approveFinanceTransaction(client, {
      societyId: authMe.user.societyId,
      transactionId,
      actorUserId: authMe.user.id,
    })
    await writeFinanceAudit({
      client,
      event,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'STATE_CHANGED',
      eventKey: 'finance.transactions.approved',
      relatedEntities: [{ entityTable: 'transactions', entityId: transactionId }],
    })
    await client.query('commit')
    return createApiSuccess(event, { id: transactionId, status: 'POSTED' })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
