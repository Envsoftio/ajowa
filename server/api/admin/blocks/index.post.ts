import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { blockSchema, validatePayload, writeMasterAudit } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validatePayload(blockSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')
    const result = await client.query<{ id: string }>(
      `
        insert into blocks (society_id, code, name, description, sort_order, is_active)
        values ($1, $2, $3, $4, $5, $6)
        returning id
      `,
      [
        authMe.user.societyId,
        body.code,
        body.name,
        body.description ?? null,
        body.sortOrder,
        body.isActive,
      ],
    )

    const id = result.rows[0]?.id

    if (!id) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Block creation did not return an identifier.',
      })
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'CREATED',
      eventKey: 'blocks.created',
      afterState: body,
      relatedEntities: [{ entityTable: 'blocks', entityId: id, entityLabel: body.name }],
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
