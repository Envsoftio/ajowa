import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { validatePayload } from '~/server/utils/master-data'
import {
  accountHeadSchema,
  writeFinanceAudit,
} from '~/server/utils/finance'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validatePayload(accountHeadSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    if (body.parentId) {
      const parent = await client.query<{ id: string; head_type: string }>(
        `
          select id, head_type::text
          from account_heads
          where id = $1 and (society_id = $2 or society_id is null)
        `,
        [body.parentId, authMe.user.societyId],
      )

      if (!parent.rows[0]) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'Parent account head was not found.',
        })
      }

      if (parent.rows[0].head_type !== body.headType) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: 'Parent and child account heads must use the same account type.',
        })
      }
    }

    const result = await client.query<{ id: string }>(
      `
        insert into account_heads (
          society_id,
          parent_id,
          code,
          name,
          head_type,
          is_system,
          is_active,
          allows_manual_entries
        )
        values ($1, $2, $3, $4, $5::account_head_type, false, $6, $7)
        returning id
      `,
      [
        authMe.user.societyId,
        body.parentId ?? null,
        body.code,
        body.name,
        body.headType,
        body.isActive,
        body.allowsManualEntries,
      ],
    )

    const id = result.rows[0]?.id

    if (!id) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Account head creation did not return an identifier.',
      })
    }

    await writeFinanceAudit({
      client,
      event,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'CREATED',
      eventKey: 'finance.account_heads.created',
      afterState: body as unknown as Record<string, unknown>,
      relatedEntities: [{ entityTable: 'account_heads', entityId: id, entityLabel: body.name }],
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
