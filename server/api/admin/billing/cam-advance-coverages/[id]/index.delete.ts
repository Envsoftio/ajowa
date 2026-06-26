import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam, writeMasterAudit } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const beforeResult = await client.query<{
      id: string
      flat_id: string
      flat_label: string
      covered_from: string
      covered_until: string
      is_active: boolean
    }>(
      `
        select
          cac.id,
          cac.flat_id,
          concat(b.name, ' ', f.flat_number) as flat_label,
          cac.covered_from::text,
          cac.covered_until::text,
          cac.is_active
        from cam_advance_coverages cac
        inner join flats f on f.id = cac.flat_id
        inner join blocks b on b.id = f.block_id
        where cac.id = $1 and cac.society_id = $2
        limit 1
      `,
      [id, authMe.user.societyId],
    )
    const before = beforeResult.rows[0]
    if (!before) {
      throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'CAM advance coverage not found.' })
    }

    await client.query(
      `
        update cam_advance_coverages
        set
          is_active = false,
          updated_by_user_id = $3,
          updated_at = now()
        where id = $1 and society_id = $2
      `,
      [id, authMe.user.societyId, authMe.user.id],
    )

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'DELETED',
      eventKey: 'cam_advance_coverage.deactivated',
      beforeState: before,
      afterState: { isActive: false },
      relatedEntities: [{ entityTable: 'flats', entityId: before.flat_id, entityLabel: before.flat_label }],
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
