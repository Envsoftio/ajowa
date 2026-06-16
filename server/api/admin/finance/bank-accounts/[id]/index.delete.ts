import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { writeFinanceAudit } from '~/server/utils/finance'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const bankAccountId = readUuidParam(event, 'id')
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const existing = await client.query<{ id: string; account_name: string; account_head_id: string }>(
      `
        select id, account_name, account_head_id
        from society_bank_accounts
        where id = $1 and society_id = $2
      `,
      [bankAccountId, authMe.user.societyId],
    )
    const bankAccount = existing.rows[0]

    if (!bankAccount) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Bank account not found.',
      })
    }

    const usage = await client.query<{ transactions: string }>(
      'select count(*)::text as transactions from transactions where bank_account_id = $1',
      [bankAccountId],
    )

    if (Number(usage.rows[0]?.transactions ?? 0) > 0) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'Bank accounts with linked transactions cannot be deleted. Mark it inactive instead.',
      })
    }

    await client.query('delete from society_bank_accounts where id = $1', [bankAccountId])

    await writeFinanceAudit({
      client,
      event,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'DELETED',
      eventKey: 'finance.bank_accounts.deleted',
      beforeState: bankAccount,
      relatedEntities: [{ entityTable: 'society_bank_accounts', entityId: bankAccountId, entityLabel: bankAccount.account_name }],
    })

    await client.query('commit')
    return createApiSuccess(event, { id: bankAccountId })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
