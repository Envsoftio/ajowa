import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import {
  transactionUpdateSchema,
  validateFinanceTransactionContext,
  writeFinanceAudit,
} from '~/server/utils/finance'

type ExistingTransactionRow = {
  id: string
  society_id: string
  transaction_type: string
  category_id: string
  bank_account_id: string | null
  billing_period_id: string | null
  title: string
  description: string | null
  counterparty_name: string | null
  voucher_number: string | null
  transaction_date: string
  amount: string
  status: string
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = String(event.context.params?.id ?? '')
  const input = validateInput(transactionUpdateSchema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')

    const existingResult = await client.query<ExistingTransactionRow>(
      `
        select
          id,
          society_id,
          transaction_type::text,
          category_id,
          bank_account_id,
          billing_period_id,
          title,
          description,
          counterparty_name,
          voucher_number,
          transaction_date::text,
          amount::text,
          status::text
        from transactions
        where id = $1 and society_id = $2
        for update
      `,
      [id, authMe.user.societyId],
    )
    const existing = existingResult.rows[0]

    if (!existing) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Transaction not found.',
      })
    }

    if (existing.status === 'REVERSED' || existing.status === 'CANCELLED') {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'Reversed or cancelled entries cannot be edited.',
      })
    }

    await validateFinanceTransactionContext(client, authMe.user.societyId, input)

    const amount = Math.round(input.amount * 100) / 100
    const updateResult = await client.query<{ id: string; status: string }>(
      `
        update transactions
        set
          transaction_type = $3::transaction_type,
          category_id = $4,
          bank_account_id = $5,
          billing_period_id = $6,
          title = $7,
          description = $8,
          counterparty_name = $9,
          voucher_number = $10,
          transaction_date = $11,
          amount = $12
        where id = $1 and society_id = $2
        returning id, status::text
      `,
      [
        id,
        authMe.user.societyId,
        input.transactionType,
        input.categoryId,
        input.bankAccountId,
        input.billingPeriodId ?? null,
        input.title,
        input.description ?? null,
        input.counterpartyName ?? null,
        input.voucherNumber ?? null,
        input.transactionDate,
        amount,
      ],
    )
    const updated = updateResult.rows[0]

    if (!updated) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Transaction update failed.',
      })
    }

    await writeFinanceAudit({
      client,
      event,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'UPDATED',
      eventKey: 'finance.transactions.updated',
      beforeState: existing as unknown as Record<string, unknown>,
      afterState: { ...input, amount, status: updated.status } as unknown as Record<string, unknown>,
      relatedEntities: [{ entityTable: 'transactions', entityId: updated.id, entityLabel: input.title }],
    })

    await client.query('commit')
    return createApiSuccess(event, updated)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
