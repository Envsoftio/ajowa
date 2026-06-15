import { createPaginatedSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { parseListQuery } from '~/server/utils/master-data'
import { mapRowToBillingPeriod } from '~/server/utils/billing'
import type { BillingPeriod } from '~/types/domain'

type BillingPeriodRow = {
  id: string
  society_id: string
  label: string
  frequency: string
  start_date: string
  end_date: string
  due_date: string
  is_locked: boolean
  locked_at: string | null
  lock_reason: string | null
  created_at: string
  updated_at: string
  due_count: string
  paid_due_count: string
  unpaid_due_count: string
}

const sortColumns: Record<string, string> = {
  label: 'bp.label',
  startDate: 'bp.start_date',
  endDate: 'bp.end_date',
  dueDate: 'bp.due_date',
  isLocked: 'bp.is_locked',
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = parseListQuery(event)
  const pool = getDatabasePool()
  const where: string[] = ['bp.society_id = $1']
  const values: unknown[] = [authMe.user.societyId]

  if (query.search) {
    values.push(`%${query.search}%`)
    where.push(`bp.label ilike $${values.length}`)
  }

  const statusFilter = query.filters.status?.[0]
  if (statusFilter === 'locked') {
    where.push('bp.is_locked = true')
  } else if (statusFilter === 'open') {
    where.push('bp.is_locked = false')
  }

  const frequencyFilter = query.filters.frequency?.[0]
  if (frequencyFilter && ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM'].includes(frequencyFilter)) {
    values.push(frequencyFilter)
    where.push(`bp.frequency = $${values.length}`)
  }

  const whereSql = where.join(' and ')
  const orderBy = sortColumns[query.sortBy ?? 'startDate'] ?? 'bp.start_date'
  const direction = query.sortDirection === 'asc' ? 'asc' : 'desc'
  values.push(query.pageSize, (query.page - 1) * query.pageSize)

  const [dataResult, countResult] = await Promise.all([
    pool.query<BillingPeriodRow>(
      `
        select
          bp.id,
          bp.society_id,
          bp.label,
          bp.frequency::text,
          bp.start_date::text,
          bp.end_date::text,
          bp.due_date::text,
          bp.is_locked,
          bp.locked_at::text,
          bp.lock_reason,
          bp.created_at::text,
          bp.updated_at::text,
          count(md.id)::text as due_count,
          count(*) filter (where md.status = 'PAID')::text as paid_due_count,
          count(*) filter (where md.status in ('OPEN', 'PARTIALLY_PAID', 'OVERDUE'))::text as unpaid_due_count
        from billing_periods bp
        left join maintenance_dues md on md.billing_period_id = bp.id
        where ${whereSql}
        group by bp.id
        order by ${orderBy} ${direction}, bp.start_date desc
        limit $${values.length - 1}
        offset $${values.length}
      `,
      values,
    ),
    pool.query<{ count: string }>(
      `
        select count(*)::text as count
        from billing_periods bp
        where ${whereSql}
      `,
      values.slice(0, values.length - 2),
    ),
  ])

  const items: BillingPeriod[] = dataResult.rows.map(mapRowToBillingPeriod)

  return createPaginatedSuccess(event, items, Number(countResult.rows[0]?.count ?? 0), query)
})