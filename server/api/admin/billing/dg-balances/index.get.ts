import { createApiSuccess } from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { getDgBalanceStatePredicate } from '~/shared/dg-balance'
import { parseListQuery } from '~/server/utils/master-data'
import type { DgBalance, DgBalanceSummary } from '~/types/domain'

type DgBalanceRow = {
  id: string
  society_id: string
  flat_id: string
  flat_number: string
  block_name: string
  unit_type: string
  primary_resident_name: string | null
  billing_period_id: string
  billing_period_label: string
  period_start_date: string
  due_date: string
  origin: 'GENERATED_BILL' | 'DG_OPENING_BALANCE'
  opening_balance_as_of: string | null
  opening_balance_note: string | null
  principal_amount: string
  interest_amount: string
  late_fee_amount: string
  total_amount: string
  cash_paid_amount: string
  advance_applied_amount: string
  waived_amount: string
  balance_amount: string
  status: DgBalance['status']
  created_at: string
  updated_at: string
}

const sortColumns: Record<string, string> = {
  flatNumber:
    "coalesce(nullif(regexp_replace(f.flat_number, '\\D', '', 'g'), '')::integer, 2147483647)",
  periodStartDate: 'bp.start_date',
  dueDate: 'md.due_date',
  totalAmount: 'md.total_amount',
  balanceAmount: 'md.balance_amount',
  status: 'md.status',
  createdAt: 'md.created_at',
}

