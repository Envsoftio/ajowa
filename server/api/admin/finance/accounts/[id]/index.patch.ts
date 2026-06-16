import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam, validatePayload } from '~/server/utils/master-data'
import {
  accountHeadUpdateSchema,
  writeFinanceAudit,
  type AccountHeadUpdateInput,
} from '~/server/utils/finance'

type ExistingAccount = {
  id: string
  society_id: string | null
  parent_id: string | null
  code: string
  name: string
  head_type: string
  is_system: boolean
  is_active: boolean
  allows_manual_entries: boolean
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const accountId = readUuidParam(event, 'id')
  const body = validatePayload<AccountHeadUpdateInput>(accountHeadUpdateSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const existingResult = await client.query<ExistingAccount>(
      `
        select id, society_id, parent_id, code, name, head_type::text, is_system, is_active, allows_manual_entries
        from account_heads
        where id = $1 and (society_id = $2 or society_id is null)
      `,
      [accountId, authMe.user.societyId],
    )
    const existing = existingResult.rows[0]

    if (!existing) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Account head not found.',
      })
    }

    if (existing.is_system) {
      const protectedFields = [body.code, body.parentId, body.headType, body.allowsManualEntries, body.isActive]
      if (protectedFields.some((value) => value !== undefined)) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'System account heads can only be renamed.',
        })
      }
    }

    const nextHeadType = body.headType ?? existing.head_type

    if (body.parentId === accountId) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'An account head cannot be its own parent.',
      })
    }

    if (body.parentId !== undefined && body.parentId !== null) {
      const parent = await client.query<{ id: string; head_type: string }>(
        `
          select id, head_type::text
          from account_heads
          where id = $1 and id <> $2 and (society_id = $3 or society_id is null)
        `,
        [body.parentId, accountId, authMe.user.societyId],
      )

      if (!parent.rows[0]) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'Parent account head was not found.',
        })
      }

      if (parent.rows[0].head_type !== nextHeadType) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'Parent and child account heads must use the same account type.',
        })
      }
    }

    if (body.headType && body.headType !== existing.head_type) {
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
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'Account type cannot be changed after the account is in use.',
        })
      }
    }

    const updates: string[] = []
    const values: unknown[] = []
    let index = 1

    if (body.code !== undefined) {
      updates.push(`code = $${index++}`)
      values.push(body.code)
    }
    if (body.name !== undefined) {
      updates.push(`name = $${index++}`)
      values.push(body.name)
    }
    if (body.parentId !== undefined) {
      updates.push(`parent_id = $${index++}`)
      values.push(body.parentId)
    }
    if (body.headType !== undefined) {
      updates.push(`head_type = $${index++}::account_head_type`)
      values.push(body.headType)
    }
    if (body.isActive !== undefined) {
      updates.push(`is_active = $${index++}`)
      values.push(body.isActive)
    }
    if (body.allowsManualEntries !== undefined) {
      updates.push(`allows_manual_entries = $${index++}`)
      values.push(body.allowsManualEntries)
    }

    if (updates.length > 0) {
      values.push(accountId)
      await client.query(
        `
          update account_heads
          set ${updates.join(', ')}, updated_at = now()
          where id = $${index}
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
        eventKey: 'finance.account_heads.updated',
        beforeState: {
          code: existing.code,
          name: existing.name,
          parentId: existing.parent_id,
          headType: existing.head_type,
          isActive: existing.is_active,
          allowsManualEntries: existing.allows_manual_entries,
        },
        afterState: body as unknown as Record<string, unknown>,
        relatedEntities: [{ entityTable: 'account_heads', entityId: accountId, entityLabel: body.name ?? existing.name }],
      })
    }

    await client.query('commit')
    return createApiSuccess(event, { id: accountId })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
