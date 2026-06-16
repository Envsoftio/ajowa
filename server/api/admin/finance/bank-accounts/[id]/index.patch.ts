import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam, validatePayload } from '~/server/utils/master-data'
import {
  bankAccountUpdateSchema,
  writeFinanceAudit,
  type BankAccountUpdateInput,
} from '~/server/utils/finance'

type ExistingBankAccount = {
  id: string
  account_head_id: string
  bank_name: string
  account_name: string
  account_number: string
  ifsc_code: string
  account_type: string
  branch_name: string | null
  upi_id: string | null
  is_default: boolean
  is_active: boolean
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const bankAccountId = readUuidParam(event, 'id')
  const body = validatePayload<BankAccountUpdateInput>(bankAccountUpdateSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const existingResult = await client.query<ExistingBankAccount>(
      `
        select
          id,
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
        from society_bank_accounts
        where id = $1 and society_id = $2
      `,
      [bankAccountId, authMe.user.societyId],
    )
    const existing = existingResult.rows[0]

    if (!existing) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Bank account not found.',
      })
    }

    if (body.accountHeadId) {
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
    }

    if (body.isDefault) {
      await client.query(
        'update society_bank_accounts set is_default = false where society_id = $1 and id <> $2',
        [authMe.user.societyId, bankAccountId],
      )
    }

    const updates: string[] = []
    const values: unknown[] = []
    let index = 1

    const addUpdate = (column: string, value: unknown) => {
      updates.push(`${column} = $${index++}`)
      values.push(value)
    }

    if (body.accountHeadId !== undefined) addUpdate('account_head_id', body.accountHeadId)
    if (body.bankName !== undefined) addUpdate('bank_name', body.bankName)
    if (body.accountName !== undefined) addUpdate('account_name', body.accountName)
    if (body.accountNumber !== undefined) addUpdate('account_number', body.accountNumber)
    if (body.ifscCode !== undefined) addUpdate('ifsc_code', body.ifscCode)
    if (body.accountType !== undefined) addUpdate('account_type', body.accountType)
    if (body.branchName !== undefined) addUpdate('branch_name', body.branchName)
    if (body.upiId !== undefined) addUpdate('upi_id', body.upiId)
    if (body.isDefault !== undefined) addUpdate('is_default', body.isDefault)
    if (body.isActive !== undefined) addUpdate('is_active', body.isActive)

    if (updates.length > 0) {
      values.push(bankAccountId, authMe.user.societyId)
      await client.query(
        `
          update society_bank_accounts
          set ${updates.join(', ')}, updated_at = now()
          where id = $${index++} and society_id = $${index++}
        `,
        values,
      )

      await writeFinanceAudit({
        client,
        event,
        societyId: authMe.user.societyId,
        actorUserId: authMe.user.id,
        actorAuthUserId: authMe.authUser.id,
        action: 'UPDATED',
        eventKey: 'finance.bank_accounts.updated',
        beforeState: {
          ...existing,
          account_number: 'MASKED',
        },
        afterState: {
          ...body,
          ...(body.accountNumber ? { accountNumber: 'MASKED' } : {}),
        } as Record<string, unknown>,
        relatedEntities: [{ entityTable: 'society_bank_accounts', entityId: bankAccountId, entityLabel: body.accountName ?? existing.account_name }],
      })
    }

    await client.query('commit')
    return createApiSuccess(event, { id: bankAccountId })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
