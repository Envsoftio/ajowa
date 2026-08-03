import type { Pool, PoolClient } from 'pg'
import {
  computeDgAwareBillingDueAmounts,
  getVerifiedDuePaymentEvents,
  type DuePaymentEvent,
} from '~/server/utils/billing'
import type { ChargeBreakdownItem, SocietyPolicySettings } from '~/types/domain'

type PreviousDgDueCandidateRow = {
  current_due_id: string
  prior_due_id: string
  prior_due_date: string
  prior_late_fee_starts_on: string | null
  prior_manual_late_fee_starts_on: string | null
  prior_period_start_date: string
  prior_period_end_date: string
  prior_charge_breakdown: unknown
  prior_base_amount: string
  prior_waived_amount: string
  prior_paid_amount: string
  prior_status: string
}

export type PreviousDgOutstandingSummary = {
  amount: number
  count: number
}

const roundDgMoney = (value: number) =>
  Math.max(0, Math.round((Number.isFinite(value) ? value : 0) * 100) / 100)

export const buildPreviousDgOutstandingByDueId = (
  rows: readonly PreviousDgDueCandidateRow[],
  paymentEventsByDueId: ReadonlyMap<string, DuePaymentEvent[]>,
  today: string,
  settings: SocietyPolicySettings,
) => {
  const summaries = new Map<string, PreviousDgOutstandingSummary>()
  const computedBalances = new Map<string, number>()
  const seenPairs = new Set<string>()

  for (const row of rows) {
    const pairKey = `${row.current_due_id}:${row.prior_due_id}`
    if (seenPairs.has(pairKey)) continue
    seenPairs.add(pairKey)

    let priorBalance = computedBalances.get(row.prior_due_id)
    if (priorBalance === undefined) {
      const chargeBreakdown = Array.isArray(row.prior_charge_breakdown)
        ? (row.prior_charge_breakdown as ChargeBreakdownItem[])
        : []
      const computed = computeDgAwareBillingDueAmounts(
        {
          dueDate: row.prior_due_date,
          billingPeriodChargeType: 'DG_SET',
          billingPeriodStartDate: row.prior_period_start_date,
          billingPeriodEndDate: row.prior_period_end_date,
          chargeBreakdown,
          lateFeeStartsOn: row.prior_late_fee_starts_on,
          manualLateFeeStartsOn: row.prior_manual_late_fee_starts_on,
          baseAmount: Number(row.prior_base_amount),
          waivedAmount: Number(row.prior_waived_amount),
          paidAmount: Number(row.prior_paid_amount),
          storedStatus: row.prior_status,
          paymentEvents: paymentEventsByDueId.get(row.prior_due_id) ?? [],
        },
        today,
        settings.graceDays,
        settings.lateFeePerDay,
        settings,
      )
      priorBalance = roundDgMoney(computed.balanceAmount)
      computedBalances.set(row.prior_due_id, priorBalance)
    }

    if (priorBalance <= 0) continue

    const current = summaries.get(row.current_due_id) ?? { amount: 0, count: 0 }
    summaries.set(row.current_due_id, {
      amount: roundDgMoney(current.amount + priorBalance),
      count: current.count + 1,
    })
  }

  return summaries
}

export const getPreviousDgOutstandingByDueId = async (
  queryable: Pool | PoolClient,
  societyId: string,
  dueIds: readonly string[],
  today: string,
  settings: SocietyPolicySettings,
) => {
  const uniqueDueIds = [...new Set(dueIds)].filter(Boolean)
  if (uniqueDueIds.length === 0) {
    return new Map<string, PreviousDgOutstandingSummary>()
  }

  const result = await queryable.query<PreviousDgDueCandidateRow>(
    `
      select
        current_md.id::text as current_due_id,
        prior_md.id::text as prior_due_id,
        prior_md.due_date::text as prior_due_date,
        prior_md.late_fee_starts_on::text as prior_late_fee_starts_on,
        prior_md.manual_late_fee_starts_on::text as prior_manual_late_fee_starts_on,
        prior_bp.start_date::text as prior_period_start_date,
        prior_bp.end_date::text as prior_period_end_date,
        prior_md.charge_breakdown as prior_charge_breakdown,
        prior_md.base_amount::text as prior_base_amount,
        prior_md.waived_amount::text as prior_waived_amount,
        prior_md.paid_amount::text as prior_paid_amount,
        prior_md.status::text as prior_status
      from maintenance_dues current_md
      inner join billing_periods current_bp
        on current_bp.id = current_md.billing_period_id
      inner join maintenance_dues prior_md
        on prior_md.society_id = current_md.society_id
        and prior_md.flat_id = current_md.flat_id
        and prior_md.id <> current_md.id
      inner join billing_periods prior_bp
        on prior_bp.id = prior_md.billing_period_id
      where current_md.society_id = $1
        and current_md.id = any($2::uuid[])
        and current_bp.charge_type = 'DG_SET'
        and current_md.origin = 'GENERATED_BILL'
        and prior_bp.charge_type = 'DG_SET'
        and prior_bp.start_date < current_bp.start_date
        and prior_md.status not in ('PAID', 'WAIVED', 'CANCELLED')
      order by current_md.id, prior_bp.start_date, prior_md.id
    `,
    [societyId, uniqueDueIds],
  )
  const paymentEventsByDueId = await getVerifiedDuePaymentEvents(
    queryable,
    result.rows.map((row) => row.prior_due_id),
  )

  return buildPreviousDgOutstandingByDueId(
    result.rows,
    paymentEventsByDueId,
    today,
    settings,
  )
}
