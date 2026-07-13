import * as XLSX from 'xlsx/xlsx.mjs'
import { createPaginatedSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import {
  getQuerySafe,
  normalizeSocietySettings,
  parseListQuery,
} from '~/server/utils/master-data'
import { getCamAdvanceAdjustedDueDate, resolveDueAmountsForDisplay, todayDate } from '~/server/utils/billing'
import { camAdvanceCoverageLateralSql } from '~/server/utils/cam-advance'
import { setEventHeader } from '~/server/utils/http-event'
import type { ListQueryParams } from '~/types/api'
import type { MaintenanceDue, SocietyPolicySettings } from '~/types/domain'

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
  dueDate: 'c.due_date::date',
  totalAmount: 'c.total_amount::numeric',
  balanceAmount: 'c.balance_amount::numeric',
  status: 'c.status',
}

const dueExcelExportLimit = 10000

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
      case
        when coverage.id is not null and md.balance_amount = 0 then '0'
        else md.balance_amount::text
      end as balance_amount,
      case
        when coverage.id is not null and md.balance_amount = 0 then 'PAID'
        else md.status::text
      end as status,
      md.charge_breakdown,
      md.generated_at::text,
      u.full_name as primary_resident_name,
      md.created_at::text,
      md.updated_at::text,
      (coverage.id is not null and md.balance_amount = 0) as is_cam_advance_covered
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

const firstQueryValue = (value: unknown) => {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first.trim() : ''
}

const isExcelExportRequest = (rawQuery: Record<string, unknown>) => {
  const format = (
    firstQueryValue(rawQuery.export) ||
    firstQueryValue(rawQuery.format)
  ).toLowerCase()

  return format === 'xlsx' || format === 'excel'
}

const buildDueExportFileName = () =>
  `maintenance-dues-${new Date().toISOString().slice(0, 10)}.xlsx`

