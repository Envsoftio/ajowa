import { z } from 'zod'
import type { PoolClient } from 'pg'
import { AppError } from './errors'
import { getValidatedRuntimeConfig } from './env'
import { nextJournalVoucherNumber } from './finance'
import { recomputeUserAccessForActiveBillingPeriods } from './qr-access'
import {
  calculateTenantDepositSettlementAmounts,
  roundTenantMoney,
} from '~/shared/tenant-deposit'

export { roundTenantMoney } from '~/shared/tenant-deposit'

export const tenantMoveStatuses = [
  'OCCUPIED',
  'MOVE_OUT_REQUESTED',
  'REFUND_PENDING',
  'CLOSED',
  'CANCELLED',
] as const

export const tenantDepositPaymentModes = [
  'CASH',
  'BANK_TRANSFER',
  'UPI',
  'CHEQUE',
  'CARD',
  'OTHER',
] as const

export const tenantDeductionTypes = ['DAMAGE', 'PENALTY'] as const
export const tenantMoveAttachmentTypes = [
  'MOVE_IN',
  'INSPECTION',
  'DAMAGE',
  'REFUND',
] as const

const nullableText = (max: number) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value ?? null
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }, z.string().max(max).nullable())

export const tenantMoveCreateSchema = z.object({
  flatResidentId: z.string().uuid(),
  moveInDate: z.string().date(),
  expectedMoveOutDate: z.string().date().nullable().optional(),
  expectedDepositAmount: z.coerce.number().min(0).max(99_999_999.99),
  notes: nullableText(1000).optional(),
})

export const tenantDepositReceiptSchema = z.object({
  receiptDate: z.string().date(),
  amount: z.coerce.number().positive().max(99_999_999.99),
  bankAccountId: z.string().uuid(),
  mode: z.enum(tenantDepositPaymentModes),
  referenceNumber: nullableText(160).optional(),
  notes: nullableText(1000).optional(),
})

const tenantDeductionSchema = z.object({
  id: z.string().uuid().optional(),
  deductionType: z.enum(tenantDeductionTypes),
  amount: z.coerce.number().positive().max(99_999_999.99),
  description: z.string().trim().min(3).max(500),
})

export const tenantMoveInspectionSchema = z.object({
  actualMoveOutDate: z.string().date(),
  inspectionDate: z.string().date(),
  conditionRating: z.enum(['GOOD', 'DAMAGE_FOUND']),
  conditionSummary: z.string().trim().min(3).max(2000),
  checklist: z.record(z.string(), z.boolean()).default({}),
  deductions: z.array(tenantDeductionSchema).max(50).default([]),
})

export const tenantDepositSettlementSchema = z.object({
  settlementDate: z.string().date(),
  bankAccountId: z.string().uuid().nullable().optional(),
  refundMode: z.enum(tenantDepositPaymentModes).nullable().optional(),
  referenceNumber: nullableText(160).optional(),
  notes: nullableText(1000).optional(),
})

export const tenantMoveAttachmentTypeSchema = z.enum(tenantMoveAttachmentTypes)

export type TenantMoveCreateInput = z.infer<typeof tenantMoveCreateSchema>
export type TenantDepositReceiptInput = z.infer<
  typeof tenantDepositReceiptSchema
>
export type TenantMoveInspectionInput = z.infer<
  typeof tenantMoveInspectionSchema
>
export type TenantDepositSettlementInput = z.infer<
  typeof tenantDepositSettlementSchema
>

export const calculateTenantDepositSettlement = (input: {
  receivedAmount: number
  deductions: Array<{
    deductionType: (typeof tenantDeductionTypes)[number]
    amount: number
  }>
}) => {
  try {
    return calculateTenantDepositSettlementAmounts(input)
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: error.message,
    })
  }
}

type LockedMoveCase = {
  id: string
  society_id: string
  flat_resident_id: string
  tenant_user_id: string
  flat_id: string
  status: (typeof tenantMoveStatuses)[number]
  move_in_date: string
  actual_move_out_date: string | null
  tenant_name: string
  flat_label: string
}

