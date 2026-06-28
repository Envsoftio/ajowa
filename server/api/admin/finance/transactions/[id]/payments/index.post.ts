import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { readUuidParam } from '~/server/utils/master-data'
import {
  createExpensePaymentForTransaction,
  expensePaymentSchema,
  writeFinanceAudit,
} from '~/server/utils/finance'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const transactionId = readUuidParam(event)
  const input = validateInput(expensePaymentSchema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const result = await createExpensePaymentForTransaction(client, {
      societyId: authMe.user.societyId,
      transactionId,
      actorUserId: authMe.user.id,
      bankAccountId: input.bankAccountId,
      paymentDate: input.paymentDate,
      mode: input.mode,
      referenceNumber: input.referenceNumber ?? null,
      notes: input.notes ?? null,
    })

    await writeFinanceAudit({
      client,
      event,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'CREATED',
      eventKey: 'finance.expense_payments.created',
      afterState: { ...input, amount: result.amount } as unknown as Record<string, unknown>,
      relatedEntities: [
        { entityTable: 'transactions', entityId: transactionId },
        { entityTable: 'expense_payments', entityId: result.id },
      ],
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
