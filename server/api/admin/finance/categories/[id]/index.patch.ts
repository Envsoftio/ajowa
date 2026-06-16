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
    const existing = await client.query<{
      id: string
      code: string
      name: string
      transaction_type: string
      category_group: string
      account_head_id: string | null
      requires_attachment: boolean
      is_system: boolean
      is_active: boolean
    }>(
      `
        select
          id,
          code,
          name,
          transaction_type::text,
          category_group,
          account_head_id,
          requires_attachment,
          is_system,
          is_active
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
    const accountHeadChanged = input.accountHeadId !== undefined && input.accountHeadId !== row.account_head_id
    const transactionTypeChanged = input.transactionType !== undefined && input.transactionType !== row.transaction_type
    const nextAccountHeadId = input.accountHeadId ?? row.account_head_id

    if ((accountHeadChanged || transactionTypeChanged) && !nextAccountHeadId) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Category account head is required.',
      })
    }

    if ((accountHeadChanged || transactionTypeChanged) && nextAccountHeadId) {
      const account = await client.query<{ id: string; head_type: string; is_active: boolean }>(
        `
          select id, head_type::text, is_active
          from account_heads
          where id = $1 and (society_id = $2 or society_id is null)
          limit 1
        `,
        [nextAccountHeadId, authMe.user.societyId],
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

    const updates: string[] = []
    const values: unknown[] = []
    let index = 1

    if (!row.is_system && input.code !== undefined) {
      updates.push(`code = $${index++}`)
      values.push(input.code)
    }
    if (input.name !== undefined) {
      updates.push(`name = $${index++}`)
      values.push(input.name)
    }
    if (!row.is_system && input.transactionType !== undefined) {
      updates.push(`transaction_type = $${index++}::transaction_type`)
      values.push(input.transactionType)
    }
    if (input.categoryGroup !== undefined) {
      updates.push(`category_group = $${index++}`)
      values.push(input.categoryGroup)
    }
    if (input.accountHeadId !== undefined) {
      updates.push(`account_head_id = $${index++}`)
      values.push(input.accountHeadId)
    }
    if (input.requiresAttachment !== undefined) {
      updates.push(`requires_attachment = $${index++}`)
      values.push(input.requiresAttachment)
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${index++}`)
      values.push(input.isActive)
    }

    if (updates.length > 0) {
      values.push(categoryId)
      await client.query(
        `
          update transaction_categories
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
        eventKey: 'finance.categories.updated',
        beforeState: {
          code: row.code,
          name: row.name,
          transactionType: row.transaction_type,
          categoryGroup: row.category_group,
          accountHeadId: row.account_head_id,
          requiresAttachment: row.requires_attachment,
          isActive: row.is_active,
        },
        afterState: input as unknown as Record<string, unknown>,
        relatedEntities: [{ entityTable: 'transaction_categories', entityId: categoryId, entityLabel: input.name ?? row.name }],
      })
    }

    await client.query('commit')
    return createApiSuccess(event, { id: categoryId })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
