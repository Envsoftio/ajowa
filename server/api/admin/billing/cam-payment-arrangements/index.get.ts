import { createPaginatedSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { parseListQuery } from '~/server/utils/master-data'
import type { CamPaymentArrangement } from '~/types/domain'

type ArrangementRow = {
  id: string
  society_id: string
  flat_id: string
  flat_number: string
  block_name: string
  unit_type: string
  penalty_free_until_day: number
  effective_from: string
  effective_until: string | null
  reason: string
  reference: string | null
  approved_by_user_id: string | null
  approved_by_name: string | null
  approved_at: string
  revoked_by_user_id: string | null
  revoked_at: string | null
  is_active: boolean
  primary_resident_name: string | null
  created_at: string
  updated_at: string
}

const flatNumberSortExpression =
  "coalesce(nullif(regexp_replace(f.flat_number, '\\D', '', 'g'), '')::integer, 2147483647)"

const sortColumns: Record<string, string> = {
  flatNumber: flatNumberSortExpression,
  effectiveFrom: 'cpa.effective_from',
  effectiveUntil: 'cpa.effective_until',
  penaltyFreeUntilDay: 'cpa.penalty_free_until_day',
  updatedAt: 'cpa.updated_at',
}

const mapArrangement = (row: ArrangementRow): CamPaymentArrangement => ({
  id: row.id,
  societyId: row.society_id,
  flatId: row.flat_id,
  flatNumber: row.flat_number,
  blockName: row.block_name,
  unitType: row.unit_type,
  penaltyFreeUntilDay: row.penalty_free_until_day,
  effectiveFrom: row.effective_from,
  effectiveUntil: row.effective_until,
  reason: row.reason,
  reference: row.reference,
  approvedByUserId: row.approved_by_user_id,
  approvedByName: row.approved_by_name,
  approvedAt: row.approved_at,
  revokedByUserId: row.revoked_by_user_id,
  revokedAt: row.revoked_at,
  isActive: row.is_active,
  primaryResidentName: row.primary_resident_name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = parseListQuery(event)
  const pool = getDatabasePool()
  const where: string[] = ['cpa.society_id = $1']
  const values: unknown[] = [authMe.user.societyId]

  if (query.search) {
    values.push(`%${query.search}%`)
    where.push(`(f.flat_number ilike $${values.length} or b.name ilike $${values.length} or resident.full_name ilike $${values.length} or cpa.reference ilike $${values.length} or cpa.reason ilike $${values.length})`)
  }

  const flatFilter = query.filters.flatId?.[0]
  if (flatFilter) {
    values.push(flatFilter)
    where.push(`cpa.flat_id = $${values.length}`)
  }

  const stateFilter = query.filters.state?.[0]
  if (stateFilter === 'active') {
    where.push('cpa.is_active = true and cpa.revoked_at is null')
  } else if (stateFilter === 'current') {
    where.push(`
      cpa.is_active = true
      and cpa.revoked_at is null
      and cpa.effective_from <= current_date
      and (cpa.effective_until is null or cpa.effective_until >= current_date)
    `)
  } else if (stateFilter === 'upcoming') {
    where.push('cpa.is_active = true and cpa.revoked_at is null and cpa.effective_from > current_date')
  } else if (stateFilter === 'expired') {
    where.push('cpa.effective_until is not null and cpa.effective_until < current_date')
  } else if (stateFilter === 'inactive') {
    where.push('(cpa.is_active = false or cpa.revoked_at is not null)')
  }

  const whereSql = where.join(' and ')
  const orderBy = sortColumns[query.sortBy ?? 'effectiveFrom'] ?? 'cpa.effective_from'
  const direction = query.sortDirection === 'asc' ? 'asc' : 'desc'
  values.push(query.pageSize, (query.page - 1) * query.pageSize)

  const [dataResult, countResult] = await Promise.all([
    pool.query<ArrangementRow>(
      `
        select
          cpa.id,
          cpa.society_id,
          cpa.flat_id,
          f.flat_number,
          b.name as block_name,
          f.unit_type,
          cpa.penalty_free_until_day,
          cpa.effective_from::text,
          cpa.effective_until::text,
          cpa.reason,
          cpa.reference,
          cpa.approved_by_user_id,
          approver.full_name as approved_by_name,
          cpa.approved_at::text,
          cpa.revoked_by_user_id,
          cpa.revoked_at::text,
          cpa.is_active,
          resident.full_name as primary_resident_name,
          cpa.created_at::text,
          cpa.updated_at::text
        from cam_payment_arrangements cpa
        inner join flats f on f.id = cpa.flat_id
        inner join blocks b on b.id = f.block_id
        left join users approver on approver.id = cpa.approved_by_user_id
        left join lateral (
          select u.full_name
          from flat_residents fr
          inner join users u on u.id = fr.user_id
          where fr.flat_id = f.id
            and fr.is_active = true
            and fr.is_billing_contact = true
          limit 1
        ) resident on true
        where ${whereSql}
        order by ${orderBy} ${direction}, b.sort_order asc, ${flatNumberSortExpression} asc, f.flat_number asc
        limit $${values.length - 1}
        offset $${values.length}
      `,
      values,
    ),
    pool.query<{ count: string }>(
      `
        select count(*)::text as count
        from cam_payment_arrangements cpa
        inner join flats f on f.id = cpa.flat_id
        inner join blocks b on b.id = f.block_id
        left join lateral (
          select u.full_name
          from flat_residents fr
          inner join users u on u.id = fr.user_id
          where fr.flat_id = f.id
            and fr.is_active = true
            and fr.is_billing_contact = true
          limit 1
        ) resident on true
        where ${whereSql}
      `,
      values.slice(0, values.length - 2),
    ),
  ])

  return createPaginatedSuccess(
    event,
    dataResult.rows.map(mapArrangement),
    Number(countResult.rows[0]?.count ?? 0),
    query,
  )
})
