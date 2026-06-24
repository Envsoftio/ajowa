import { createPaginatedSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { normalizeSocietySettings, parseListQuery } from '~/server/utils/master-data'
import { computeDueAmounts, todayDate } from '~/server/utils/billing'
import { camAdvanceCoverageLateralSql } from '~/server/utils/cam-advance'
import type { MaintenanceDue } from '~/types/domain'

type DueRow = {
  row_kind: 'DUE' | 'CAM_ADVANCE_COVERAGE'
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
  block_id: string
  block_name: string
  unit_type: string
  cam_advance_coverage_id: string | null
  cam_advance_covered_from: string | null
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
  is_cam_advance_covered: boolean
}

const flatNumberSortExpression =
  "coalesce(nullif(regexp_replace(c.flat_number, '\\D', '', 'g'), '')::integer, 2147483647)"

const sortColumns: Record<string, string> = {
  flatNumber: flatNumberSortExpression,
  blockName: 'c.block_sort_order',
  dueDate: 'c.due_date',
  totalAmount: 'c.total_amount::numeric',
  balanceAmount: 'c.balance_amount::numeric',
  status: 'c.status',
}

const combinedDuesSql = `
  with combined as (
    select
      'DUE'::text as row_kind,
      md.id::text as id,
      md.society_id,
      md.billing_period_id,
      bp.label as billing_period_label,
      bp.due_date::text as billing_period_due_date,
      bp.charge_type::text as billing_period_charge_type,
      bp.start_date::text as billing_period_start_date,
      bp.end_date::text as billing_period_end_date,
      md.flat_id,
      f.flat_number,
      f.block_id,
      b.name as block_name,
      b.sort_order as block_sort_order,
      f.unit_type,
      coverage.id::text as cam_advance_coverage_id,
      coverage.covered_from::text as cam_advance_covered_from,
      coverage.covered_until::text as cam_advance_paid_until,
      md.due_date::text as due_date,
      md.base_amount::text as base_amount,
      md.late_fee_amount::text as late_fee_amount,
      md.waived_amount::text as waived_amount,
      md.paid_amount::text as paid_amount,
      md.total_amount::text as total_amount,
      case when coverage.id is not null then '0' else md.balance_amount::text end as balance_amount,
      case when coverage.id is not null then 'PAID' else md.status::text end as status,
      md.charge_breakdown,
      md.generated_at::text,
      u.full_name as primary_resident_name,
      md.created_at::text,
      md.updated_at::text,
      (coverage.id is not null) as is_cam_advance_covered
    from maintenance_dues md
    inner join billing_periods bp on bp.id = md.billing_period_id
    inner join flats f on f.id = md.flat_id
    inner join blocks b on b.id = f.block_id
    left join lateral (
      ${camAdvanceCoverageLateralSql('f', 'bp')}
    ) coverage on bp.charge_type = 'CAM'
    left join lateral (
      select u.full_name
      from flat_residents fr
      inner join users u on u.id = fr.user_id
      where fr.flat_id = md.flat_id
        and fr.is_active = true
        and fr.is_billing_contact = true
      limit 1
    ) u on true
    where md.society_id = $1

    union all

    select
      'CAM_ADVANCE_COVERAGE'::text as row_kind,
      concat('cam-advance:', bp.id::text, ':', f.id::text) as id,
      bp.society_id,
      bp.id as billing_period_id,
      bp.label as billing_period_label,
      bp.due_date::text as billing_period_due_date,
      bp.charge_type::text as billing_period_charge_type,
      bp.start_date::text as billing_period_start_date,
      bp.end_date::text as billing_period_end_date,
      f.id as flat_id,
      f.flat_number,
      f.block_id,
      b.name as block_name,
      b.sort_order as block_sort_order,
      f.unit_type,
      coverage.id::text as cam_advance_coverage_id,
      coverage.covered_from::text as cam_advance_covered_from,
      coverage.covered_until::text as cam_advance_paid_until,
      bp.due_date::text as due_date,
      '0' as base_amount,
      '0' as late_fee_amount,
      '0' as waived_amount,
      '0' as paid_amount,
      '0' as total_amount,
      '0' as balance_amount,
      'PAID' as status,
      jsonb_build_array(jsonb_build_object(
        'label', 'CAM advance coverage',
        'amount', coalesce(coverage.amount, 0),
        'chargeType', 'CAM',
        'source', 'CAM_ADVANCE_COVERAGE',
        'coveredFrom', coverage.covered_from,
        'coveredUntil', coverage.covered_until,
        'reference', coverage.reference
      )) as charge_breakdown,
      coverage.created_at::text as generated_at,
      u.full_name as primary_resident_name,
      coverage.created_at::text,
      coverage.updated_at::text,
      true as is_cam_advance_covered
    from billing_periods bp
    inner join flats f on f.society_id = bp.society_id and f.is_active = true
    inner join blocks b on b.id = f.block_id
    inner join lateral (
      ${camAdvanceCoverageLateralSql('f', 'bp')}
    ) coverage on true
    left join lateral (
      select u.full_name
      from flat_residents fr
      inner join users u on u.id = fr.user_id
      where fr.flat_id = f.id
        and fr.is_active = true
        and fr.is_billing_contact = true
      limit 1
    ) u on true
    where bp.society_id = $1
      and bp.charge_type = 'CAM'
      and not exists (
        select 1
        from maintenance_dues md
        where md.society_id = bp.society_id
          and md.billing_period_id = bp.id
          and md.flat_id = f.id
      )
  )
`

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = parseListQuery(event)
  const pool = getDatabasePool()
  const today = todayDate()
  const where: string[] = []
  const values: unknown[] = [authMe.user.societyId]

  if (query.search) {
    values.push(`%${query.search}%`)
    where.push(`(c.flat_number ilike $${values.length} or c.block_name ilike $${values.length} or c.primary_resident_name ilike $${values.length})`)
  }

  const periodFilter = query.filters.billingPeriodId?.[0]
  if (periodFilter) {
    values.push(periodFilter)
    where.push(`c.billing_period_id = $${values.length}`)
  }

  const chargeTypeFilter = query.filters.chargeType?.[0]
  if (chargeTypeFilter && ['GENERAL', 'CAM', 'DG_SET'].includes(chargeTypeFilter)) {
    values.push(chargeTypeFilter)
    where.push(`c.billing_period_charge_type = $${values.length}`)
  }

  const flatFilter = query.filters.flatId?.[0]
  if (flatFilter) {
    values.push(flatFilter)
    where.push(`c.flat_id = $${values.length}`)
  }

  const statusFilter = query.filters.status?.[0]
  if (statusFilter) {
    values.push(statusFilter)
    where.push(`c.row_kind = 'DUE' and c.status = $${values.length}`)
  }

  const balanceFilter = query.filters.balance?.[0]
  if (balanceFilter === 'outstanding') {
    where.push(`c.row_kind = 'DUE' and c.balance_amount::numeric > 0`)
  } else if (balanceFilter === 'paid') {
    where.push(`c.row_kind = 'DUE' and c.balance_amount::numeric = 0`)
  }

  const overdueFilter = query.filters.overdue?.[0]
  if (overdueFilter === 'true') {
    where.push(`c.balance_amount::numeric > 0 and c.due_date < $${values.length + 1}::date`)
    values.push(today)
  }

  const advanceFilter = query.filters.advance?.[0]
  if (advanceFilter === 'covered') {
    where.push('c.is_cam_advance_covered = true')
  } else if (advanceFilter === 'billable') {
    where.push('c.is_cam_advance_covered = false')
  }

  const blockFilter = query.filters.blockId?.[0]
  if (blockFilter) {
    values.push(blockFilter)
    where.push(`c.block_id = $${values.length}`)
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : ''
  const sortBy = query.sortBy ?? 'flatNumber'
  const orderBy = sortColumns[sortBy] ?? flatNumberSortExpression
  const direction = query.sortDirection === 'desc' ? 'desc' : 'asc'
  const orderSql = sortBy === 'flatNumber'
    ? `c.block_sort_order ${direction}, ${flatNumberSortExpression} ${direction}, c.flat_number ${direction}`
    : `${orderBy} ${direction}, c.block_sort_order asc, ${flatNumberSortExpression} asc, c.flat_number asc`

  const settingsResult = await pool.query<{ settings: Record<string, unknown> }>(
    `select settings from society_profile where id = $1 limit 1`,
    [authMe.user.societyId],
  )
  const settings = normalizeSocietySettings(settingsResult.rows[0]?.settings)

  const dataValues = [...values, query.pageSize, (query.page - 1) * query.pageSize]
  const [dataResult, countResult] = await Promise.all([
    pool.query<DueRow>(
      `
        ${combinedDuesSql}
        select *
        from combined c
        ${whereSql}
        order by ${orderSql}
        limit $${dataValues.length - 1}
        offset $${dataValues.length}
      `,
      dataValues,
    ),
    pool.query<{ count: string }>(
      `
        ${combinedDuesSql}
        select count(*)::text as count
        from combined c
        ${whereSql}
      `,
      values,
    ),
  ])

  const items: MaintenanceDue[] = dataResult.rows.map((row) => {
    const isCoverageRow = row.is_cam_advance_covered
    const baseAmount = Number(row.base_amount)
    const waivedAmount = Number(row.waived_amount)
    const paidAmount = Number(row.paid_amount)
    const computed = isCoverageRow
      ? {
          lateFeeAmount: Number(row.late_fee_amount),
          totalAmount: Number(row.total_amount),
          balanceAmount: Number(row.balance_amount),
          status: row.status as MaintenanceDue['status'],
        }
      : computeDueAmounts(
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
      isCamAdvanceCovered: isCoverageRow,
      isAdvanceCoverageRow: row.row_kind === 'CAM_ADVANCE_COVERAGE',
      camAdvanceCoverageId: row.cam_advance_coverage_id,
      camAdvanceCoveredFrom: row.cam_advance_covered_from,
      camAdvancePaidUntil: row.cam_advance_paid_until,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })

  return createPaginatedSuccess(event, items, Number(countResult.rows[0]?.count ?? 0), query)
})
