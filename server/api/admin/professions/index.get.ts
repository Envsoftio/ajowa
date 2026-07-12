import { createPaginatedSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { parseListQuery } from '~/server/utils/master-data'
import type { ProfessionSummary } from '~/types/domain'

type ProfessionRow = {
  id: string
  society_id: string
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
  is_public_allowed: boolean
  resident_profile_count: string
  linked_profile_count: string
  public_profile_count: string
  created_at: string
  updated_at: string
}

const sortColumns: Record<string, string> = {
  name: 'p.name',
  sortOrder: 'p.sort_order',
  isActive: 'p.is_active',
  isPublicAllowed: 'p.is_public_allowed',
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = parseListQuery(event)
  const pool = getDatabasePool()
  const where: string[] = ['p.society_id = $1']
  const values: unknown[] = [authMe.user.societyId]

  if (query.search) {
    values.push(`%${query.search}%`)
    where.push(
      `(p.name ilike $${values.length} or coalesce(p.description, '') ilike $${values.length})`,
    )
  }

  const activeFilter = query.filters.isActive?.[0]
  if (activeFilter === 'true' || activeFilter === 'false') {
    values.push(activeFilter === 'true')
    where.push(`p.is_active = $${values.length}`)
  }

  const publicFilter = query.filters.isPublicAllowed?.[0]
  if (publicFilter === 'true' || publicFilter === 'false') {
    values.push(publicFilter === 'true')
    where.push(`p.is_public_allowed = $${values.length}`)
  }

  const whereSql = where.join(' and ')
  const orderBy = sortColumns[query.sortBy ?? 'sortOrder'] ?? 'p.sort_order'
  const direction = query.sortDirection === 'desc' ? 'desc' : 'asc'
  values.push(query.pageSize, (query.page - 1) * query.pageSize)

  const [dataResult, countResult] = await Promise.all([
    pool.query<ProfessionRow>(
      `
        select
          p.id,
          p.society_id,
          p.name,
          p.description,
          p.sort_order,
          p.is_active,
          p.is_public_allowed,
          count(rpp.id) filter (where rpp.is_active = true)::text as resident_profile_count,
          count(rpp.id)::text as linked_profile_count,
          count(rpp.id) filter (
            where rpp.is_active = true and rpp.is_public = true and rpp.revoked_at is null
          )::text as public_profile_count,
          p.created_at::text,
          p.updated_at::text
        from professions p
        left join resident_profession_profiles rpp on rpp.profession_id = p.id
        where ${whereSql}
        group by p.id
        order by ${orderBy} ${direction}, p.name asc
        limit $${values.length - 1}
        offset $${values.length}
      `,
      values,
    ),
    pool.query<{ count: string }>(
      `
        select count(*)::text as count
        from professions p
        where ${whereSql}
      `,
      values.slice(0, values.length - 2),
    ),
  ])

  const items: ProfessionSummary[] = dataResult.rows.map((row) => ({
    id: row.id,
    societyId: row.society_id,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    isPublicAllowed: row.is_public_allowed,
    residentProfileCount: Number(row.resident_profile_count),
    linkedProfileCount: Number(row.linked_profile_count),
    publicProfileCount: Number(row.public_profile_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  return createPaginatedSuccess(
    event,
    items,
    Number(countResult.rows[0]?.count ?? 0),
    query,
  )
})