const lockMoveCase = async (
  client: PoolClient,
  societyId: string,
  moveCaseId: string,
) => {
  const result = await client.query<LockedMoveCase>(
    `
      select
        tmc.id,
        tmc.society_id,
        tmc.flat_resident_id,
        tmc.tenant_user_id,
        tmc.flat_id,
        tmc.status,
        tmc.move_in_date::text,
        tmc.actual_move_out_date::text,
        u.full_name as tenant_name,
        concat(b.name, ' ', f.flat_number) as flat_label
      from tenant_move_cases tmc
      join users u on u.id = tmc.tenant_user_id
      join flats f on f.id = tmc.flat_id
      join blocks b on b.id = f.block_id
      where tmc.id = $1 and tmc.society_id = $2
      for update of tmc
    `,
    [moveCaseId, societyId],
  )
  const moveCase = result.rows[0]

  if (!moveCase) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Tenant move record was not found.',
    })
  }

  return moveCase
}

const assertMoveCaseOpen = (moveCase: LockedMoveCase) => {
  if (moveCase.status === 'CLOSED' || moveCase.status === 'CANCELLED') {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'Closed or cancelled tenant move records cannot be changed.',
    })
  }
}

const assertFinancialDateOpen = async (
  client: PoolClient,
  societyId: string,
  date: string,
) => {
  const result = await client.query<{ id: string }>(
    `
      select id
      from financial_period_close
      where society_id = $1
        and is_reopened = false
        and $2::date between start_date and end_date
      limit 1
    `,
    [societyId, date],
  )

  if (result.rows[0]) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'The selected date belongs to a closed financial period.',
    })
  }
}

const referenceRequiredModes = new Set([
  'BANK_TRANSFER',
  'UPI',
  'CHEQUE',
  'CARD',
])

const assertReferenceAvailable = async (
  client: PoolClient,
  societyId: string,
  referenceNumber: string | null | undefined,
) => {
  if (!referenceNumber) return

  const result = await client.query<{ source: string }>(
    `
      select source
      from (
        select 'maintenance payment' as source
        from payments
        where society_id = $1
          and (
            lower(coalesce(utr_reference, '')) = lower($2)
            or lower(coalesce(bank_reference, '')) = lower($2)
            or lower(coalesce(gateway_payment_id, '')) = lower($2)
          )
        union all
        select 'expense payment' as source
        from expense_payments
        where society_id = $1 and lower(coalesce(reference_number, '')) = lower($2)
        union all
        select 'tenant deposit receipt' as source
        from tenant_deposit_receipts
        where society_id = $1 and lower(coalesce(reference_number, '')) = lower($2)
        union all
        select 'tenant deposit refund' as source
        from tenant_deposit_settlements
        where society_id = $1 and lower(coalesce(reference_number, '')) = lower($2)
      ) references_in_use
      limit 1
    `,
    [societyId, referenceNumber],
  )

  if (result.rows[0]) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: `This payment reference is already used by another ${result.rows[0].source}.`,
    })
  }
}

const getBankAccountHead = async (
  client: PoolClient,
  societyId: string,
  bankAccountId: string,
) => {
  const result = await client.query<{ account_head_id: string }>(
    `
      select account_head_id
      from society_bank_accounts
      where id = $1 and society_id = $2 and is_active = true
      limit 1
    `,
    [bankAccountId, societyId],
  )
  const accountHeadId = result.rows[0]?.account_head_id

  if (!accountHeadId) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Select an active bank or cash account.',
    })
  }

  return accountHeadId
}

const getRequiredAccountHeads = async (
  client: PoolClient,
  societyId: string,
) => {
  const result = await client.query<{ code: string; id: string }>(
    `
      select code, id
      from account_heads
      where (society_id = $1 or society_id is null)
        and code in ('LIAB-TEN-DEP', 'INC-TEN-DED')
        and is_active = true
    `,
    [societyId],
  )
  const depositLiabilityHeadId = result.rows.find(
    (row) => row.code === 'LIAB-TEN-DEP',
  )?.id
  const deductionIncomeHeadId = result.rows.find(
    (row) => row.code === 'INC-TEN-DED',
  )?.id

  if (!depositLiabilityHeadId || !deductionIncomeHeadId) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Tenant deposit finance heads are not configured.',
    })
  }

  return { depositLiabilityHeadId, deductionIncomeHeadId }
}

