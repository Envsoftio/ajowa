import { createPaginatedSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { parseListQuery } from '~/server/utils/master-data'
import type { BlockSummary } from '~/types/domain'

type BlockRow = {
  id: string
  society_id: string
  code: string
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
  flat_count: string
  active_flat_count: string
}

const sortColumns: Record<string, string> = {
  name: 'b.name',
  code: 'b.code',
  sortOrder: 'b.sort_order',
  isActive: 'b.is_active',
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = parseListQuery(event)
  const pool = getDatabasePool()
  const where: string[] = ['b.society_id = $1']
  const values: unknown[] = [authMe.user.societyId]

  if (query.search) {
    values.push(`%${query.search}%`)
    where.push(`(b.name ilike $${values.length} or b.code ilike $${values.length})`)
  }

  const activeFilter = query.filters.isActive?.[0]
  if (activeFilter === 'true' || activeFilter === 'false') {
    values.push(activeFilter === 'true')
    where.push(`b.is_active = $${values.length}`)
  }

  const whereSql = where.join(' and ')
  const orderBy = sortColumns[query.sortBy ?? 'sortOrder'] ?? 'b.sort_order'
  const direction = query.sortDirection === 'desc' ? 'desc' : 'asc'
  values.push(query.pageSize, (query.page - 1) * query.pageSize)

  const [dataResult, countResult] = await Promise.all([
    pool.query<BlockRow>(
      `
        select
          b.id,
          b.society_id,
          b.code,
          b.name,
          b.description,
          b.sort_order,
          b.is_active,
          b.created_at::text,
          b.updated_at::text,
          count(f.id)::text as flat_count,
          count(*) filter (where f.is_active = true)::text as active_flat_count
        from blocks b
        left join flats f on f.block_id = b.id
        where ${whereSql}
        group by b.id
        order by ${orderBy} ${direction}, b.name asc
        limit $${values.length - 1}
        offset $${values.length}
      `,
      values,
    ),
    pool.query<{ count: string }>(
      `
        select count(*)::text as count
        from blocks b
        where ${whereSql}
      `,
      values.slice(0, values.length - 2),
    ),
  ])

  const items: BlockSummary[] = dataResult.rows.map((row) => ({
    id: row.id,
    societyId: row.society_id,
    code: row.code,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    flatCount: Number(row.flat_count),
    activeFlatCount: Number(row.active_flat_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  return createPaginatedSuccess(event, items, Number(countResult.rows[0]?.count ?? 0), query)
})
