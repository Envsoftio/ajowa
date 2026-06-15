import { createPaginatedSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { parseListQuery } from '~/server/utils/master-data'
import type { MaintenanceDue } from '~/types/domain'

type DueRow = {
  id: string
  society_id: string
  billing_period_id: string
  billing_period_label: string
  billing_period_due_date: string
  flat_id: string
  flat_number: string
  block_name: string
  unit_type: string
  due_date: string
  base_amount: string
  late_fee_amount: string
  waived_amount: string
  paid_amount: string
  total_amount: string
  balance_amount: string
  status: string
  charge_breakdown: unknown
  generated_at: string
  primary_resident_name: string | null
  created_at: string
  updated_at: string
}

const sortColumns: Record<string, string> = {
  flatNumber: 'f.flat_number',
  blockName: 'b.name',
  dueDate: 'md.due_date',
  totalAmount: 'md.total_amount',
  balanceAmount: 'md.balance_amount',
  status: 'md.status',
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = parseListQuery(event)
  const pool = getDatabasePool()
  const where: string[] = ['md.society_id = $1']
  const values: unknown[] = [authMe.user.societyId]

  if (query.search) {
    values.push(`%${query.search}%`)
    where.push(`(f.flat_number ilike $${values.length} or b.name ilike $${values.length})`)
  }

  const periodFilter = query.filters.billingPeriodId?.[0]
  if (periodFilter) {
    values.push(periodFilter)
    where.push(`md.billing_period_id = $${values.length}`)
  }

  const flatFilter = query.filters.flatId?.[0]
  if (flatFilter) {
    values.push(flatFilter)
    where.push(`md.flat_id = $${values.length}`)
  }

  const statusFilter = query.filters.status?.[0]
  if (statusFilter) {
    values.push(statusFilter)
    where.push(`md.status = $${values.length}`)
  }

  const blockFilter = query.filters.blockId?.[0]
  if (blockFilter) {
    values.push(blockFilter)
    where.push(`f.block_id = $${values.length}`)
  }

  const whereSql = where.join(' and ')
  const orderBy = sortColumns[query.sortBy ?? 'flatNumber'] ?? 'f.flat_number'
  const direction = query.sortDirection === 'desc' ? 'desc' : 'asc'
  values.push(query.pageSize, (query.page - 1) * query.pageSize)

  const [dataResult, countResult] = await Promise.all([
    pool.query<DueRow>(
      `
        select
          md.id,
          md.society_id,
          md.billing_period_id,
          bp.label as billing_period_label,
          bp.due_date::text as billing_period_due_date,
          md.flat_id,
          f.flat_number,
          b.name as block_name,
          f.unit_type,
          md.due_date::text,
          md.base_amount::text,
          md.late_fee_amount::text,
          md.waived_amount::text,
          md.paid_amount::text,
          md.total_amount::text,
          md.balance_amount::text,
          md.status::text,
          md.charge_breakdown,
          md.generated_at::text,
          u.full_name as primary_resident_name,
          md.created_at::text,
          md.updated_at::text
        from maintenance_dues md
        inner join billing_periods bp on bp.id = md.billing_period_id
        inner join flats f on f.id = md.flat_id
        inner join blocks b on b.id = f.block_id
        left join lateral (
          select u.full_name
          from flat_residents fr
          inner join users u on u.id = fr.user_id
          where fr.flat_id = md.flat_id
            and fr.is_active = true
            and fr.is_billing_contact = true
          limit 1
        ) u on true
        where ${whereSql}
        order by ${orderBy} ${direction}, b.name asc, f.flat_number asc
        limit $${values.length - 1}
        offset $${values.length}
      `,
      values,
    ),
    pool.query<{ count: string }>(
      `
        select count(*)::text as count
        from maintenance_dues md
        inner join flats f on f.id = md.flat_id
        inner join blocks b on b.id = f.block_id
        where ${whereSql}
      `,
      values.slice(0, values.length - 2),
    ),
  ])

  const items: MaintenanceDue[] = dataResult.rows.map((row) => ({
    id: row.id,
    societyId: row.society_id,
    billingPeriodId: row.billing_period_id,
    billingPeriodLabel: row.billing_period_label,
    billingPeriodDueDate: row.billing_period_due_date,
    flatId: row.flat_id,
    flatNumber: row.flat_number,
    blockName: row.block_name,
    unitType: row.unit_type,
    dueDate: row.due_date,
    baseAmount: Number(row.base_amount),
    lateFeeAmount: Number(row.late_fee_amount),
    waivedAmount: Number(row.waived_amount),
    paidAmount: Number(row.paid_amount),
    totalAmount: Number(row.total_amount),
    balanceAmount: Number(row.balance_amount),
    status: row.status as MaintenanceDue['status'],
    chargeBreakdown: Array.isArray(row.charge_breakdown) ? row.charge_breakdown : [],
    generatedAt: row.generated_at,
    primaryResidentName: row.primary_resident_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  return createPaginatedSuccess(event, items, Number(countResult.rows[0]?.count ?? 0), query)
})