const nextDepositReceiptNumber = async (
  client: PoolClient,
  receiptDate: string,
) => {
  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())
  const year = Number(receiptDate.slice(0, 4))
  const sequence = await client.query<{ value: string }>(
    `select next_yearly_sequence('RECEIPT', $1)::text as value`,
    [year],
  )
  return `${runtimeConfig.societyCode}-${year}-${String(sequence.rows[0]?.value ?? '1').padStart(6, '0')}`
}

export const createTenantMoveCase = async (
  client: PoolClient,
  input: TenantMoveCreateInput & {
    societyId: string
    actorUserId: string
  },
) => {
  if (
    input.expectedMoveOutDate &&
    input.expectedMoveOutDate < input.moveInDate
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Expected move-out date cannot be before move-in date.',
    })
  }

  const relationshipResult = await client.query<{
    user_id: string
    flat_id: string
    relationship_type: string
    is_active: boolean
  }>(
    `
      select fr.user_id, fr.flat_id, fr.relationship_type::text, fr.is_active
      from flat_residents fr
      join users u on u.id = fr.user_id
      join flats f on f.id = fr.flat_id
      where fr.id = $1
        and u.society_id = $2
        and f.society_id = $2
      for update of fr
    `,
    [input.flatResidentId, input.societyId],
  )
  const relationship = relationshipResult.rows[0]

  if (!relationship || relationship.relationship_type !== 'TENANT') {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Select a valid tenant relationship.',
    })
  }
  if (!relationship.is_active) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message:
        'Move-in can only be recorded for an active tenant relationship.',
    })
  }

  const result = await client.query<{ id: string }>(
    `
      insert into tenant_move_cases (
        society_id,
        flat_resident_id,
        tenant_user_id,
        flat_id,
        status,
        move_in_date,
        expected_move_out_date,
        expected_deposit_amount,
        notes,
        created_by_user_id
      )
      values ($1, $2, $3, $4, 'OCCUPIED', $5, $6, $7, $8, $9)
      returning id
    `,
    [
      input.societyId,
      input.flatResidentId,
      relationship.user_id,
      relationship.flat_id,
      input.moveInDate,
      input.expectedMoveOutDate ?? null,
      roundTenantMoney(input.expectedDepositAmount),
      input.notes ?? null,
      input.actorUserId,
    ],
  )
  const id = result.rows[0]?.id
  if (!id) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: 'Tenant move-in record could not be created.',
    })
  }

  await client.query(
    `
      update flat_residents
      set occupancy_status = 'TENANTED', updated_at = now()
      where id = $1
    `,
    [input.flatResidentId],
  )
  await client.query(
    `update flats set occupancy_status = 'TENANTED', updated_at = now() where id = $1`,
    [relationship.flat_id],
  )

  return { id }
}

