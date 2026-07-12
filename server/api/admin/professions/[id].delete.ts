import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam, writeMasterAudit } from '~/server/utils/master-data'

type ProfessionRow = {
  id: string
  name: string
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')
    const beforeResult = await client.query<ProfessionRow>(
      `
        select id, name
        from professions
        where id = $1 and society_id = $2
        limit 1
      `,
      [id, authMe.user.societyId],
    )
    const before = beforeResult.rows[0]

    if (!before) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Profession not found.',
      })
    }

    const linkedResult = await client.query<{ count: string }>(
      `
        select count(*)::text as count
        from resident_profession_profiles
        where profession_id = $1
      `,
      [id],
    )
    const linkedCount = Number(linkedResult.rows[0]?.count ?? 0)

    if (linkedCount > 0) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message:
          'This profession is linked to residents. Mark it inactive instead.',
        details: { linkedCount },
      })
    }

    await client.query(
      'delete from professions where id = $1 and society_id = $2',
      [id, authMe.user.societyId],
    )

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'DELETED',
      eventKey: 'professions.deleted',
      beforeState: before,
      relatedEntities: [
        { entityTable: 'professions', entityId: id, entityLabel: before.name },
      ],
    })

    await client.query('commit')
    return createApiSuccess(event, { id, deleted: true })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
