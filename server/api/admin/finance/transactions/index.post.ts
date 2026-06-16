import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import {
  createFinanceTransaction,
  transactionSchema,
  writeFinanceAudit,
} from '~/server/utils/finance'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const input = validateInput(transactionSchema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const result = await createFinanceTransaction(client, {
      ...input,
      submitForPosting: input.submitForPosting ?? true,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      actorRole: authMe.user.role,
    })

    await writeFinanceAudit({
      client,
      event,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'CREATED',
      eventKey: result.status === 'POSTED' ? 'finance.transactions.posted' : 'finance.transactions.created',
      afterState: { ...input, status: result.status } as unknown as Record<string, unknown>,
      relatedEntities: [{ entityTable: 'transactions', entityId: result.id, entityLabel: input.title }],
    })

    await client.query('commit')
    return createApiSuccess(event, result)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
