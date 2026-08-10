import { z } from 'zod'
import { createApiSuccess } from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'

const idSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'finance.view')
  const id = idSchema.parse(String(event.context.params?.id ?? ''))
  const pool = getDatabasePool()

  const moveCaseResult = await pool.query<Record<string, string | null>>(
    `
      with receipt_totals as (
        select move_case_id, coalesce(sum(amount), 0) as received_amount
        from tenant_deposit_receipts
        where move_case_id = $1
        group by move_case_id
      ),
      deduction_totals as (
        select
          move_case_id,
          coalesce(sum(amount) filter (where deduction_type = 'DAMAGE' and voided_at is null), 0) as damage_amount,
          coalesce(sum(amount) filter (where deduction_type = 'PENALTY' and voided_at is null), 0) as penalty_amount
        from tenant_deposit_deductions
        where move_case_id = $1
        group by move_case_id
      )
      select
        tmc.id,
        tmc.flat_resident_id as "flatResidentId",
        tmc.tenant_user_id as "tenantUserId",
        u.full_name as "tenantName",
        u.email::text as "tenantEmail",
        u.mobile_number as "tenantMobileNumber",
        tmc.flat_id as "flatId",
        concat(b.name, ' ', f.flat_number) as "flatLabel",
        tmc.status,
        tmc.move_in_date::text as "moveInDate",
        tmc.expected_move_out_date::text as "expectedMoveOutDate",
        tmc.actual_move_out_date::text as "actualMoveOutDate",
        tmc.expected_deposit_amount::text as "expectedDepositAmount",
        coalesce(rt.received_amount, 0)::text as "receivedAmount",
        coalesce(dt.damage_amount, 0)::text as "damageDeductionAmount",
        coalesce(dt.penalty_amount, 0)::text as "penaltyDeductionAmount",
        coalesce(tds.refund_amount, 0)::text as "refundedAmount",
        case
          when tds.id is null then coalesce(rt.received_amount, 0)
          else greatest(coalesce(rt.received_amount, 0) - tds.received_amount, 0)
        end::text as "heldAmount",
        greatest(
          coalesce(rt.received_amount, 0)
          - coalesce(dt.damage_amount, 0)
          - coalesce(dt.penalty_amount, 0),
          0
        )::text as "refundableAmount",
        tmc.notes,
        tmc.closed_at::text as "closedAt",
        tmc.created_at::text as "createdAt",
        tmc.updated_at::text as "updatedAt"
      from tenant_move_cases tmc
      join users u on u.id = tmc.tenant_user_id
      join flats f on f.id = tmc.flat_id
      join blocks b on b.id = f.block_id
      left join receipt_totals rt on rt.move_case_id = tmc.id
      left join deduction_totals dt on dt.move_case_id = tmc.id
      left join tenant_deposit_settlements tds on tds.move_case_id = tmc.id
      where tmc.id = $1 and tmc.society_id = $2
      limit 1
    `,
    [id, authMe.user.societyId],
  )
  const moveCase = moveCaseResult.rows[0]
  if (!moveCase) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Tenant move record was not found.',
    })
  }

  const [
    receiptsResult,
    inspectionResult,
    deductionsResult,
    settlementResult,
    attachmentsResult,
  ] = await Promise.all([
    pool.query<Record<string, string | null>>(
      `
          select
            tdr.id,
            tdr.receipt_date::text as "receiptDate",
            tdr.receipt_number as "receiptNumber",
            tdr.amount::text,
            tdr.mode,
            tdr.reference_number as "referenceNumber",
            tdr.notes,
            sba.account_name as "bankAccountName",
            je.id as "journalId",
            je.voucher_number as "voucherNumber",
            tdr.created_at::text as "createdAt"
          from tenant_deposit_receipts tdr
          join society_bank_accounts sba on sba.id = tdr.bank_account_id
          left join journal_entries je
            on je.tenant_deposit_receipt_id = tdr.id and je.status = 'POSTED'
          where tdr.move_case_id = $1 and tdr.society_id = $2
          order by tdr.receipt_date, tdr.created_at
        `,
      [id, authMe.user.societyId],
    ),
    pool.query<Record<string, unknown>>(
      `
          select
            tmi.id,
            tmi.inspection_date::text as "inspectionDate",
            tmi.condition_rating as "conditionRating",
            tmi.condition_summary as "conditionSummary",
            tmi.checklist,
            u.full_name as "inspectedByName",
            tmi.updated_at::text as "updatedAt"
          from tenant_move_inspections tmi
          left join users u on u.id = tmi.inspected_by_user_id
          where tmi.move_case_id = $1 and tmi.society_id = $2
          limit 1
        `,
      [id, authMe.user.societyId],
    ),
    pool.query<Record<string, string>>(
      `
          select
            id,
            deduction_type as "deductionType",
            amount::text,
            description,
            created_at::text as "createdAt"
          from tenant_deposit_deductions
          where move_case_id = $1 and society_id = $2 and voided_at is null
          order by created_at, id
        `,
      [id, authMe.user.societyId],
    ),
    pool.query<Record<string, string | null>>(
      `
          select
            tds.id,
            tds.settlement_date::text as "settlementDate",
            tds.received_amount::text as "receivedAmount",
            tds.damage_deduction_amount::text as "damageDeductionAmount",
            tds.penalty_deduction_amount::text as "penaltyDeductionAmount",
            tds.refund_amount::text as "refundAmount",
            tds.refund_mode as "refundMode",
            tds.reference_number as "referenceNumber",
            tds.notes,
            sba.account_name as "bankAccountName",
            approver.full_name as "approvedByName",
            je.id as "journalId",
            je.voucher_number as "voucherNumber",
            tds.income_transaction_id as "incomeTransactionId",
            tds.created_at::text as "createdAt"
          from tenant_deposit_settlements tds
          left join society_bank_accounts sba on sba.id = tds.bank_account_id
          left join users approver on approver.id = tds.approved_by_user_id
          left join journal_entries je
            on je.tenant_deposit_settlement_id = tds.id and je.status = 'POSTED'
          where tds.move_case_id = $1 and tds.society_id = $2
          limit 1
        `,
      [id, authMe.user.societyId],
    ),
    pool.query<Record<string, string | null>>(
      `
          select
            id,
            attachment_type as "attachmentType",
            file_name as "fileName",
            mime_type as "mimeType",
            size_bytes::text as "sizeBytes",
            created_at::text as "createdAt"
          from tenant_move_attachments
          where move_case_id = $1 and society_id = $2
          order by created_at desc
        `,
      [id, authMe.user.societyId],
    ),
  ])

  const moneyKeys = [
    'expectedDepositAmount',
    'receivedAmount',
    'damageDeductionAmount',
    'penaltyDeductionAmount',
    'refundedAmount',
    'heldAmount',
    'refundableAmount',
  ]
  const mappedCase: Record<string, unknown> = { ...moveCase }
  for (const key of moneyKeys) mappedCase[key] = Number(moveCase[key] ?? 0)

  const settlement = settlementResult.rows[0]
  return createApiSuccess(event, {
    ...mappedCase,
    receipts: receiptsResult.rows.map((row) => ({
      ...row,
      amount: Number(row.amount ?? 0),
    })),
    inspection: inspectionResult.rows[0] ?? null,
    deductions: deductionsResult.rows.map((row) => ({
      ...row,
      amount: Number(row.amount),
    })),
    settlement: settlement
      ? {
          ...settlement,
          receivedAmount: Number(settlement.receivedAmount ?? 0),
          damageDeductionAmount: Number(settlement.damageDeductionAmount ?? 0),
          penaltyDeductionAmount: Number(
            settlement.penaltyDeductionAmount ?? 0,
          ),
          refundAmount: Number(settlement.refundAmount ?? 0),
        }
      : null,
    attachments: attachmentsResult.rows.map((row) => ({
      ...row,
      sizeBytes: Number(row.sizeBytes ?? 0),
      downloadUrl: `/api/admin/finance/tenant-moves/${id}/attachments/${row.id}/download`,
    })),
  })
})
