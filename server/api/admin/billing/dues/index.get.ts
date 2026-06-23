import { createPaginatedSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { normalizeSocietySettings, parseListQuery } from '~/server/utils/master-data'
import { computeDueAmounts, todayDate } from '~/server/utils/billing'
import type { MaintenanceDue } from '~/types/domain'

type DueRow = {
  id: string
  society_id: string
  billing_period_id: string
  billing_period_label: string
  billing_period_due_date: string
  billing_period_charge_type: string
  billing_period_start_date: string
  billing_period_end_date: string
  flat_id: string
  flat_number: string
  block_name: string
  unit_type: string
  cam_advance_paid_until: string | null
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

const flatNumberSortExpression =
  "coalesce(nullif(regexp_replace(f.flat_number, '\\D', '', 'g'), '')::integer, 2147483647)"

const sortColumns: Record<string, string> = {
  flatNumber: flatNumberSortExpression,
  blockName: 'b.sort_order',
  dueDate: 'md.due_date',
  totalAmount: 'md.total_amount',
  balanceAmount: 'md.balance_amount',
  status: 'md.status',
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = parseListQuery(event)
  const pool = getDatabasePool()
  const today = todayDate()
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

  const balanceFilter = query.filters.balance?.[0]
  if (balanceFilter === 'outstanding') {
    where.push('md.balance_amount > 0')
  } else if (balanceFilter === 'paid') {
    where.push('md.balance_amount = 0')
  }

  const overdueFilter = query.filters.overdue?.[0]
  if (overdueFilter === 'true') {
    where.push(`md.balance_amount > 0 and md.due_date < $${values.length + 1}::date`)
    values.push(today)
  }

  const advanceFilter = query.filters.advance?.[0]
  if (advanceFilter === 'covered') {
    where.push(`
      bp.charge_type = 'CAM'
      and f.cam_advance_paid_until is not null
      and f.cam_advance_paid_until >= bp.end_date
    `)
  } else if (advanceFilter === 'billable') {
    where.push(`
      not (
        bp.charge_type = 'CAM'
        and f.cam_advance_paid_until is not null
        and f.cam_advance_paid_until >= bp.end_date
      )
    `)
  }

  const blockFilter = query.filters.blockId?.[0]
  if (blockFilter) {
    values.push(blockFilter)
    where.push(`f.block_id = $${values.length}`)
  }

  const whereSql = where.join(' and ')
  const sortBy = query.sortBy ?? 'flatNumber'
  const orderBy = sortColumns[sortBy] ?? flatNumberSortExpression
  const direction = query.sortDirection === 'desc' ? 'desc' : 'asc'
  const orderSql = sortBy === 'flatNumber'
    ? `b.sort_order ${direction}, ${flatNumberSortExpression} ${direction}, f.flat_number ${direction}`
    : `${orderBy} ${direction}, b.sort_order asc, ${flatNumberSortExpression} asc, f.flat_number asc`
  values.push(query.pageSize, (query.page - 1) * query.pageSize)

  const settingsResult = await pool.query<{ settings: Record<string, unknown> }>(
    `select settings from society_profile where id = $1 limit 1`,
    [authMe.user.societyId],
  )
  const settings = normalizeSocietySettings(settingsResult.rows[0]?.settings)

  const [dataResult, countResult] = await Promise.all([
    pool.query<DueRow>(
      `
        select
          md.id,
          md.society_id,
          md.billing_period_id,
          bp.label as billing_period_label,
          bp.due_date::text as billing_period_due_date,
          bp.charge_type::text as billing_period_charge_type,
          bp.start_date::text as billing_period_start_date,
          bp.end_date::text as billing_period_end_date,
          md.flat_id,
          f.flat_number,
          b.name as block_name,
          f.unit_type,
          f.cam_advance_paid_until::text,
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
        order by ${orderSql}
        limit $${values.length - 1}
        offset $${values.length}
      `,
      values,
    ),
    pool.query<{ count: string }>(
      `
        select count(*)::text as count
        from maintenance_dues md
        inner join billing_periods bp on bp.id = md.billing_period_id
        inner join flats f on f.id = md.flat_id
        inner join blocks b on b.id = f.block_id
        where ${whereSql}
      `,
      values.slice(0, values.length - 2),
    ),
  ])

  const items: MaintenanceDue[] = dataResult.rows.map((row) => {
    const baseAmount = Number(row.base_amount)
    const waivedAmount = Number(row.waived_amount)
    const paidAmount = Number(row.paid_amount)
    const computed = computeDueAmounts(
      {
        dueDate: row.due_date,
        baseAmount,
        waivedAmount,
        paidAmount,
        storedStatus: row.status,
      },
      today,
      settings.graceDays,
      settings.lateFeePerDay,
    )

    return {
      id: row.id,
      societyId: row.society_id,
      billingPeriodId: row.billing_period_id,
      billingPeriodLabel: row.billing_period_label,
      billingPeriodDueDate: row.billing_period_due_date,
      billingPeriodChargeType: row.billing_period_charge_type as NonNullable<MaintenanceDue['billingPeriodChargeType']>,
      billingPeriodStartDate: row.billing_period_start_date,
      billingPeriodEndDate: row.billing_period_end_date,
      flatId: row.flat_id,
      flatNumber: row.flat_number,
      blockName: row.block_name,
      unitType: row.unit_type,
      dueDate: row.due_date,
      baseAmount,
      lateFeeAmount: computed.lateFeeAmount,
      waivedAmount,
      paidAmount,
      totalAmount: computed.totalAmount,
      balanceAmount: computed.balanceAmount,
      status: computed.status,
      chargeBreakdown: Array.isArray(row.charge_breakdown) ? row.charge_breakdown : [],
      generatedAt: row.generated_at,
      primaryResidentName: row.primary_resident_name,
      isCamAdvanceCovered:
        row.billing_period_charge_type === 'CAM' &&
        row.cam_advance_paid_until != null &&
        row.cam_advance_paid_until >= row.billing_period_end_date,
      camAdvancePaidUntil: row.cam_advance_paid_until,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })

  return createPaginatedSuccess(event, items, Number(countResult.rows[0]?.count ?? 0), query)
})
