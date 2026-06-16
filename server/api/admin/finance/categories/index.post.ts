import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { categorySchema, writeFinanceAudit } from '~/server/utils/finance'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const input = validateInput(categorySchema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
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
    if (!accountRow || accountRow.head_type !== input.transactionType || !accountRow.is_active) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Category account head must be an active matching income or expense account.',
      })
    }

    const result = await client.query<{ id: string }>(
      `
        insert into transaction_categories (
          society_id,
          code,
          name,
          transaction_type,
          category_group,
          account_head_id,
          requires_attachment,
          is_system,
          is_active
        )
        values ($1, $2, $3, $4::transaction_type, $5, $6, $7, false, $8)
        returning id
      `,
      [
        authMe.user.societyId,
        input.code,
        input.name,
        input.transactionType,
        input.categoryGroup,
        input.accountHeadId,
        input.requiresAttachment,
        input.isActive,
      ],
    )
    const id = result.rows[0]?.id
    if (!id) {
      throw new AppError({ code: 'INTERNAL_ERROR', statusCode: 500, message: 'Category creation failed.' })
    }

    await writeFinanceAudit({
      client,
      event,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'CREATED',
      eventKey: 'finance.categories.created',
      afterState: input as unknown as Record<string, unknown>,
      relatedEntities: [{ entityTable: 'transaction_categories', entityId: id, entityLabel: input.name }],
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
