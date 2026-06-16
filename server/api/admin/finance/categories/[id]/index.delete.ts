import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { writeFinanceAudit } from '~/server/utils/finance'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const categoryId = readUuidParam(event)
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const category = await client.query<{ id: string; name: string; is_system: boolean }>(
      `
        select id, name, is_system
        from transaction_categories
        where id = $1 and society_id = $2
        for update
      `,
      [categoryId, authMe.user.societyId],
    )
    const row = category.rows[0]
    if (!row) {
      throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Category not found.' })
    }
    if (row.is_system) {
      throw new AppError({ code: 'CONFLICT', statusCode: 409, message: 'System categories cannot be deleted.' })
    }

    const usage = await client.query<{ count: string }>(
      'select count(*)::text as count from transactions where category_id = $1 and society_id = $2',
      [categoryId, authMe.user.societyId],
    )
    if (Number(usage.rows[0]?.count ?? 0) > 0) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'Categories with historical transactions cannot be deleted. Mark it inactive instead.',
      })
    }

    await client.query('delete from transaction_categories where id = $1', [categoryId])
    await writeFinanceAudit({
      client,
      event,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'DELETED',
      eventKey: 'finance.categories.deleted',
      relatedEntities: [{ entityTable: 'transaction_categories', entityId: categoryId, entityLabel: row.name }],
    })

    await client.query('commit')
    return createApiSuccess(event, { id: categoryId })
  } catch (error) {
    await client.query('rollback')
    if ((error as { code?: string }).code === '23503') {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'This category is linked to another record and cannot be deleted. Mark it inactive instead.',
      })
    }
    throw error
  } finally {
    client.release()
  }
})