export const recordTenantDepositReceipt = async (
  client: PoolClient,
  input: TenantDepositReceiptInput & {
    moveCaseId: string
    societyId: string
    actorUserId: string
  },
) => {
  const moveCase = await lockMoveCase(client, input.societyId, input.moveCaseId)
  assertMoveCaseOpen(moveCase)

  if (input.receiptDate < moveCase.move_in_date) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Deposit receipt date cannot be before the move-in date.',
    })
  }
  if (referenceRequiredModes.has(input.mode) && !input.referenceNumber) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'A payment reference is required for the selected payment mode.',
    })
  }

  await assertFinancialDateOpen(client, input.societyId, input.receiptDate)
  await assertReferenceAvailable(client, input.societyId, input.referenceNumber)
  const bankAccountHeadId = await getBankAccountHead(
    client,
    input.societyId,
    input.bankAccountId,
  )
  const { depositLiabilityHeadId } = await getRequiredAccountHeads(
    client,
    input.societyId,
  )
  const amount = roundTenantMoney(input.amount)
  const receiptNumber = await nextDepositReceiptNumber(
    client,
    input.receiptDate,
  )

  const receiptResult = await client.query<{ id: string }>(
    `
      insert into tenant_deposit_receipts (
        society_id,
        move_case_id,
        bank_account_id,
        receipt_date,
        receipt_number,
        amount,
        mode,
        reference_number,
        notes,
        created_by_user_id
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      returning id
    `,
    [
      input.societyId,
      input.moveCaseId,
      input.bankAccountId,
      input.receiptDate,
      receiptNumber,
      amount,
      input.mode,
      input.referenceNumber ?? null,
      input.notes ?? null,
      input.actorUserId,
    ],
  )
  const receiptId = receiptResult.rows[0]?.id
  if (!receiptId) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: 'Tenant deposit receipt could not be created.',
    })
  }

  const voucherNumber = await nextJournalVoucherNumber(
    client,
    input.receiptDate,
  )
  const journalResult = await client.query<{ id: string }>(
    `
      insert into journal_entries (
        society_id,
        voucher_number,
        tenant_deposit_receipt_id,
        entry_date,
        description,
        status,
        posted_by_user_id,
        posted_at
      )
      values ($1, $2, $3, $4, $5, 'DRAFT', $6, now())
      returning id
    `,
    [
      input.societyId,
      voucherNumber,
      receiptId,
      input.receiptDate,
      `Tenant security deposit received from ${moveCase.tenant_name} for ${moveCase.flat_label}`,
      input.actorUserId,
    ],
  )
  const journalId = journalResult.rows[0]?.id
  if (!journalId) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: 'Tenant deposit journal could not be created.',
    })
  }

  await client.query(
    `
      insert into journal_lines (
        journal_entry_id,
        line_no,
        account_head_id,
        line_type,
        amount,
        description
      )
      values
        ($1, 1, $2, 'DEBIT', $4, 'Tenant security deposit received'),
        ($1, 2, $3, 'CREDIT', $4, 'Tenant security deposit liability')
    `,
    [journalId, bankAccountHeadId, depositLiabilityHeadId, amount],
  )
  await client.query(
    `update journal_entries set status = 'POSTED', updated_at = now() where id = $1`,
    [journalId],
  )

  return { receiptId, receiptNumber, journalId, voucherNumber, amount }
}

