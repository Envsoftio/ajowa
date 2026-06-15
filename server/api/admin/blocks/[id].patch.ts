import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { blockSchema, readUuidParam, validatePayload, writeMasterAudit } from '~/server/utils/master-data'

type BlockRow = {
  id: string
  code: string
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const body = validatePayload(blockSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')
    const beforeResult = await client.query<BlockRow>(
      `
        select id, code, name, description, sort_order, is_active
        from blocks
        where id = $1 and society_id = $2
        limit 1
      `,
      [id, authMe.user.societyId],
    )
    const before = beforeResult.rows[0]

    await client.query(
      `
        update blocks
        set
          code = $3,
          name = $4,
          description = $5,
          sort_order = $6,
          is_active = $7,
          updated_at = now()
        where id = $1 and society_id = $2
      `,
      [id, authMe.user.societyId, body.code, body.name, body.description ?? null, body.sortOrder, body.isActive],
    )

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: body.isActive === false ? 'STATE_CHANGED' : 'UPDATED',
      eventKey: 'blocks.updated',
      beforeState: before
        ? {
            code: before.code,
            name: before.name,
            description: before.description,
            sortOrder: before.sort_order,
            isActive: before.is_active,
          }
        : null,
      afterState: body,
      relatedEntities: [{ entityTable: 'blocks', entityId: id, entityLabel: body.name }],
    })

    await client.query('commit')
    return createApiSuccess(event, { id, updated: true })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
