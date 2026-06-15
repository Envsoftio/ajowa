import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { flatSchema, readUuidParam, validatePayload, writeMasterAudit } from '~/server/utils/master-data'

type FlatRow = {
  flat_number: string
  floor_label: string | null
  unit_type: string
  area_sq_ft: string | null
  occupancy_status: string
  is_active: boolean
  block_id: string
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const body = validatePayload(flatSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')
    const beforeResult = await client.query<FlatRow>(
      `
        select flat_number, floor_label, unit_type, area_sq_ft::text, occupancy_status::text, is_active, block_id
        from flats
        where id = $1 and society_id = $2
        limit 1
      `,
      [id, authMe.user.societyId],
    )
    const before = beforeResult.rows[0]

    await client.query(
      `
        update flats
        set
          block_id = $3,
          flat_number = $4,
          floor_label = $5,
          unit_type = $6,
          area_sq_ft = $7,
          occupancy_status = $8::occupancy_status,
          is_active = $9,
          updated_at = now()
        where id = $1 and society_id = $2
      `,
      [
        id,
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

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: body.isActive === false ? 'STATE_CHANGED' : 'UPDATED',
      eventKey: 'flats.updated',
      beforeState: before
        ? {
            blockId: before.block_id,
            flatNumber: before.flat_number,
            floorLabel: before.floor_label,
            unitType: before.unit_type,
            areaSqFt: before.area_sq_ft ? Number(before.area_sq_ft) : null,
            occupancyStatus: before.occupancy_status,
            isActive: before.is_active,
          }
        : null,
      afterState: body,
      relatedEntities: [{ entityTable: 'flats', entityId: id, entityLabel: body.flatNumber }],
      flatId: id,
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
