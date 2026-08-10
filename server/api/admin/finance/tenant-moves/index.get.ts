import { z } from 'zod'
import { createApiSuccess } from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { getQuerySafe } from '~/server/utils/master-data'
import { tenantMoveStatuses } from '~/server/utils/tenant-moves'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(tenantMoveStatuses).or(z.literal('')).default(''),
  search: z.string().trim().max(120).default(''),
})

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'finance.view')
  const query = querySchema.parse(getQuerySafe(event))
  const pool = getDatabasePool()
  const searchPattern = query.search ? `%${query.search}%` : ''
  const offset = (query.page - 1) * query.pageSize

  const baseCte = `
    with receipt_totals as (
      select move_case_id, sum(amount) as received_amount
      from tenant_deposit_receipts
      group by move_case_id
    ),
    deduction_totals as (
      select
        move_case_id,
        sum(amount) filter (where deduction_type = 'DAMAGE' and voided_at is null) as damage_amount,
        sum(amount) filter (where deduction_type = 'PENALTY' and voided_at is null) as penalty_amount
      from tenant_deposit_deductions
      group by move_case_id
    ),
    case_rows as (
      select
        tmc.id,
        tmc.flat_resident_id,
        tmc.tenant_user_id,
        u.full_name as tenant_name,
        u.mobile_number as tenant_mobile_number,
        tmc.flat_id,
        concat(b.name, ' ', f.flat_number) as flat_label,
        tmc.status,
        tmc.move_in_date,
        tmc.expected_move_out_date,
        tmc.actual_move_out_date,
        tmc.expected_deposit_amount,
        coalesce(rt.received_amount, 0) as received_amount,
        coalesce(dt.damage_amount, 0) as damage_amount,
        coalesce(dt.penalty_amount, 0) as penalty_amount,
        coalesce(tds.refund_amount, 0) as refunded_amount,
        coalesce(tds.received_amount, 0) as settled_received_amount,
        tds.settlement_date,
        je.voucher_number as settlement_voucher_number,
        tmc.notes,
        tmc.created_at,
        tmc.updated_at
      from tenant_move_cases tmc
      join users u on u.id = tmc.tenant_user_id
      join flats f on f.id = tmc.flat_id
      join blocks b on b.id = f.block_id
      left join receipt_totals rt on rt.move_case_id = tmc.id
      left join deduction_totals dt on dt.move_case_id = tmc.id
      left join tenant_deposit_settlements tds on tds.move_case_id = tmc.id
      left join journal_entries je
        on je.tenant_deposit_settlement_id = tds.id and je.status = 'POSTED'
      where tmc.society_id = $1
        and ($2 = '' or tmc.status = $2)
        and (
          $3 = ''
          or u.full_name ilike $3
          or u.mobile_number ilike $3
          or f.flat_number ilike $3
          or b.name ilike $3
        )
    )
  `

  const params = [authMe.user.societyId, query.status, searchPattern]
  const [itemsResult, summaryResult] = await Promise.all([
    pool.query<Record<string, string | null>>(
      `
        ${baseCte}
        select
          id,
          flat_resident_id as "flatResidentId",
          tenant_user_id as "tenantUserId",
          tenant_name as "tenantName",
          tenant_mobile_number as "tenantMobileNumber",
          flat_id as "flatId",
          flat_label as "flatLabel",
          status,
          move_in_date::text as "moveInDate",
          expected_move_out_date::text as "expectedMoveOutDate",
          actual_move_out_date::text as "actualMoveOutDate",
          expected_deposit_amount::text as "expectedDepositAmount",
          received_amount::text as "receivedAmount",
          damage_amount::text as "damageDeductionAmount",
          penalty_amount::text as "penaltyDeductionAmount",
          refunded_amount::text as "refundedAmount",
          greatest(received_amount - settled_received_amount, 0)::text as "heldAmount",
          greatest(received_amount - damage_amount - penalty_amount - refunded_amount, 0)::text as "refundableAmount",
          settlement_date::text as "settlementDate",
          settlement_voucher_number as "settlementVoucherNumber",
          notes,
          created_at::text as "createdAt",
          updated_at::text as "updatedAt"
        from case_rows
        order by
          case when status = 'REFUND_PENDING' then 0 when status = 'OCCUPIED' then 1 else 2 end,
          move_in_date desc,
          created_at desc
        limit $4 offset $5
      `,
      [...params, query.pageSize, offset],
    ),
    pool.query<Record<string, string>>(
      `
        ${baseCte}
        select
          count(*)::text as "totalCases",
          count(*) filter (where status = 'OCCUPIED')::text as "occupiedCases",
          count(*) filter (where status = 'REFUND_PENDING')::text as "pendingRefundCases",
          count(*) filter (where status = 'CLOSED')::text as "closedCases",
          coalesce(sum(greatest(received_amount - settled_received_amount, 0)), 0)::text as "totalHeld",
          coalesce(sum(received_amount), 0)::text as "totalReceived",
          coalesce(sum(damage_amount + penalty_amount), 0)::text as "totalDeductions",
          coalesce(sum(refunded_amount), 0)::text as "totalRefunded"
        from case_rows
      `,
      params,
    ),
  ])

  const mapMoney = (value: string | null | undefined) => Number(value ?? 0)
  const items = itemsResult.rows.map((row) => ({
    ...row,
    expectedDepositAmount: mapMoney(row.expectedDepositAmount),
    receivedAmount: mapMoney(row.receivedAmount),
    damageDeductionAmount: mapMoney(row.damageDeductionAmount),
    penaltyDeductionAmount: mapMoney(row.penaltyDeductionAmount),
    refundedAmount: mapMoney(row.refundedAmount),
    heldAmount: mapMoney(row.heldAmount),
    refundableAmount: mapMoney(row.refundableAmount),
  }))
  const summary = summaryResult.rows[0]

  return createApiSuccess(event, {
    items,
    total: Number(summary?.totalCases ?? 0),
    page: query.page,
    pageSize: query.pageSize,
    summary: {
      totalCases: Number(summary?.totalCases ?? 0),
      occupiedCases: Number(summary?.occupiedCases ?? 0),
      pendingRefundCases: Number(summary?.pendingRefundCases ?? 0),
      closedCases: Number(summary?.closedCases ?? 0),
      totalHeld: Number(summary?.totalHeld ?? 0),
      totalReceived: Number(summary?.totalReceived ?? 0),
      totalDeductions: Number(summary?.totalDeductions ?? 0),
      totalRefunded: Number(summary?.totalRefunded ?? 0),
    },
  })
})