export const recordTenantMoveOutInspection = async (
  client: PoolClient,
  input: TenantMoveInspectionInput & {
    moveCaseId: string
    societyId: string
    actorUserId: string
  },
) => {
  const moveCase = await lockMoveCase(client, input.societyId, input.moveCaseId)
  assertMoveCaseOpen(moveCase)

  if (input.actualMoveOutDate < moveCase.move_in_date) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Move-out date cannot be before the move-in date.',
    })
  }
  const currentDate = new Date().toISOString().slice(0, 10)
  if (input.actualMoveOutDate > currentDate) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Actual move-out date cannot be in the future.',
    })
  }
  if (input.inspectionDate < input.actualMoveOutDate) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Inspection date cannot be before the actual move-out date.',
    })
  }
  if (input.conditionRating === 'GOOD' && input.deductions.length > 0) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        'A good-condition inspection cannot include damage or penalty deductions.',
    })
  }

  const settled = await client.query<{ id: string }>(
    `select id from tenant_deposit_settlements where move_case_id = $1 limit 1`,
    [input.moveCaseId],
  )
  if (settled.rows[0]) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'A settled move-out inspection cannot be changed.',
    })
  }

  const inspectionResult = await client.query<{ id: string }>(
    `
      insert into tenant_move_inspections (
        society_id,
        move_case_id,
        inspection_date,
        condition_rating,
        condition_summary,
        checklist,
        inspected_by_user_id
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, $7)
      on conflict (move_case_id) do update
      set
        inspection_date = excluded.inspection_date,
        condition_rating = excluded.condition_rating,
        condition_summary = excluded.condition_summary,
        checklist = excluded.checklist,
        inspected_by_user_id = excluded.inspected_by_user_id,
        updated_at = now()
      returning id
    `,
    [
      input.societyId,
      input.moveCaseId,
      input.inspectionDate,
      input.conditionRating,
      input.conditionSummary,
      JSON.stringify(input.checklist),
      input.actorUserId,
    ],
  )
  const inspectionId = inspectionResult.rows[0]?.id
  if (!inspectionId) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: 'Move-out inspection could not be saved.',
    })
  }

  const existingResult = await client.query<{ id: string }>(
    `
      select id
      from tenant_deposit_deductions
      where move_case_id = $1 and voided_at is null
      order by id
      for update
    `,
    [input.moveCaseId],
  )
  const existingIds = new Set(existingResult.rows.map((row) => row.id))
  const incomingIds = new Set(
    input.deductions.flatMap((deduction) =>
      deduction.id ? [deduction.id] : [],
    ),
  )

  for (const deduction of input.deductions) {
    if (deduction.id) {
      if (!existingIds.has(deduction.id)) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message:
            'One of the selected deductions does not belong to this move record.',
        })
      }
      await client.query(
        `
          update tenant_deposit_deductions
          set
            deduction_type = $2,
            amount = $3,
            description = $4,
            updated_at = now()
          where id = $1 and move_case_id = $5 and voided_at is null
        `,
        [
          deduction.id,
          deduction.deductionType,
          roundTenantMoney(deduction.amount),
          deduction.description,
          input.moveCaseId,
        ],
      )
    } else {
      await client.query(
        `
          insert into tenant_deposit_deductions (
            society_id,
            move_case_id,
            inspection_id,
            deduction_type,
            amount,
            description,
            created_by_user_id
          )
          values ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          input.societyId,
          input.moveCaseId,
          inspectionId,
          deduction.deductionType,
          roundTenantMoney(deduction.amount),
          deduction.description,
          input.actorUserId,
        ],
      )
    }
  }

  const removedIds = [...existingIds].filter((id) => !incomingIds.has(id))
  if (removedIds.length > 0) {
    await client.query(
      `
        update tenant_deposit_deductions
        set voided_at = now(), voided_by_user_id = $2, updated_at = now()
        where id = any($1::uuid[]) and move_case_id = $3 and voided_at is null
      `,
      [removedIds, input.actorUserId, input.moveCaseId],
    )
  }

  await client.query(
    `
      update tenant_move_cases
      set
        actual_move_out_date = $2,
        status = 'REFUND_PENDING',
        updated_at = now()
      where id = $1
    `,
    [input.moveCaseId, input.actualMoveOutDate],
  )
  await client.query(
    `
      update flat_residents
      set
        is_active = false,
        can_login = false,
        occupancy_status = 'VACANT',
        ended_at = coalesce(ended_at, now()),
        updated_at = now()
      where id = $1
    `,
    [moveCase.flat_resident_id],
  )
  await client.query(
    `
      update flats target
      set
        occupancy_status = case
          when exists (
            select 1
            from flat_residents active_tenant
            where active_tenant.flat_id = target.id
              and active_tenant.is_active = true
              and active_tenant.relationship_type = 'TENANT'
          ) then 'TENANTED'::occupancy_status
          when exists (
            select 1
            from flat_residents active_owner
            where active_owner.flat_id = target.id
              and active_owner.is_active = true
              and active_owner.occupancy_status = 'SELF_OCCUPIED'
          ) then 'SELF_OCCUPIED'::occupancy_status
          else 'VACANT'::occupancy_status
        end,
        updated_at = now()
      where target.id = $1
    `,
    [moveCase.flat_id],
  )
  await recomputeUserAccessForActiveBillingPeriods(client, input.societyId, [
    moveCase.tenant_user_id,
  ])

  return { inspectionId }
}

export const settleTenantMoveCase = async (
  client: PoolClient,
  input: TenantDepositSettlementInput & {
    moveCaseId: string
    societyId: string
    actorUserId: string
  },
) => {
  const moveCase = await lockMoveCase(client, input.societyId, input.moveCaseId)
  assertMoveCaseOpen(moveCase)

  if (!moveCase.actual_move_out_date || moveCase.status !== 'REFUND_PENDING') {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'Complete the move-out inspection before settling the deposit.',
    })
  }
  if (input.settlementDate < moveCase.actual_move_out_date) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Settlement date cannot be before the move-out date.',
    })
  }

  await assertFinancialDateOpen(client, input.societyId, input.settlementDate)

  const existingSettlement = await client.query<{ id: string }>(
    `select id from tenant_deposit_settlements where move_case_id = $1 limit 1`,
    [input.moveCaseId],
  )
  if (existingSettlement.rows[0]) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'This tenant deposit has already been settled.',
    })
  }

  const receiptResult = await client.query<{ amount: string }>(
    `
      select amount::text
      from tenant_deposit_receipts
      where move_case_id = $1
      order by id
      for update
    `,
    [input.moveCaseId],
  )
  const deductionResult = await client.query<{
    deduction_type: (typeof tenantDeductionTypes)[number]
    amount: string
  }>(
    `
      select deduction_type, amount::text
      from tenant_deposit_deductions
      where move_case_id = $1 and voided_at is null
      order by id
      for update
    `,
    [input.moveCaseId],
  )
  const settlement = calculateTenantDepositSettlement({
    receivedAmount: receiptResult.rows.reduce(
      (sum, row) => sum + Number(row.amount),
      0,
    ),
    deductions: deductionResult.rows.map((row) => ({
      deductionType: row.deduction_type,
      amount: Number(row.amount),
    })),
  })

  if (settlement.totalDeductionAmount > 0) {
    const evidence = await client.query<{ id: string }>(
      `
        select id
        from tenant_move_attachments
        where move_case_id = $1 and attachment_type in ('INSPECTION', 'DAMAGE')
        limit 1
      `,
      [input.moveCaseId],
    )
    if (!evidence.rows[0]) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message:
          'Upload inspection or damage evidence before deducting from the deposit.',
      })
    }
  }

  if (
    settlement.refundAmount > 0 &&
    (!input.bankAccountId || !input.refundMode)
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Select the refund account and payment mode.',
    })
  }
  if (
    settlement.refundAmount > 0 &&
    input.refundMode &&
    referenceRequiredModes.has(input.refundMode) &&
    !input.referenceNumber
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'A refund reference is required for the selected payment mode.',
    })
  }

  await assertReferenceAvailable(
    client,
    input.societyId,
    settlement.refundAmount > 0 ? input.referenceNumber : null,
  )
  const bankAccountHeadId =
    settlement.refundAmount > 0 && input.bankAccountId
      ? await getBankAccountHead(client, input.societyId, input.bankAccountId)
      : null
  const { depositLiabilityHeadId, deductionIncomeHeadId } =
    await getRequiredAccountHeads(client, input.societyId)

  let incomeTransactionId: string | null = null
  if (settlement.totalDeductionAmount > 0) {
    const categoryResult = await client.query<{ id: string }>(
      `
        select id
        from transaction_categories
        where code = 'INC-TEN-DED-001'
          and (society_id = $1 or society_id is null)
          and is_active = true
        limit 1
      `,
      [input.societyId],
    )
    const categoryId = categoryResult.rows[0]?.id
    if (!categoryId) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Tenant deposit deduction category is not configured.',
      })
    }

    const transactionResult = await client.query<{ id: string }>(
      `
        insert into transactions (
          society_id,
          transaction_type,
          category_id,
          bank_account_id,
          title,
          description,
          counterparty_name,
          transaction_date,
          amount,
          status,
          created_by_user_id,
          approved_by_user_id,
          approved_at,
          posted_at
        )
        values (
          $1,
          'INCOME',
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          'POSTED',
          $9,
          $9,
          now(),
          now()
        )
        returning id
      `,
      [
        input.societyId,
        categoryId,
        null,
        `Tenant deposit deductions - ${moveCase.flat_label}`,
        `Move-out settlement for ${moveCase.tenant_name}`,
        moveCase.tenant_name,
        input.settlementDate,
        settlement.totalDeductionAmount,
        input.actorUserId,
      ],
    )
    incomeTransactionId = transactionResult.rows[0]?.id ?? null
    if (!incomeTransactionId) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Tenant deduction income record could not be created.',
      })
    }
  }

  const settlementResult = await client.query<{ id: string }>(
    `
      insert into tenant_deposit_settlements (
        society_id,
        move_case_id,
        bank_account_id,
        income_transaction_id,
        settlement_date,
        received_amount,
        damage_deduction_amount,
        penalty_deduction_amount,
        refund_amount,
        refund_mode,
        reference_number,
        notes,
        approved_by_user_id
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      returning id
    `,
    [
      input.societyId,
      input.moveCaseId,
      settlement.refundAmount > 0 ? input.bankAccountId : null,
      incomeTransactionId,
      input.settlementDate,
      settlement.receivedAmount,
      settlement.damageDeductionAmount,
      settlement.penaltyDeductionAmount,
      settlement.refundAmount,
      settlement.refundAmount > 0 ? input.refundMode : null,
      settlement.refundAmount > 0 ? (input.referenceNumber ?? null) : null,
      input.notes ?? null,
      input.actorUserId,
    ],
  )
  const settlementId = settlementResult.rows[0]?.id
  if (!settlementId) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: 'Tenant deposit settlement could not be created.',
    })
  }

  let journalId: string | null = null
  let voucherNumber: string | null = null
  if (settlement.receivedAmount > 0) {
    voucherNumber = await nextJournalVoucherNumber(client, input.settlementDate)
    const journalResult = await client.query<{ id: string }>(
      `
        insert into journal_entries (
          society_id,
          voucher_number,
          transaction_id,
          tenant_deposit_settlement_id,
          entry_date,
          description,
          status,
          posted_by_user_id,
          posted_at
        )
        values ($1, $2, $3, $4, $5, $6, 'DRAFT', $7, now())
        returning id
      `,
      [
        input.societyId,
        voucherNumber,
        incomeTransactionId,
        settlementId,
        input.settlementDate,
        `Tenant security deposit settlement for ${moveCase.tenant_name}, ${moveCase.flat_label}`,
        input.actorUserId,
      ],
    )
    journalId = journalResult.rows[0]?.id ?? null
    if (!journalId) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Tenant settlement journal could not be created.',
      })
    }

    let lineNo = 1
    await client.query(
      `
        insert into journal_lines (
          journal_entry_id,
          line_no,
          account_head_id,
          line_type,
          amount,
          description
        )
        values ($1, $2, $3, 'DEBIT', $4, 'Release tenant security deposit liability')
      `,
      [journalId, lineNo++, depositLiabilityHeadId, settlement.receivedAmount],
    )
    if (settlement.totalDeductionAmount > 0) {
      await client.query(
        `
          insert into journal_lines (
            journal_entry_id,
            line_no,
            account_head_id,
            line_type,
            amount,
            description
          )
          values ($1, $2, $3, 'CREDIT', $4, 'Approved tenant deposit deductions')
        `,
        [
          journalId,
          lineNo++,
          deductionIncomeHeadId,
          settlement.totalDeductionAmount,
        ],
      )
    }
    if (settlement.refundAmount > 0) {
      await client.query(
        `
          insert into journal_lines (
            journal_entry_id,
            line_no,
            account_head_id,
            line_type,
            amount,
            description
          )
          values ($1, $2, $3, 'CREDIT', $4, 'Tenant security deposit refunded')
        `,
        [journalId, lineNo, bankAccountHeadId, settlement.refundAmount],
      )
    }
    await client.query(
      `update journal_entries set status = 'POSTED', updated_at = now() where id = $1`,
      [journalId],
    )
  }

  await client.query(
    `
      update tenant_move_cases
      set
        status = 'CLOSED',
        closed_by_user_id = $2,
        closed_at = now(),
        updated_at = now()
      where id = $1
    `,
    [input.moveCaseId, input.actorUserId],
  )
  await client.query(
    `
      update flat_residents
      set
        is_active = false,
        can_login = false,
        occupancy_status = 'VACANT',
        ended_at = coalesce(ended_at, now()),
        updated_at = now()
      where id = $1
    `,
    [moveCase.flat_resident_id],
  )
  await client.query(
    `
      update flats target
      set
        occupancy_status = case
          when exists (
            select 1
            from flat_residents active_tenant
            where active_tenant.flat_id = target.id
              and active_tenant.is_active = true
              and active_tenant.relationship_type = 'TENANT'
          ) then 'TENANTED'::occupancy_status
          when exists (
            select 1
            from flat_residents active_owner
            where active_owner.flat_id = target.id
              and active_owner.is_active = true
              and active_owner.occupancy_status = 'SELF_OCCUPIED'
          ) then 'SELF_OCCUPIED'::occupancy_status
          else 'VACANT'::occupancy_status
        end,
        updated_at = now()
      where target.id = $1
    `,
    [moveCase.flat_id],
  )

  await recomputeUserAccessForActiveBillingPeriods(client, input.societyId, [
    moveCase.tenant_user_id,
  ])

  return {
    settlementId,
    journalId,
    voucherNumber,
    incomeTransactionId,
    ...settlement,
  }
}
