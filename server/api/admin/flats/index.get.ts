import { createPaginatedSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { parseListQuery } from '~/server/utils/master-data'
import type { FlatSummary } from '~/types/domain'

type FlatRow = {
  id: string
  society_id: string
  block_id: string
  block_name: string
  flat_number: string
  floor_label: string | null
  unit_type: string
  area_sq_ft: string | null
  occupancy_status: string
  is_active: boolean
  created_at: string
  updated_at: string
  owner_count: string
  tenant_count: string
}

const sortColumns: Record<string, string> = {
  flatNumber: 'f.flat_number',
  blockName: 'b.name',
  unitType: 'f.unit_type',
  occupancyStatus: 'f.occupancy_status',
  areaSqFt: 'f.area_sq_ft',
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = parseListQuery(event)
  const pool = getDatabasePool()
  const where: string[] = ['f.society_id = $1']
  const values: unknown[] = [authMe.user.societyId]

  if (query.search) {
    values.push(`%${query.search}%`)
    where.push(
      `(f.flat_number ilike $${values.length} or b.name ilike $${values.length} or f.unit_type ilike $${values.length})`,
    )
  }

  const blockFilter = query.filters.blockId?.[0]
  if (blockFilter) {
    values.push(blockFilter)
    where.push(`f.block_id = $${values.length}`)
  }

  const unitTypeFilter = query.filters.unitType?.[0]
  if (unitTypeFilter) {
    values.push(unitTypeFilter)
    where.push(`f.unit_type = $${values.length}`)
  }

  const occupancyFilter = query.filters.occupancyStatus?.[0]
  if (occupancyFilter) {
    values.push(occupancyFilter)
    where.push(`f.occupancy_status::text = $${values.length}`)
  }

  const activeFilter = query.filters.isActive?.[0]
  if (activeFilter === 'true' || activeFilter === 'false') {
    values.push(activeFilter === 'true')
    where.push(`f.is_active = $${values.length}`)
  }

  const whereSql = where.join(' and ')
  const orderBy = sortColumns[query.sortBy ?? 'flatNumber'] ?? 'f.flat_number'
  const direction = query.sortDirection === 'desc' ? 'desc' : 'asc'
  values.push(query.pageSize, (query.page - 1) * query.pageSize)

  const [dataResult, countResult] = await Promise.all([
    pool.query<FlatRow>(
      `
        select
          f.id,
          f.society_id,
          f.block_id,
          b.name as block_name,
          f.flat_number,
          f.floor_label,
          f.unit_type,
          f.area_sq_ft::text,
          f.occupancy_status::text,
          f.is_active,
          f.created_at::text,
          f.updated_at::text,
          count(*) filter (where fr.relationship_type = 'OWNER' and fr.is_active = true)::text as owner_count,
          count(*) filter (where fr.relationship_type = 'TENANT' and fr.is_active = true)::text as tenant_count
        from flats f
        inner join blocks b on b.id = f.block_id
        left join flat_residents fr on fr.flat_id = f.id
        where ${whereSql}
        group by f.id, b.id
        order by ${orderBy} ${direction}, b.name asc, f.flat_number asc
        limit $${values.length - 1}
        offset $${values.length}
      `,
      values,
    ),
    pool.query<{ count: string }>(
      `
        select count(*)::text as count
        from flats f
        inner join blocks b on b.id = f.block_id
        where ${whereSql}
      `,
      values.slice(0, values.length - 2),
    ),
  ])

  const items: FlatSummary[] = dataResult.rows.map((row) => ({
    id: row.id,
    societyId: row.society_id,
    blockId: row.block_id,
    blockName: row.block_name,
    flatNumber: row.flat_number,
    floorLabel: row.floor_label,
    unitType: row.unit_type,
    areaSqFt: row.area_sq_ft ? Number(row.area_sq_ft) : null,
    occupancyStatus: row.occupancy_status,
    isActive: row.is_active,
    ownerCount: Number(row.owner_count),
    tenantCount: Number(row.tenant_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  return createPaginatedSuccess(event, items, Number(countResult.rows[0]?.count ?? 0), query)
})
