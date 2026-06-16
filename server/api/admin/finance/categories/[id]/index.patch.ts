import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { categoryUpdateSchema, writeFinanceAudit } from '~/server/utils/finance'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const categoryId = readUuidParam(event)
  const input = validateInput(categoryUpdateSchema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const existing = await client.query<{ id: string; name: string; transaction_type: string; is_system: boolean }>(
      `
        select id, name, transaction_type::text, is_system
        from transaction_categories
        where id = $1 and (society_id = $2 or society_id is null)
        for update
      `,
      [categoryId, authMe.user.societyId],
    )
    const row = existing.rows[0]
    if (!row) {
      throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Category not found.' })
    }

    const nextType = input.transactionType ?? row.transaction_type
    if (input.accountHeadId) {
      const account = await client.query<{ id: string; head_type: string; is_active: boolean }>(
        `
          select id, head_type::text, is_active
          from account_heads
          where id = $1 and (society_id = $2 or society_id is null)
          limit 1
        `,
        [input.accountHeadId, authMe.user.societyId],
      )
      const accountRow = account.rows[0]
      if (!accountRow || accountRow.head_type !== nextType || !accountRow.is_active) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'Category account head must be an active matching income or expense account.',
        })
      }
    }

    await client.query(
      `
        update transaction_categories
        set
          code = coalesce($2, code),
          name = coalesce($3, name),
          transaction_type = coalesce($4::transaction_type, transaction_type),
          category_group = coalesce($5, category_group),
          account_head_id = coalesce($6, account_head_id),
          requires_attachment = coalesce($7, requires_attachment),
          is_active = coalesce($8, is_active)
        where id = $1
      `,
      [
        categoryId,
        row.is_system ? null : input.code ?? null,
        input.name ?? null,
        row.is_system ? null : input.transactionType ?? null,
        input.categoryGroup ?? null,
        input.accountHeadId ?? null,
        input.requiresAttachment ?? null,
        input.isActive ?? null,
      ],
    )

    await writeFinanceAudit({
      client,
      event,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'UPDATED',
      eventKey: 'finance.categories.updated',
      afterState: input as unknown as Record<string, unknown>,
      relatedEntities: [{ entityTable: 'transaction_categories', entityId: categoryId, entityLabel: input.name ?? row.name }],
    })

    await client.query('commit')
    return createApiSuccess(event, { id: categoryId })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
