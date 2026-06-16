import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam, writeMasterAudit } from '~/server/utils/master-data'

type FlatRow = {
  id: string
  block_id: string
  flat_number: string
  floor_label: string | null
  unit_type: string
  area_sq_ft: string | null
  occupancy_status: string
  is_active: boolean
}

type DependencyRow = {
  label: string
  count: string
}

const dependencyQueries = `
  select 'resident relationships' as label, count(*)::text as count
  from flat_residents
  where flat_id = $1
  union all
  select 'maintenance charge rules' as label, count(*)::text as count
  from maintenance_charges
  where flat_id = $1
  union all
  select 'maintenance dues' as label, count(*)::text as count
  from maintenance_dues
  where flat_id = $1
  union all
  select 'payments' as label, count(*)::text as count
  from payments
  where received_for_flat_id = $1
  union all
  select 'advance credits' as label, count(*)::text as count
  from resident_advance_credits
  where flat_id = $1
  union all
  select 'gate scan logs' as label, count(*)::text as count
  from gate_scan_logs
  where flat_id = $1
  union all
  select 'service requests' as label, count(*)::text as count
  from service_requests
  where flat_id = $1
  union all
  select 'shared report links' as label, count(*)::text as count
  from shared_report_links
  where flat_id = $1
`

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const flatResult = await client.query<FlatRow>(
      `
        select id, block_id, flat_number, floor_label, unit_type, area_sq_ft::text, occupancy_status::text, is_active
        from flats
        where id = $1 and society_id = $2
        for update
      `,
      [id, authMe.user.societyId],
    )
    const flat = flatResult.rows[0]

    if (!flat) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Flat not found.',
      })
    }

    const dependencies = await client.query<DependencyRow>(dependencyQueries, [id])
    const blockingDependencies = dependencies.rows
      .map((row) => ({ label: row.label, count: Number(row.count) }))
      .filter((row) => row.count > 0)

    if (blockingDependencies.length > 0) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'This flat has linked records. Mark it inactive instead of deleting it.',
        details: { dependencies: blockingDependencies },
      })
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'DELETED',
      eventKey: 'flats.deleted',
      beforeState: {
        blockId: flat.block_id,
        flatNumber: flat.flat_number,
        floorLabel: flat.floor_label,
        unitType: flat.unit_type,
        areaSqFt: flat.area_sq_ft ? Number(flat.area_sq_ft) : null,
        occupancyStatus: flat.occupancy_status,
        isActive: flat.is_active,
      },
      relatedEntities: [{ entityTable: 'flats', entityId: id, entityLabel: flat.flat_number }],
      flatId: id,
    })

    await client.query('delete from flats where id = $1', [id])
    await client.query('commit')

    return createApiSuccess(event, { id })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
