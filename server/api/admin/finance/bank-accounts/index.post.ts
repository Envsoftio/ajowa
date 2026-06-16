import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { validatePayload } from '~/server/utils/master-data'
import {
  bankAccountSchema,
  writeFinanceAudit,
} from '~/server/utils/finance'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validatePayload(bankAccountSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const accountHead = await client.query<{ id: string; head_type: string; is_active: boolean }>(
      `
        select id, head_type::text, is_active
        from account_heads
        where id = $1 and (society_id = $2 or society_id is null)
      `,
      [body.accountHeadId, authMe.user.societyId],
    )

    if (!accountHead.rows[0] || accountHead.rows[0].head_type !== 'ASSET') {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Bank accounts must be mapped to an Asset account head.',
      })
    }

    if (!accountHead.rows[0].is_active) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Bank accounts can only be mapped to active account heads.',
      })
    }

    if (body.isDefault) {
      await client.query('update society_bank_accounts set is_default = false where society_id = $1', [authMe.user.societyId])
    }

    const result = await client.query<{ id: string }>(
      `
        insert into society_bank_accounts (
          society_id,
          account_head_id,
          bank_name,
          account_name,
          account_number,
          ifsc_code,
          account_type,
          branch_name,
          upi_id,
          is_default,
          is_active
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        returning id
      `,
      [
        authMe.user.societyId,
        body.accountHeadId,
        body.bankName,
        body.accountName,
        body.accountNumber,
        body.ifscCode,
        body.accountType,
        body.branchName ?? null,
        body.upiId ?? null,
        body.isDefault,
        body.isActive,
      ],
    )

    const id = result.rows[0]?.id

    if (!id) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Bank account creation did not return an identifier.',
      })
    }

    await writeFinanceAudit({
      client,
      event,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'CREATED',
      eventKey: 'finance.bank_accounts.created',
      afterState: {
        ...body,
        accountNumber: 'MASKED',
      },
      relatedEntities: [{ entityTable: 'society_bank_accounts', entityId: id, entityLabel: body.accountName }],
    })

    await client.query('commit')
    return createApiSuccess(event, { id })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
