import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { writeFinanceAudit } from '~/server/utils/finance'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const accountId = readUuidParam(event, 'id')
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const existing = await client.query<{
      id: string
      name: string
      code: string
      is_system: boolean
    }>(
      `
        select id, name, code, is_system
        from account_heads
        where id = $1 and (society_id = $2 or society_id is null)
      `,
      [accountId, authMe.user.societyId],
    )
    const account = existing.rows[0]

    if (!account) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Account head not found.',
      })
    }

    if (account.is_system) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'System account heads cannot be deleted.',
      })
    }

    const usage = await client.query<{ children: string; lines: string; banks: string }>(
      `
        select
          (select count(*)::text from account_heads where parent_id = $1) as children,
          (select count(*)::text from journal_lines where account_head_id = $1) as lines,
          (select count(*)::text from society_bank_accounts where account_head_id = $1) as banks
      `,
      [accountId],
    )
    const counts = usage.rows[0]

    if (Number(counts?.children ?? 0) > 0 || Number(counts?.lines ?? 0) > 0 || Number(counts?.banks ?? 0) > 0) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'Account heads with children, bank mappings, or journal lines cannot be deleted.',
      })
    }

    await client.query('delete from account_heads where id = $1', [accountId])

    await writeFinanceAudit({
      client,
      event,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'DELETED',
      eventKey: 'finance.account_heads.deleted',
      beforeState: account,
      relatedEntities: [{ entityTable: 'account_heads', entityId: accountId, entityLabel: account.name }],
    })

    await client.query('commit')
    return createApiSuccess(event, { id: accountId })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
