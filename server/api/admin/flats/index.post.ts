import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { flatSchema, validatePayload, writeMasterAudit } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validatePayload(flatSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')
    const result = await client.query<{ id: string }>(
      `
        insert into flats (
          society_id,
          block_id,
          flat_number,
          floor_label,
          unit_type,
          area_sq_ft,
          occupancy_status,
          is_active
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        returning id
      `,
      [
        authMe.user.societyId,
        body.blockId,
        body.flatNumber,
        body.floorLabel ?? null,
        body.unitType,
        body.areaSqFt ?? null,
        body.occupancyStatus,
        body.isActive,
      ],
    )

    const id = result.rows[0]?.id

    if (!id) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Flat creation did not return an identifier.',
      })
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'CREATED',
      eventKey: 'flats.created',
      afterState: body,
      relatedEntities: [{ entityTable: 'flats', entityId: id, entityLabel: body.flatNumber }],
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