const buildDueWhere = (
  societyId: string,
  query: ListQueryParams,
  today: string,
) => {
  const where: string[] = []
  const values: unknown[] = [societyId]
  const overduePredicate = (todayParam: string) => `
    c.row_kind = 'DUE'
    and c.balance_amount::numeric > 0
    and c.due_date::date < ${todayParam}::date
    and not exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(c.charge_breakdown) = 'array' then c.charge_breakdown
          else '[]'::jsonb
        end
      ) item
      where c.billing_period_charge_type = 'CAM'
        and coalesce(item->>'camAdvanceAdjustmentAmount', '') ~ '^[0-9]+([.][0-9]+)?$'
        and coalesce(item->>'camAdvanceCoveredMonths', '') ~ '^[0-9]+$'
        and (item->>'camAdvanceAdjustmentAmount')::numeric > 0
        and (item->>'camAdvanceCoveredMonths')::integer > 0
        and ${todayParam}::date < greatest(
          c.due_date::date,
          (
            c.billing_period_start_date::date
            + ((item->>'camAdvanceCoveredMonths')::integer * interval '1 month')
          )::date
        )
    )
  `
  const camAdvanceAdjustmentPredicate = `
    exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(c.charge_breakdown) = 'array' then c.charge_breakdown
          else '[]'::jsonb
        end
      ) item
      where c.billing_period_charge_type = 'CAM'
        and (
          (
            coalesce(item->>'camAdvanceAdjustmentAmount', '') ~ '^[0-9]+([.][0-9]+)?$'
            and (item->>'camAdvanceAdjustmentAmount')::numeric > 0
          )
          or (
            coalesce(item->>'camAdvanceCoveredMonths', '') ~ '^[0-9]+$'
            and (item->>'camAdvanceCoveredMonths')::integer > 0
          )
        )
    )
  `

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
  if (statusFilter === 'OVERDUE') {
    where.push(`(${overduePredicate(`$${values.length + 1}`)})`)
    values.push(today)
  } else if (statusFilter === 'OPEN') {
    where.push(`c.row_kind = 'DUE' and c.status = 'OPEN' and not (${overduePredicate(`$${values.length + 1}`)})`)
    values.push(today)
  } else if (statusFilter) {
    values.push(statusFilter)
    where.push(`c.row_kind = 'DUE' and c.status = $${values.length}`)
  }

  const balanceFilter = query.filters.balance?.[0]
  if (balanceFilter === 'outstanding') {
    where.push(`c.row_kind = 'DUE' and c.balance_amount::numeric > 0`)
  } else if (balanceFilter === 'paid') {
    where.push(`c.row_kind = 'DUE' and c.balance_amount::numeric = 0`)
  } else if (balanceFilter === 'unpaid') {
    where.push(`
      c.row_kind = 'DUE'
      and c.paid_amount::numeric = 0
      and c.waived_amount::numeric = 0
      and c.balance_amount::numeric > 0
      and c.balance_amount::numeric = c.total_amount::numeric
      and c.status not in ('PAID', 'PARTIALLY_PAID', 'WAIVED', 'CANCELLED')
      and c.is_cam_advance_covered = false
      and not (${camAdvanceAdjustmentPredicate})
    `)
  }

  const overdueFilter = query.filters.overdue?.[0]
  if (overdueFilter === 'true') {
    where.push(`(${overduePredicate(`$${values.length + 1}`)})`)
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

  return { whereSql, values }
}

const buildDueOrderSql = (query: ListQueryParams) => {
  const sortBy = query.sortBy ?? 'flatNumber'
  const orderBy = sortColumns[sortBy] ?? flatNumberSortExpression
  const direction = query.sortDirection === 'desc' ? 'desc' : 'asc'

  return sortBy === 'flatNumber'
    ? `c.block_sort_order ${direction}, ${flatNumberSortExpression} ${direction}, c.flat_number ${direction}`
    : `${orderBy} ${direction}, c.block_sort_order asc, ${flatNumberSortExpression} asc, c.flat_number asc`
}

const mapDueRows = (
  rows: DueRow[],
  settings: SocietyPolicySettings,
  today: string,
): MaintenanceDue[] =>
  rows.map((row) => {
    const isCoverageRow = row.is_cam_advance_covered
    const baseAmount = Number(row.base_amount)
    const waivedAmount = Number(row.waived_amount)
    const paidAmount = Number(row.paid_amount)
    const chargeBreakdown = Array.isArray(row.charge_breakdown)
      ? row.charge_breakdown as MaintenanceDue['chargeBreakdown']
      : []
    const effectiveDueDate = getCamAdvanceAdjustedDueDate({
      dueDate: row.due_date,
      billingPeriodChargeType: row.billing_period_charge_type,
      billingPeriodStartDate: row.billing_period_start_date,
      billingPeriodEndDate: row.billing_period_end_date,
      chargeBreakdown,
    })
    const computed = isCoverageRow
      ? {
          lateFeeAmount: Number(row.late_fee_amount),
          totalAmount: Number(row.total_amount),
          balanceAmount: Number(row.balance_amount),
          status: row.status as MaintenanceDue['status'],
        }
      : resolveDueAmountsForDisplay(
          {
            dueDate: effectiveDueDate,
            baseAmount,
            lateFeeAmount: Number(row.late_fee_amount),
            waivedAmount,
            paidAmount,
            totalAmount: Number(row.total_amount),
            balanceAmount: Number(row.balance_amount),
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
      chargeBreakdown,
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

const billTypeLabel = (value: MaintenanceDue['billingPeriodChargeType']) => {
  if (value === 'CAM') return 'CAM'
  if (value === 'DG_SET') return 'DG Set'
  return 'General'
}

const filterValue = (query: ListQueryParams, key: string) =>
  query.filters[key]?.[0] ?? ''

const filterDescription = (query: ListQueryParams) => {
  const parts = [
    query.search && `Search: ${query.search}`,
    filterValue(query, 'billingPeriodId') &&
      `Billing period ID: ${filterValue(query, 'billingPeriodId')}`,
    filterValue(query, 'chargeType') &&
      `Bill type: ${billTypeLabel(filterValue(query, 'chargeType') as MaintenanceDue['billingPeriodChargeType'])}`,
    filterValue(query, 'status') && `Status: ${filterValue(query, 'status')}`,
    filterValue(query, 'balance') === 'outstanding' && 'Balance: Outstanding',
    filterValue(query, 'balance') === 'unpaid' && 'Balance: Unpaid - no payment or advance',
    filterValue(query, 'balance') === 'paid' && 'Balance: Paid off',
    filterValue(query, 'overdue') === 'true' && 'Overdue only',
    filterValue(query, 'advance') === 'covered' && 'Advance: Covered',
    filterValue(query, 'advance') === 'billable' && 'Advance: Billable',
  ].filter(Boolean)

  return parts.length ? parts.join(' | ') : 'All dues'
}

const camAdvanceAdjustmentAmount = (due: MaintenanceDue) =>
  due.chargeBreakdown.reduce((sum, item) => {
    const adjustment = Number(item.camAdvanceAdjustmentAmount ?? 0)
    return Number.isFinite(adjustment) && adjustment > 0
      ? sum + adjustment
      : sum
  }, 0)

const advanceStatusLabel = (due: MaintenanceDue) => {
  if (due.isAdvanceCoverageRow) return 'Coverage marker'
  if (due.isCamAdvanceCovered) return 'Covered'
  if (camAdvanceAdjustmentAmount(due) > 0) return 'Advance deducted'
  if (due.billingPeriodChargeType === 'CAM') return 'Billable'
  return 'Not CAM'
}

const chargeBreakdownText = (due: MaintenanceDue) =>
  due.chargeBreakdown
    .map((item) => {
      const amount = Number(item.amount)
      const adjustment = Number(item.camAdvanceAdjustmentAmount ?? 0)
      const parts = [
        item.label,
        Number.isFinite(amount) ? amount : null,
        Number.isFinite(adjustment) && adjustment > 0
          ? `advance deducted ${adjustment}`
          : null,
      ].filter((part) => part !== null && part !== '')

      return parts.join(' - ')
    })
    .join('; ')

const mapDueWorkbookRow = (due: MaintenanceDue) => ({
  'Due ID': due.isAdvanceCoverageRow ? '' : due.id,
  'Row type': due.isAdvanceCoverageRow ? 'CAM advance coverage marker' : 'Due',
  Block: due.blockName,
  Flat: due.flatNumber,
  'Unit type': due.unitType,
  'Billing contact': due.primaryResidentName ?? '',
  Period: due.billingPeriodLabel,
  'Bill type': billTypeLabel(due.billingPeriodChargeType),
  'Period start': due.billingPeriodStartDate ?? '',
  'Period end': due.billingPeriodEndDate ?? '',
  'Due date': due.dueDate,
  'Base amount': due.baseAmount,
  'Late fee': due.lateFeeAmount,
  'Waived amount': due.waivedAmount,
  'Paid amount': due.paidAmount,
  'Total amount': due.totalAmount,
  'Balance amount': due.balanceAmount,
  Status: due.status,
  'Advance status': advanceStatusLabel(due),
  'CAM advance adjustment': camAdvanceAdjustmentAmount(due),
  'Covered from': due.camAdvanceCoveredFrom ?? '',
  'Covered until': due.camAdvancePaidUntil ?? '',
  'Generated at': due.generatedAt,
  'Charge breakdown': chargeBreakdownText(due),
})

const buildDueWorkbook = (
  items: MaintenanceDue[],
  total: number,
  query: ListQueryParams,
) => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet(
    items.length
      ? items.map(mapDueWorkbookRow)
      : [{ Note: 'No dues found for the selected filters.' }],
  )
  worksheet['!cols'] = [
    { wch: 38 },
    { wch: 28 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 26 },
    { wch: 24 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 20 },
    { wch: 22 },
    { wch: 12 },
    { wch: 12 },
    { wch: 22 },
    { wch: 60 },
  ]

  const billRows = items.filter((item) => !item.isAdvanceCoverageRow)
  const totalDue = billRows.reduce((sum, item) => sum + item.totalAmount, 0)
  const totalPaid = billRows.reduce((sum, item) => sum + item.paidAmount, 0)
  const totalBalance = billRows.reduce((sum, item) => sum + item.balanceAmount, 0)
  const summarySheet = XLSX.utils.json_to_sheet([
    { Metric: 'Report', Value: 'Maintenance bills' },
    { Metric: 'Filters', Value: filterDescription(query) },
    { Metric: 'Generated at', Value: new Date().toISOString() },
    { Metric: 'Matching rows', Value: total },
    { Metric: 'Exported rows', Value: items.length },
    { Metric: 'Export limit', Value: dueExcelExportLimit },
    {
      Metric: 'Export note',
      Value: total > items.length
        ? `Exported first ${items.length} of ${total} matching rows. Narrow filters to export a smaller set.`
        : 'All matching rows exported.',
    },
    { Metric: 'Exported total due', Value: totalDue },
    { Metric: 'Exported total paid', Value: totalPaid },
    { Metric: 'Exported total balance', Value: totalBalance },
    {
      Metric: 'Exported overdue rows',
      Value: billRows.filter((item) => item.status === 'OVERDUE').length,
    },
    {
      Metric: 'Exported CAM advance rows',
      Value: items.filter((item) => item.isCamAdvanceCovered).length,
    },
  ])

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Dues')
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const rawQuery = getQuerySafe(event)
  const query = parseListQuery(event)
  const pool = getDatabasePool()
  const today = todayDate()
  const { whereSql, values } = buildDueWhere(authMe.user.societyId, query, today)
  const orderSql = buildDueOrderSql(query)
  const settingsPromise = pool.query<{ settings: Record<string, unknown> }>(
    `select settings from society_profile where id = $1 limit 1`,
    [authMe.user.societyId],
  )
  const countPromise = pool.query<{ count: string }>(
    `
      ${combinedDuesSql}
      select count(*)::text as count
      from combined c
      ${whereSql}
    `,
    values,
  )

  if (isExcelExportRequest(rawQuery)) {
    const exportValues = [...values, dueExcelExportLimit]
    const [dataResult, countResult, settingsResult] = await Promise.all([
      pool.query<DueRow>(
        `
          ${combinedDuesSql}
          select *
          from combined c
          ${whereSql}
          order by ${orderSql}
          limit $${exportValues.length}
        `,
        exportValues,
      ),
      countPromise,
      settingsPromise,
    ])
    const settings = normalizeSocietySettings(settingsResult.rows[0]?.settings)
    const items = mapDueRows(dataResult.rows, settings, today)
    const total = Number(countResult.rows[0]?.count ?? 0)

    setEventHeader(
      event,
      'content-type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    setEventHeader(
      event,
      'content-disposition',
      `attachment; filename="${buildDueExportFileName()}"`,
    )

    return buildDueWorkbook(items, total, query)
  }

  const dataValues = [...values, query.pageSize, (query.page - 1) * query.pageSize]
  const [dataResult, countResult, settingsResult] = await Promise.all([
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
    countPromise,
    settingsPromise,
  ])
  const settings = normalizeSocietySettings(settingsResult.rows[0]?.settings)
  const items = mapDueRows(dataResult.rows, settings, today)

  return createPaginatedSuccess(event, items, Number(countResult.rows[0]?.count ?? 0), query)
})