const mapBalance = (row: DgBalanceRow): DgBalance => ({
  id: row.id,
  societyId: row.society_id,
  flatId: row.flat_id,
  flatNumber: row.flat_number,
  blockName: row.block_name,
  unitType: row.unit_type,
  primaryResidentName: row.primary_resident_name,
  billingPeriodId: row.billing_period_id,
  billingPeriodLabel: row.billing_period_label,
  periodStartDate: row.period_start_date,
  dueDate: row.due_date,
  origin: row.origin,
  openingBalanceAsOf: row.opening_balance_as_of,
  openingBalanceNote: row.opening_balance_note,
  principalAmount: Number(row.principal_amount),
  interestAmount: Number(row.interest_amount),
  lateFeeAmount: Number(row.late_fee_amount),
  totalAmount: Number(row.total_amount),
  cashPaidAmount: Number(row.cash_paid_amount),
  advanceAppliedAmount: Number(row.advance_applied_amount),
  waivedAmount: Number(row.waived_amount),
  balanceAmount: Number(row.balance_amount),
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'billing.manage')
  const query = parseListQuery(event)
  const pool = getDatabasePool()
  const values: unknown[] = [authMe.user.societyId]
  const where = [
    'md.society_id = $1',
    "bp.charge_type = 'DG_SET'",
    "md.origin = 'DG_OPENING_BALANCE'",
  ]

  if (query.search) {
    values.push(`%${query.search}%`)
    const parameter = `$${values.length}`
    where.push(`(
      f.flat_number ilike ${parameter}
      or b.name ilike ${parameter}
      or resident.full_name ilike ${parameter}
      or bp.label ilike ${parameter}
      or coalesce(md.opening_balance_note, '') ilike ${parameter}
    )`)
  }

  const statePredicate = getDgBalanceStatePredicate(query.filters.state?.[0])
  if (statePredicate) where.push(statePredicate)
  const whereSql = where.join(' and ')
  const orderBy =
    sortColumns[query.sortBy ?? 'periodStartDate'] ?? 'bp.start_date'
  const direction = query.sortDirection === 'asc' ? 'asc' : 'desc'
  const dataValues = [
    ...values,
    query.pageSize,
    (query.page - 1) * query.pageSize,
  ]

  const [dataResult, countResult, summaryResult, advanceResult] =
    await Promise.all([
      pool.query<DgBalanceRow>(
        `
        select
          md.id,
          md.society_id,
          md.flat_id,
          f.flat_number,
          b.name as block_name,
          f.unit_type,
          resident.full_name as primary_resident_name,
          bp.id as billing_period_id,
          bp.label as billing_period_label,
          bp.start_date::text as period_start_date,
          md.due_date::text,
          md.origin,
          md.opening_balance_as_of::text,
          md.opening_balance_note,
          greatest(md.base_amount - amounts.interest_amount, 0)::text as principal_amount,
          amounts.interest_amount::text,
          md.late_fee_amount::text,
          md.total_amount::text,
          allocations.cash_paid_amount::text,
          allocations.advance_applied_amount::text,
          md.waived_amount::text,
          md.balance_amount::text,
          md.status::text,
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
          where fr.flat_id = f.id and fr.is_active = true and u.is_active = true
          order by fr.is_billing_contact desc, fr.is_primary_contact desc, fr.created_at asc
          limit 1
        ) resident on true
        left join lateral (
          select coalesce(sum(
            case
              when coalesce(item->>'interestAmount', '') ~ '^[0-9]+([.][0-9]+)?$'
                then (item->>'interestAmount')::numeric
              else 0
            end
          ), 0) as interest_amount
          from jsonb_array_elements(
            case when jsonb_typeof(md.charge_breakdown) = 'array'
              then md.charge_breakdown else '[]'::jsonb end
          ) item
        ) amounts on true
        left join lateral (
          select
            coalesce(sum(pa.allocated_amount) filter (where p.mode <> 'ADVANCE_CREDIT' and p.status = 'VERIFIED'), 0) as cash_paid_amount,
            coalesce(sum(pa.allocated_amount) filter (where p.mode = 'ADVANCE_CREDIT' and p.status = 'VERIFIED'), 0) as advance_applied_amount
          from payment_allocations pa
          inner join payments p on p.id = pa.payment_id
          where pa.maintenance_due_id = md.id
        ) allocations on true
        where ${whereSql}
        order by ${orderBy} ${direction}, md.id desc
        limit $${dataValues.length - 1}
        offset $${dataValues.length}
      `,
        dataValues,
      ),
      pool.query<{ count: string }>(
        `
        select count(*)::text as count
        from maintenance_dues md
        inner join billing_periods bp on bp.id = md.billing_period_id
        inner join flats f on f.id = md.flat_id
        inner join blocks b on b.id = f.block_id
        left join lateral (
          select u.full_name
          from flat_residents fr
          inner join users u on u.id = fr.user_id
          where fr.flat_id = f.id and fr.is_active = true and u.is_active = true
          order by fr.is_billing_contact desc, fr.is_primary_contact desc, fr.created_at asc
          limit 1
        ) resident on true
        where ${whereSql}
      `,
        values,
      ),
      pool.query<{
        principal_amount: string
        interest_amount: string
        late_fee_amount: string
        total_billed_amount: string
        cash_paid_amount: string
        advance_applied_amount: string
        waived_amount: string
        outstanding_amount: string
      }>(
        `
        with dg_dues as (
          select md.*
          from maintenance_dues md
          inner join billing_periods bp on bp.id = md.billing_period_id
          where md.society_id = $1
            and bp.charge_type = 'DG_SET'
            and md.origin = 'DG_OPENING_BALANCE'
        ), due_interest as (
          select
            md.id,
            coalesce(sum(
              case
                when coalesce(item->>'interestAmount', '') ~ '^[0-9]+([.][0-9]+)?$'
                  then (item->>'interestAmount')::numeric
                else 0
              end
            ), 0) as interest_amount
          from dg_dues md
          left join lateral jsonb_array_elements(
            case when jsonb_typeof(md.charge_breakdown) = 'array'
              then md.charge_breakdown else '[]'::jsonb end
          ) item on true
          group by md.id
        ), allocation_totals as (
          select
            coalesce(sum(pa.allocated_amount) filter (where p.mode <> 'ADVANCE_CREDIT' and p.status = 'VERIFIED'), 0) as cash_paid_amount,
            coalesce(sum(pa.allocated_amount) filter (where p.mode = 'ADVANCE_CREDIT' and p.status = 'VERIFIED'), 0) as advance_applied_amount
          from payment_allocations pa
          inner join payments p on p.id = pa.payment_id
          inner join dg_dues md on md.id = pa.maintenance_due_id
        )
        select
          coalesce(sum(greatest(md.base_amount - di.interest_amount, 0)), 0)::text as principal_amount,
          coalesce(sum(di.interest_amount), 0)::text as interest_amount,
          coalesce(sum(md.late_fee_amount), 0)::text as late_fee_amount,
          coalesce(sum(md.total_amount), 0)::text as total_billed_amount,
          at.cash_paid_amount::text,
          at.advance_applied_amount::text,
          coalesce(sum(md.waived_amount), 0)::text as waived_amount,
          coalesce(sum(md.balance_amount) filter (where md.status not in ('CANCELLED', 'WAIVED')), 0)::text as outstanding_amount
        from dg_dues md
        inner join due_interest di on di.id = md.id
        cross join allocation_totals at
        group by at.cash_paid_amount, at.advance_applied_amount
      `,
        [authMe.user.societyId],
      ),
      pool.query<{ amount: string; net_position: string }>(
        `
        with due_by_flat as (
          select md.flat_id, sum(md.balance_amount) as outstanding
          from maintenance_dues md
          inner join billing_periods bp on bp.id = md.billing_period_id
          where md.society_id = $1
            and bp.charge_type = 'DG_SET'
            and md.origin = 'DG_OPENING_BALANCE'
            and md.status in ('OPEN', 'PARTIALLY_PAID', 'OVERDUE')
            and md.balance_amount > 0
          group by md.flat_id
        ), advance_by_flat as (
          select flat_id, sum(current_balance) as available
          from resident_advance_credits
          where society_id = $1
            and applicable_charge_type = 'DG_SET'
            and status = 'ACTIVE'
            and current_balance > 0
          group by flat_id
        )
        select
          coalesce(sum(coalesce(a.available, 0)), 0)::text as amount,
          coalesce(sum(greatest(coalesce(d.outstanding, 0) - coalesce(a.available, 0), 0)), 0)::text as net_position
        from due_by_flat d
        full join advance_by_flat a on a.flat_id = d.flat_id
      `,
        [authMe.user.societyId],
      ),
    ])

  const summaryRow = summaryResult.rows[0]
  const outstandingAmount = Number(summaryRow?.outstanding_amount ?? 0)
  const availableAdvanceAmount = Number(advanceResult.rows[0]?.amount ?? 0)
  const summary: DgBalanceSummary = {
    principalAmount: Number(summaryRow?.principal_amount ?? 0),
    interestAmount: Number(summaryRow?.interest_amount ?? 0),
    lateFeeAmount: Number(summaryRow?.late_fee_amount ?? 0),
    totalBilledAmount: Number(summaryRow?.total_billed_amount ?? 0),
    cashPaidAmount: Number(summaryRow?.cash_paid_amount ?? 0),
    advanceAppliedAmount: Number(summaryRow?.advance_applied_amount ?? 0),
    waivedAmount: Number(summaryRow?.waived_amount ?? 0),
    outstandingAmount,
    availableAdvanceAmount,
    netPositionAmount: Number(
      advanceResult.rows[0]?.net_position ?? outstandingAmount,
    ),
  }

  return createApiSuccess(event, {
    items: dataResult.rows.map(mapBalance),
    total: Number(countResult.rows[0]?.count ?? 0),
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(
      Number(countResult.rows[0]?.count ?? 0) / query.pageSize,
    ),
    summary,
  })
})
