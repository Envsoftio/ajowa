import { createHmac } from 'node:crypto'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { AppError } from './errors'
import { getDatabasePool, queryRows } from './database'
import { computeDueAmounts, todayDate } from './billing'
import { getValidatedRuntimeConfig } from './env'
import {
  enqueueNotificationForUsers,
  resolveNotificationAudience,
} from './notifications'
import { createPdfBuffer, getSocietyStampImage } from './pdf'
import { recomputeUserAccess } from './qr-access'
import { uploadPrivateFile } from './storage'
import { setCamAdvanceCoverageForPeriod } from './cam-advance'

export const allocationModeSchema = z.enum([
  'OLDEST_UNPAID_FIRST',
  'SELECTED_PERIODS',
  'TENURE_PACK',
])

export const paymentModeSchema = z.enum([
  'CASH',
  'BANK_TRANSFER',
  'UPI',
  'CHEQUE',
  'ONLINE_GATEWAY',
  'ADVANCE_CREDIT',
])

export const manualPaymentSchema = z.object({
  flatId: z.string().uuid(),
  payerUserId: z.string().uuid().optional(),
  amount: z.coerce.number().positive(),
  paymentDate: z.string().date(),
  mode: paymentModeSchema.exclude(['ONLINE_GATEWAY', 'ADVANCE_CREDIT']),
  transferKind: z.enum(['NEFT', 'IMPS', 'RTGS', 'BANK_TRANSFER']).optional(),
  allocationMode: allocationModeSchema.default('OLDEST_UNPAID_FIRST'),
  selectedDueIds: z.array(z.string().uuid()).optional().default([]),
  tenureMonths: z.coerce.number().int().positive().max(24).optional(),
  utrReference: z.string().trim().max(120).optional(),
  bankReference: z.string().trim().max(120).optional(),
  chequeNumber: z.string().trim().max(120).optional(),
  chequeDate: z.string().date().optional(),
  bankName: z.string().trim().max(160).optional(),
  account: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(1000).optional(),
  proofFilePath: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().max(160).optional(),
  allowDuplicateUtr: z.boolean().optional().default(false),
  overrideReason: z.string().trim().max(500).optional(),
})

export const paymentPreviewSchema = z.object({
  flatId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  allocationMode: allocationModeSchema.default('OLDEST_UNPAID_FIRST'),
  selectedDueIds: z.array(z.string().uuid()).optional().default([]),
  tenureMonths: z.coerce.number().int().positive().max(24).optional(),
})

export const paymentAmountUpdateSchema = z.object({
  amount: z.coerce.number().positive(),
})

const optionalNullableText = (max: number) =>
  z.preprocess(
    (value) => (value === '' ? null : value),
    z.string().trim().max(max).nullable().optional(),
  )

export const paymentUpdateSchema = z.object({
  flatId: z.string().uuid().optional(),
  payerUserId: z.string().uuid().optional(),
  amount: z.coerce.number().positive().optional(),
  paymentDate: z.string().date().optional(),
  mode: paymentModeSchema.exclude(['ONLINE_GATEWAY', 'ADVANCE_CREDIT']).optional(),
  transferKind: z.enum(['NEFT', 'IMPS', 'RTGS', 'BANK_TRANSFER']).nullable().optional(),
  allocationMode: allocationModeSchema.optional(),
  selectedDueIds: z.array(z.string().uuid()).optional(),
  tenureMonths: z.coerce.number().int().positive().max(24).nullable().optional(),
  utrReference: optionalNullableText(120),
  bankReference: optionalNullableText(120),
  chequeNumber: optionalNullableText(120),
  chequeDate: z.preprocess(
    (value) => (value === '' ? null : value),
    z.string().date().nullable().optional(),
  ),
  bankName: optionalNullableText(160),
  account: optionalNullableText(160),
  notes: optionalNullableText(1000),
  allowDuplicateUtr: z.boolean().optional().default(false),
  overrideReason: optionalNullableText(500),
}).refine(
  (value) =>
    Object.entries(value).some(([key, fieldValue]) => {
      if (key === 'allowDuplicateUtr') return false
      if (Array.isArray(fieldValue)) return true
      return fieldValue !== undefined
    }),
  { message: 'Change at least one payment field before saving.' },
)

export type PaymentPreviewInput = z.output<typeof paymentPreviewSchema>
export type PaymentUpdateInput = z.output<typeof paymentUpdateSchema>

type DueRow = {
  id: string
  society_id: string
  billing_period_id: string
  billing_period_label: string
  flat_id: string
  due_date: string
  base_amount: string
  late_fee_amount: string
  waived_amount: string
  paid_amount: string
  total_amount: string
  balance_amount: string
  status: string
}

type PaymentRow = {
  id: string
  society_id: string
  payer_user_id: string
  received_for_flat_id: string
  amount: string
  payment_date: string
  status: string
  allocation_mode: string
}

export type PaymentAllocationInput = PaymentPreviewInput & {
  asOfDate?: string
}

type PaymentReceiptRow = {
  id: string
  society_id: string
  payer_user_id: string
  received_for_flat_id: string
  amount: string
  payment_date: string
  mode: string
  transfer_kind: string | null
  status: string
  utr_reference: string | null
  bank_reference: string | null
  receipt_number: string | null
  receipt_file_path: string | null
  receipt_generated_at: string | null
  notes: string | null
  payer_name: string | null
  payer_email: string | null
  payer_mobile_number: string | null
  flat_number: string | null
  block_name: string | null
  society_name: string
  society_code: string
  society_address: string
}

type PaymentNotificationRow = {
  id: string
  society_id: string
  payer_user_id: string | null
  received_for_flat_id: string
  amount: string
  receipt_number: string | null
  flat_number: string | null
  block_name: string | null
}

type PaymentReceiptAllocationRow = {
  due_id: string
  billing_period_label: string | null
  due_date: string | null
  due_amount: string
  late_fee_component: string
  allocated_amount: string
  remaining_balance: string
  allocation_order: number
}

type PaymentAmountEditAllocationLine = {
  dueId: string
  billingPeriodId: string
  billingPeriodLabel: string
  dueAmount: number
  lateFeeComponent: number
  allocatedAmount: number
  remainingBalance: number
  allocationOrder: number
}

const roundMoney = (value: number) => Math.round(value * 100) / 100

const formatReceiptMoney = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value)

const formatReceiptDate = (value: string | null | undefined) =>
  value
    ? new Date(
        value.length === 10 ? `${value}T00:00:00` : value,
      ).toLocaleDateString('en-IN', {
        dateStyle: 'medium',
      })
    : '-'

const getPaymentCreditedBalance = (due: DueRow) => {
  const principalAmount = Math.max(
    0,
    roundMoney(Number(due.base_amount) - Number(due.waived_amount)),
  )

  return Math.max(
    0,
    roundMoney(principalAmount - Number(due.paid_amount)),
  )
}

const buildAllocationLineAmounts = (
  due: DueRow,
  allocatedAmount: number,
  asOfDate: string,
  graceDays: number,
  lateFeePerDay: number,
) => {
  const computed = computeDueAmounts(
    {
      dueDate: due.due_date,
      baseAmount: Number(due.base_amount),
      paidAmount: roundMoney(Number(due.paid_amount) + allocatedAmount),
      waivedAmount: Number(due.waived_amount),
      storedStatus: due.status,
    },
    asOfDate,
    graceDays,
    lateFeePerDay,
  )

  return {
    dueAmount: computed.totalAmount,
    lateFeeComponent: computed.lateFeeAmount,
    remainingBalance: computed.balanceAmount,
  }
}

const syncFlatCamAdvancePaidUntil = async (
  client: PoolClient,
  dueId: string,
  status: string,
) => {
  const result = await client.query<{
    society_id: string
    flat_id: string
    start_date: string
    end_date: string
    charge_type: string
  }>(
    `
      select
        md.society_id,
        md.flat_id,
        bp.start_date::text,
        bp.end_date::text,
        bp.charge_type::text
      from maintenance_dues md
      inner join billing_periods bp on bp.id = md.billing_period_id
      where md.id = $1
      limit 1
    `,
    [dueId],
  )
  const row = result.rows[0]
  if (!row || row.charge_type !== 'CAM') return

  await setCamAdvanceCoverageForPeriod(client, {
    societyId: row.society_id,
    flatId: row.flat_id,
    coveredFrom: row.start_date,
    coveredUntil: status === 'PAID' ? row.end_date : null,
    source: 'PAYMENT',
    reference: `maintenance_due:${dueId}`,
    notes:
      status === 'PAID'
        ? `Auto-marked from paid CAM bill through ${formatReceiptDate(row.end_date)}.`
        : null,
    actorUserId: null,
  })
}

const getPaymentPolicy = async (client: PoolClient, societyId: string) => {
  const result = await client.query<{ settings: Record<string, unknown> }>(
    `select settings from society_profile where id = $1 limit 1`,
    [societyId],
  )
  const settings = result.rows[0]?.settings ?? {}

  return {
    excessPaymentHandling: String(
      settings.excessPaymentHandling ?? 'KEEP_AS_ADVANCE',
    ),
    graceDays: Number(settings.graceDays ?? 0),
    lateFeePerDay: Number(settings.lateFeePerDay ?? 0),
  }
}

const selectAllocatableDues = async (
  client: PoolClient,
  input: {
    flatId: string
    mode: z.infer<typeof allocationModeSchema>
    selectedDueIds?: string[]
    tenureMonths?: number
    graceDays: number
    lateFeePerDay: number
    asOfDate?: string
    lockRows?: boolean
  },
) => {
  const params: unknown[] = [input.flatId]
  const filters = [
    `md.flat_id = $1`,
    `md.status not in ('PAID', 'WAIVED', 'CANCELLED')`,
  ]

  if (input.mode === 'SELECTED_PERIODS') {
    if (!input.selectedDueIds?.length) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message:
          'Select at least one billing period for selected-period allocation.',
      })
    }
    params.push(input.selectedDueIds)
    filters.push(`md.id = any($${params.length}::uuid[])`)
  }

  const limitClause =
    input.mode === 'TENURE_PACK' && input.tenureMonths
      ? `limit ${Number(input.tenureMonths)}`
      : ''

  const result = await client.query<DueRow>(
    `
      select
        md.id,
        md.society_id,
        md.billing_period_id,
        bp.label as billing_period_label,
        md.flat_id,
        md.due_date::text,
        md.base_amount::text,
        md.late_fee_amount::text,
        md.waived_amount::text,
        md.paid_amount::text,
        md.total_amount::text,
        md.balance_amount::text,
        md.status
      from maintenance_dues md
      inner join billing_periods bp on bp.id = md.billing_period_id
      where ${filters.join(' and ')}
      order by bp.start_date asc, md.due_date asc, md.created_at asc
      ${limitClause}
      ${input.lockRows ? 'for update of md' : ''}
    `,
    params,
  )

  const asOfDate = input.asOfDate ?? todayDate()

  return result.rows.map((due) => {
    const computed = computeDueAmounts(
      {
        dueDate: due.due_date,
        baseAmount: Number(due.base_amount),
        paidAmount: Number(due.paid_amount),
        waivedAmount: Number(due.waived_amount),
        storedStatus: due.status,
      },
      asOfDate,
      input.graceDays,
      input.lateFeePerDay,
    )

    return {
      ...due,
      computedTotal: computed.totalAmount,
      computedLateFee: computed.lateFeeAmount,
      computedBalance: computed.balanceAmount,
      computedStatus: computed.status,
    }
  })
}

const previewPaymentAllocationWithClient = async (
  client: PoolClient,
  input: PaymentAllocationInput,
) => {
  const societyResult = await client.query<{ society_id: string }>(
    `select society_id from flats where id = $1 limit 1`,
    [input.flatId],
  )
  const societyId = societyResult.rows[0]?.society_id
  if (!societyId) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Flat not found.',
    })
  }

  const policy = await getPaymentPolicy(client, societyId)
  const dueInput: Parameters<typeof selectAllocatableDues>[1] = {
    flatId: input.flatId,
    mode: input.allocationMode,
    selectedDueIds: input.selectedDueIds,
    graceDays: policy.graceDays,
    lateFeePerDay: policy.lateFeePerDay,
  }
  if (input.asOfDate !== undefined) {
    dueInput.asOfDate = input.asOfDate
  }
  if (input.tenureMonths !== undefined) {
    dueInput.tenureMonths = input.tenureMonths
  }
  const dues = await selectAllocatableDues(client, dueInput)

  let remainingPayment = input.amount
  const asOfDate = input.asOfDate ?? todayDate()
  const lines = dues
    .map((due, index) => {
      const allocatedAmount = roundMoney(
        Math.min(remainingPayment, getPaymentCreditedBalance(due)),
      )
      remainingPayment = roundMoney(remainingPayment - allocatedAmount)
      const allocationAmounts = buildAllocationLineAmounts(
        due,
        allocatedAmount,
        asOfDate,
        policy.graceDays,
        policy.lateFeePerDay,
      )
      return {
        dueId: due.id,
        billingPeriodId: due.billing_period_id,
        billingPeriodLabel: due.billing_period_label,
        dueAmount: allocationAmounts.dueAmount,
        lateFeeComponent: allocationAmounts.lateFeeComponent,
        allocatedAmount,
        remainingBalance: allocationAmounts.remainingBalance,
        allocationOrder: index + 1,
      }
    })
    .filter((line) => line.allocatedAmount > 0)

  return {
    lines,
    totalDue: roundMoney(
      dues.reduce((sum, due) => sum + getPaymentCreditedBalance(due), 0),
    ),
    allocatedAmount: roundMoney(
      lines.reduce((sum, line) => sum + line.allocatedAmount, 0),
    ),
    advanceAmount: roundMoney(Math.max(0, remainingPayment)),
    policy: policy.excessPaymentHandling,
  }
}

export const previewPaymentAllocation = async (input: PaymentAllocationInput) => {
  const client = await getDatabasePool().connect()

  try {
    return await previewPaymentAllocationWithClient(client, input)
  } finally {
    client.release()
  }
}

const refreshDueTotals = async (
  client: PoolClient,
  dueId: string,
  graceDays: number,
  lateFeePerDay: number,
  asOfDate = todayDate(),
) => {
  const dueResult = await client.query<DueRow>(
    `
      select
        md.id,
        md.society_id,
        md.billing_period_id,
        bp.label as billing_period_label,
        md.flat_id,
        md.due_date::text,
        md.base_amount::text,
        md.late_fee_amount::text,
        md.waived_amount::text,
        md.paid_amount::text,
        md.total_amount::text,
        md.balance_amount::text,
        md.status
      from maintenance_dues md
      inner join billing_periods bp on bp.id = md.billing_period_id
      where md.id = $1
      for update of md
    `,
    [dueId],
  )
  const due = dueResult.rows[0]
  if (!due) return null

  const paidResult = await client.query<{ paid_amount: string }>(
    `
      select coalesce(sum(allocated_amount), 0)::text as paid_amount
      from payment_allocations
      where maintenance_due_id = $1
    `,
    [dueId],
  )
  const paidAmount = Number(paidResult.rows[0]?.paid_amount ?? 0)
  const computed = computeDueAmounts(
    {
      dueDate: due.due_date,
      baseAmount: Number(due.base_amount),
      paidAmount,
      waivedAmount: Number(due.waived_amount),
      storedStatus: due.status,
    },
    asOfDate,
    graceDays,
    lateFeePerDay,
  )

  await client.query(
    `
      update maintenance_dues
      set
        late_fee_amount = $2,
        paid_amount = $3,
        total_amount = $4,
        balance_amount = $5,
        status = $6
      where id = $1
    `,
    [
      dueId,
      computed.lateFeeAmount,
      paidAmount,
      computed.totalAmount,
      computed.balanceAmount,
      computed.status,
    ],
  )

  await syncFlatCamAdvancePaidUntil(client, dueId, computed.status)

  return {
    dueId,
    billingPeriodId: due.billing_period_id,
    flatId: due.flat_id,
    status: computed.status,
    balanceAmount: computed.balanceAmount,
  }
}

const recomputeAccessForAffectedDues = async (
  client: PoolClient,
  affected: { billingPeriodId: string; flatId?: string }[],
) => {
  for (const item of affected) {
    if (!item.flatId) continue
    const users = await client.query<{ user_id: string }>(
      `
        select distinct user_id
        from flat_residents
        where flat_id = $1 and is_active = true
      `,
      [item.flatId],
    )

    for (const user of users.rows) {
      await recomputeUserAccess(user.user_id, item.billingPeriodId, client)
    }
  }
}

export const allocateMaintenancePaymentWithClient = async (
  client: PoolClient,
  paymentId: string,
) => {
  const paymentResult = await client.query<PaymentRow>(
    `
        select
          id,
          society_id,
          payer_user_id,
          received_for_flat_id,
          amount::text,
          payment_date::text,
          status,
          allocation_mode
        from payments
        where id = $1
        for update
      `,
    [paymentId],
  )
  const payment = paymentResult.rows[0]
  if (!payment) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Payment not found.',
    })
  }

  const existing = await client.query<{ count: string }>(
    `select count(*)::text from payment_allocations where payment_id = $1`,
    [paymentId],
  )
  if (Number(existing.rows[0]?.count ?? 0) > 0) {
    return { paymentId, idempotent: true, affectedPeriods: [] }
  }

  if (payment.status !== 'VERIFIED') {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'Payment allocation runs only after verification.',
    })
  }

  const snapshotResult = await client.query<{
    allocation_snapshot: Record<string, unknown>
  }>(`select allocation_snapshot from payments where id = $1`, [paymentId])
  const snapshot = snapshotResult.rows[0]?.allocation_snapshot ?? {}
  const policy = await getPaymentPolicy(client, payment.society_id)
  const preview = await previewPaymentAllocationWithClient(client, {
    flatId: payment.received_for_flat_id,
    amount: Number(payment.amount),
    allocationMode: allocationModeSchema.parse(payment.allocation_mode),
    asOfDate: payment.payment_date,
    selectedDueIds: Array.isArray(snapshot.selectedDueIds)
      ? (snapshot.selectedDueIds as string[])
      : [],
    tenureMonths:
      typeof snapshot.tenureMonths === 'number'
        ? snapshot.tenureMonths
        : undefined,
  })

  if (
    preview.advanceAmount > 0 &&
    policy.excessPaymentHandling !== 'KEEP_AS_ADVANCE'
  ) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message:
        'Payment exceeds the selected dues and the society policy does not allow advance credit.',
    })
  }

  const affected = []
  for (const line of preview.lines) {
    const insertResult = await client.query<{ id: string }>(
      `
          insert into payment_allocations (
            payment_id,
            maintenance_due_id,
            allocated_amount,
            due_amount,
            late_fee_component,
            remaining_balance,
            allocation_order
          )
          values ($1, $2, $3, $4, $5, $6, $7)
          on conflict (payment_id, maintenance_due_id) do nothing
          returning id
        `,
      [
        paymentId,
        line.dueId,
        line.allocatedAmount,
        line.dueAmount,
        line.lateFeeComponent,
        line.remainingBalance,
        line.allocationOrder,
      ],
    )
    if (insertResult.rows[0]) {
      const refreshed = await refreshDueTotals(
        client,
        line.dueId,
        policy.graceDays,
        policy.lateFeePerDay,
        payment.payment_date,
      )
      if (refreshed) affected.push(refreshed)
    }
  }

  if (preview.advanceAmount > 0) {
    const creditResult = await client.query<{ id: string }>(
      `
          insert into resident_advance_credits (
            society_id,
            user_id,
            flat_id,
            source_payment_id,
            original_amount,
            current_balance,
            notes
          )
          values ($1, $2, $3, $4, $5, $5, $6)
          returning id
        `,
      [
        payment.society_id,
        payment.payer_user_id,
        payment.received_for_flat_id,
        paymentId,
        preview.advanceAmount,
        'Excess payment retained as advance credit.',
      ],
    )
    await client.query(
      `
          insert into resident_advance_credit_history (credit_id, action, amount, payment_id, notes)
          values ($1, 'CREATED', $2, $3, $4)
        `,
      [
        creditResult.rows[0]?.id,
        preview.advanceAmount,
        paymentId,
        'Created during payment allocation.',
      ],
    )
  }

  await recomputeAccessForAffectedDues(client, affected)

  return {
    paymentId,
    idempotent: false,
    affectedPeriods: affected,
    advanceAmount: preview.advanceAmount,
  }
}

const staffEditablePaymentModes = new Set(['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE'])
const referenceRequiredPaymentModes = new Set(['BANK_TRANSFER', 'UPI'])

const getSnapshotSelectedDueIds = (
  snapshot: Record<string, unknown>,
  fallbackDueIds: string[],
) =>
  Array.isArray(snapshot.selectedDueIds) &&
  snapshot.selectedDueIds.every((dueId) => typeof dueId === 'string')
    ? (snapshot.selectedDueIds as string[])
    : fallbackDueIds

const getSnapshotTenureMonths = (snapshot: Record<string, unknown>) =>
  typeof snapshot.tenureMonths === 'number' ? snapshot.tenureMonths : undefined

const getSnapshotText = (snapshot: Record<string, unknown>, key: string) => {
  const value = snapshot[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const getSnapshotCheque = (snapshot: Record<string, unknown>) => {
  const cheque = z.object({
    chequeNumber: z.string().optional(),
    chequeDate: z.string().optional(),
    bankName: z.string().optional(),
  }).passthrough().safeParse(snapshot.cheque)

  return cheque.success ? cheque.data : {}
}

const normalizeNullableText = (value: string | null | undefined) => {
  if (value === undefined) return undefined
  const trimmed = value?.trim() ?? ''
  return trimmed ? trimmed : null
}

const pickUpdatedValue = <T>(value: T | undefined, fallback: T) =>
  value === undefined ? fallback : value

const sameStringArray = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

const getSubmittedReferenceValues = (input: {
  utrReference?: string | null | undefined
  bankReference?: string | null | undefined
}) => [
  ...new Set(
    [input.utrReference, input.bankReference]
      .map((reference) => reference?.trim().toLowerCase())
      .filter((reference): reference is string => Boolean(reference)),
  ),
]

export const updatePaymentWithClient = async (
  client: PoolClient,
  input: {
    paymentId: string
    societyId: string
    actorUserId: string
    changes: PaymentUpdateInput
  },
) => {
  const paymentResult = await client.query<PaymentRow & {
    mode: string
    transfer_kind: string | null
    utr_reference: string | null
    bank_reference: string | null
    is_default_utr: boolean
    receipt_number: string | null
    receipt_file_path: string | null
    notes: string | null
    allocation_snapshot: Record<string, unknown> | null
  }>(
    `
      select
        id,
        society_id,
        payer_user_id,
        received_for_flat_id,
        amount::text,
        payment_date::text,
        status,
        allocation_mode,
        mode::text,
        transfer_kind,
        utr_reference,
        bank_reference,
        is_default_utr,
        receipt_number,
        receipt_file_path,
        notes,
        allocation_snapshot
      from payments
      where id = $1 and society_id = $2
      for update
    `,
    [input.paymentId, input.societyId],
  )
  const payment = paymentResult.rows[0]
  if (!payment) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Payment not found.',
    })
  }

  if (!staffEditablePaymentModes.has(payment.mode)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Only manually recorded payments can be edited.',
    })
  }

  if (!['PENDING', 'VERIFIED'].includes(payment.status)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Only pending or verified payments can be edited.',
    })
  }

  const snapshot = payment.allocation_snapshot ?? {}
  const existingAllocations = await client.query<{
    id: string
    maintenance_due_id: string
    allocation_order: number
  }>(
    `
      select id, maintenance_due_id, allocation_order
      from payment_allocations
      where payment_id = $1
      order by allocation_order asc, created_at asc
      for update
    `,
    [payment.id],
  )
  const allocationIds = existingAllocations.rows.map((allocation) => allocation.id)
  const existingDueIds = [
    ...new Set(
      existingAllocations.rows.map((allocation) => allocation.maintenance_due_id),
    ),
  ]

  const previousAmount = roundMoney(Number(payment.amount))
  const nextAmount = roundMoney(input.changes.amount ?? previousAmount)
  if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Payment amount must be greater than zero.',
    })
  }

  const nextPaymentDate = input.changes.paymentDate ?? payment.payment_date
  const nextFlatId = input.changes.flatId ?? payment.received_for_flat_id
  if (!nextFlatId) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Select the flat this payment was received for.',
    })
  }

  const flatResult = await client.query<{
    id: string
    default_payer_user_id: string | null
  }>(
    `
      select
        f.id,
        (
          select fr.user_id
          from flat_residents fr
          where fr.flat_id = f.id
            and fr.is_active = true
            and fr.is_billing_contact = true
          order by fr.created_at asc
          limit 1
        ) as default_payer_user_id
      from flats f
      where f.id = $1 and f.society_id = $2
      limit 1
    `,
    [nextFlatId, payment.society_id],
  )
  const flat = flatResult.rows[0]
  if (!flat) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Flat not found.',
    })
  }

  const nextPayerUserId =
    input.changes.payerUserId ??
    (nextFlatId === payment.received_for_flat_id
      ? payment.payer_user_id
      : flat.default_payer_user_id)

  if (!nextPayerUserId) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Select a payer for this payment.',
    })
  }

  if (
    nextFlatId !== payment.received_for_flat_id ||
    nextPayerUserId !== payment.payer_user_id
  ) {
    const payerAccess = await client.query<{ id: string }>(
      `
        select id
        from flat_residents
        where flat_id = $1
          and user_id = $2
          and is_active = true
        limit 1
      `,
      [nextFlatId, nextPayerUserId],
    )
    if (!payerAccess.rows[0]) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Select an active payer linked to the selected flat.',
      })
    }
  }

  const nextMode = input.changes.mode ?? payment.mode
  const nextTransferKind =
    nextMode === 'BANK_TRANSFER'
      ? input.changes.transferKind === undefined
        ? payment.transfer_kind
        : input.changes.transferKind
      : null
  const inputUtrReference = normalizeNullableText(input.changes.utrReference)
  const inputBankReference = normalizeNullableText(input.changes.bankReference)
  const nextUtrReference = referenceRequiredPaymentModes.has(nextMode)
    ? pickUpdatedValue(inputUtrReference, payment.utr_reference)
    : null
  const nextBankReference = referenceRequiredPaymentModes.has(nextMode)
    ? pickUpdatedValue(inputBankReference, payment.bank_reference)
    : null
  const detailValidationRequested = [
    input.changes.mode,
    input.changes.transferKind,
    input.changes.utrReference,
    input.changes.bankReference,
    input.changes.chequeNumber,
    input.changes.chequeDate,
    input.changes.bankName,
  ].some((value) => value !== undefined)

  if (
    detailValidationRequested &&
    referenceRequiredPaymentModes.has(nextMode) &&
    !nextUtrReference &&
    !nextBankReference
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'UTR or bank reference is required for transfer payments.',
    })
  }

  if (detailValidationRequested && nextMode === 'BANK_TRANSFER' && !nextTransferKind) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        'Select NEFT, IMPS, RTGS, or bank transfer for bank-transfer payments.',
    })
  }

  const existingCheque = getSnapshotCheque(snapshot)
  const inputChequeNumber = normalizeNullableText(input.changes.chequeNumber)
  const inputChequeDate = input.changes.chequeDate === undefined
    ? undefined
    : input.changes.chequeDate
  const inputChequeBankName = normalizeNullableText(input.changes.bankName)
  const nextChequeNumber = nextMode === 'CHEQUE'
    ? pickUpdatedValue(inputChequeNumber, existingCheque.chequeNumber ?? null)
    : null
  const nextChequeDate = nextMode === 'CHEQUE'
    ? pickUpdatedValue(inputChequeDate, existingCheque.chequeDate ?? null)
    : null
  const nextChequeBankName = nextMode === 'CHEQUE'
    ? pickUpdatedValue(inputChequeBankName, existingCheque.bankName ?? null)
    : null

  if (
    detailValidationRequested &&
    nextMode === 'CHEQUE' &&
    (!nextChequeNumber || !nextChequeDate || !nextChequeBankName)
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        'Cheque number, cheque date, and bank name are required for cheque payments.',
    })
  }

  const existingAccount = getSnapshotText(snapshot, 'account')
  const inputAccount = normalizeNullableText(input.changes.account)
  const nextAccount = pickUpdatedValue(inputAccount, existingAccount)
  const accountChanged = nextAccount !== existingAccount
  let bankAccountId: string | null = null
  if (nextAccount) {
    const accountIdResult = z.string().uuid().safeParse(nextAccount)
    if (!accountIdResult.success) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Select a valid deposit account for this payment.',
      })
    }
    bankAccountId = accountIdResult.data
    const accountResult = await client.query<{ id: string }>(
      `
        select id
        from society_bank_accounts
        where id = $1
          and society_id = $2
          and is_active = true
        limit 1
      `,
      [bankAccountId, payment.society_id],
    )
    if (!accountResult.rows[0]) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Select an active deposit account for this payment.',
      })
    }
  }

  const inputOverrideReason = normalizeNullableText(input.changes.overrideReason)
  const nextOverrideReason = pickUpdatedValue(
    inputOverrideReason,
    getSnapshotText(snapshot, 'overrideReason'),
  )
  const referenceValues = getSubmittedReferenceValues({
    utrReference: nextUtrReference,
    bankReference: nextBankReference,
  })
  const referencesChanged =
    nextUtrReference !== payment.utr_reference ||
    nextBankReference !== payment.bank_reference
  if (referencesChanged && referenceValues.length > 0) {
    if (input.changes.allowDuplicateUtr && !nextOverrideReason) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message:
          'An audit reason is required to allow duplicate reference usage.',
      })
    }

    const duplicate = await client.query<{ id: string }>(
      `
        select id
        from payments
        where society_id = $1
          and id <> $2
          and (
            lower(coalesce(utr_reference, '')) = any($3::text[])
            or lower(coalesce(bank_reference, '')) = any($3::text[])
            or lower(coalesce(gateway_payment_id, '')) = any($3::text[])
          )
        limit 1
      `,
      [payment.society_id, payment.id, referenceValues],
    )
    if (duplicate.rows[0] && !input.changes.allowDuplicateUtr) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'This UTR/reference is already linked to another payment.',
      })
    }
  }

  const previousAllocationMode = allocationModeSchema.parse(payment.allocation_mode)
  const nextAllocationMode = input.changes.allocationMode ?? previousAllocationMode
  const previousSelectedDueIds = getSnapshotSelectedDueIds(snapshot, existingDueIds)
  const nextSelectedDueIds = nextAllocationMode === 'SELECTED_PERIODS'
    ? input.changes.selectedDueIds ?? previousSelectedDueIds
    : []
  const previousTenureMonths = getSnapshotTenureMonths(snapshot)
  const nextTenureMonths = nextAllocationMode === 'TENURE_PACK'
    ? input.changes.tenureMonths === undefined
      ? previousTenureMonths
      : input.changes.tenureMonths ?? undefined
    : undefined

  if (nextAllocationMode === 'SELECTED_PERIODS' && nextSelectedDueIds.length === 0) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        'Select at least one billing period for selected-period allocation.',
    })
  }

  const amountChanged = previousAmount !== nextAmount
  const paymentDateChanged = payment.payment_date !== nextPaymentDate
  const flatChanged = payment.received_for_flat_id !== nextFlatId
  const payerChanged = payment.payer_user_id !== nextPayerUserId
  const modeChanged = payment.mode !== nextMode
  const transferKindChanged = payment.transfer_kind !== nextTransferKind
  const notesInput = normalizeNullableText(input.changes.notes)
  const nextNotes = pickUpdatedValue(notesInput, payment.notes)
  const notesChanged = payment.notes !== nextNotes
  const allocationModeChanged = previousAllocationMode !== nextAllocationMode
  const selectedDueIdsChanged = nextAllocationMode === 'SELECTED_PERIODS' &&
    !sameStringArray(nextSelectedDueIds, previousSelectedDueIds)
  const tenureMonthsChanged = nextAllocationMode === 'TENURE_PACK' &&
    nextTenureMonths !== previousTenureMonths
  const allocationAffectingChanged =
    amountChanged ||
    paymentDateChanged ||
    flatChanged ||
    allocationModeChanged ||
    selectedDueIdsChanged ||
    tenureMonthsChanged
  const reallocatePayment =
    payment.status === 'VERIFIED' && allocationAffectingChanged
  const changed =
    allocationAffectingChanged ||
    payerChanged ||
    modeChanged ||
    transferKindChanged ||
    referencesChanged ||
    accountChanged ||
    notesChanged ||
    (nextMode === 'CHEQUE' &&
      (
        nextChequeNumber !== (existingCheque.chequeNumber ?? null) ||
        nextChequeDate !== (existingCheque.chequeDate ?? null) ||
        nextChequeBankName !== (existingCheque.bankName ?? null)
      )) ||
    (nextMode !== 'CHEQUE' && Boolean(snapshot.cheque))

  const beforeState = {
    flatId: payment.received_for_flat_id,
    payerUserId: payment.payer_user_id,
    amount: previousAmount,
    paymentDate: payment.payment_date,
    mode: payment.mode,
    transferKind: payment.transfer_kind,
    utrReference: payment.utr_reference,
    bankReference: payment.bank_reference,
    allocationMode: previousAllocationMode,
    selectedDueIds: previousSelectedDueIds,
    tenureMonths: previousTenureMonths ?? null,
    cheque: existingCheque,
    account: existingAccount,
    notes: payment.notes,
  }
  const afterState = {
    flatId: nextFlatId,
    payerUserId: nextPayerUserId,
    amount: nextAmount,
    paymentDate: nextPaymentDate,
    mode: nextMode,
    transferKind: nextTransferKind,
    utrReference: nextUtrReference,
    bankReference: nextBankReference,
    allocationMode: nextAllocationMode,
    selectedDueIds: nextSelectedDueIds,
    tenureMonths: nextTenureMonths ?? null,
    cheque: nextMode === 'CHEQUE'
      ? {
          chequeNumber: nextChequeNumber,
          chequeDate: nextChequeDate,
          bankName: nextChequeBankName,
        }
      : null,
    account: nextAccount,
    notes: nextNotes,
  }

  if (!changed) {
    return {
      paymentId: payment.id,
      previousAmount,
      amount: nextAmount,
      allocatedAmount: null,
      advanceAmount: null,
      receiptInvalidated: false,
      changed: false,
      beforeState,
      afterState,
      bankAccountId: null,
    }
  }

  const policy = await getPaymentPolicy(client, payment.society_id)
  const affected: Array<{ billingPeriodId: string; flatId?: string }> = []
  let preview: {
    lines: PaymentAmountEditAllocationLine[]
    totalDue: number
    allocatedAmount: number
    advanceAmount: number
    policy: string
  } | null = null

  if (reallocatePayment && allocationIds.length > 0) {
    const referencedAllocations = await client.query<{ count: string }>(
      `
        select count(*)::text as count
        from resident_advance_credit_history
        where payment_allocation_id = any($1::uuid[])
      `,
      [allocationIds],
    )
    if (Number(referencedAllocations.rows[0]?.count ?? 0) > 0) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message:
          'This payment allocation is already referenced by advance-credit history and cannot be edited automatically.',
      })
    }
  }

  if (reallocatePayment || payerChanged || flatChanged) {
    const sourceCredits = await client.query<{
      id: string
      original_amount: string
      current_balance: string
      status: string
    }>(
      `
        select id, original_amount::text, current_balance::text, status::text
        from resident_advance_credits
        where source_payment_id = $1
        for update
      `,
      [payment.id],
    )
    const consumedCredit = sourceCredits.rows.find(
      (credit) =>
        credit.status !== 'ACTIVE' ||
        roundMoney(Number(credit.current_balance)) !==
          roundMoney(Number(credit.original_amount)),
    )
    if (consumedCredit) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message:
          'The advance credit created from this payment has already been used. Reverse the dependent credit before editing this payment.',
      })
    }

    const sourceCreditIds = sourceCredits.rows.map((credit) => credit.id)
    if (reallocatePayment && sourceCreditIds.length > 0) {
      await client.query(
        `
          delete from resident_advance_credit_history
          where credit_id = any($1::uuid[])
        `,
        [sourceCreditIds],
      )
      await client.query(
        `
          delete from resident_advance_credits
          where id = any($1::uuid[])
        `,
        [sourceCreditIds],
      )
    } else if (payerChanged && sourceCreditIds.length > 0) {
      await client.query(
        `
          update resident_advance_credits
          set user_id = $2,
              updated_at = now()
          where id = any($1::uuid[])
        `,
        [sourceCreditIds, nextPayerUserId],
      )
    }
  }

  if (reallocatePayment) {
    await client.query(`delete from payment_allocations where payment_id = $1`, [
      payment.id,
    ])

    for (const dueId of existingDueIds) {
      const refreshed = await refreshDueTotals(
        client,
        dueId,
        policy.graceDays,
        policy.lateFeePerDay,
      )
      if (refreshed) affected.push(refreshed)
    }

    const previewInput: PaymentAllocationInput = {
      flatId: nextFlatId,
      amount: nextAmount,
      allocationMode: nextAllocationMode,
      selectedDueIds: nextAllocationMode === 'SELECTED_PERIODS'
        ? nextSelectedDueIds
        : [],
      asOfDate: nextPaymentDate,
    }
    if (nextAllocationMode === 'TENURE_PACK' && nextTenureMonths !== undefined) {
      previewInput.tenureMonths = nextTenureMonths
    }
    const nextPreview = await previewPaymentAllocationWithClient(
      client,
      previewInput,
    )

    if (
      nextPreview.advanceAmount > 0 &&
      policy.excessPaymentHandling !== 'KEEP_AS_ADVANCE'
    ) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message:
          'The edited payment exceeds the selected dues and the society policy does not allow advance credit.',
      })
    }

    for (const line of nextPreview.lines) {
      await client.query(
        `
          insert into payment_allocations (
            payment_id,
            maintenance_due_id,
            allocated_amount,
            due_amount,
            late_fee_component,
            remaining_balance,
            allocation_order
          )
          values ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          payment.id,
          line.dueId,
          line.allocatedAmount,
          line.dueAmount,
          line.lateFeeComponent,
          line.remainingBalance,
          line.allocationOrder,
        ],
      )

      const refreshed = await refreshDueTotals(
        client,
        line.dueId,
        policy.graceDays,
        policy.lateFeePerDay,
        nextPaymentDate,
      )
      if (refreshed) affected.push(refreshed)
    }

    if (nextPreview.advanceAmount > 0) {
      const creditResult = await client.query<{ id: string }>(
        `
          insert into resident_advance_credits (
            society_id,
            user_id,
            flat_id,
            source_payment_id,
            original_amount,
            current_balance,
            notes
          )
          values ($1, $2, $3, $4, $5, $5, $6)
          returning id
        `,
        [
          payment.society_id,
          nextPayerUserId,
          nextFlatId,
          payment.id,
          nextPreview.advanceAmount,
          'Excess payment retained as advance credit after payment edit.',
        ],
      )
      await client.query(
        `
          insert into resident_advance_credit_history (
            credit_id,
            action,
            amount,
            payment_id,
            actor_user_id,
            notes
          )
          values ($1, 'CREATED', $2, $3, $4, $5)
        `,
        [
          creditResult.rows[0]?.id,
          nextPreview.advanceAmount,
          payment.id,
          input.actorUserId,
          'Created during payment edit.',
        ],
      )
    }

    preview = {
      lines: nextPreview.lines,
      totalDue: nextPreview.totalDue,
      allocatedAmount: nextPreview.allocatedAmount,
      advanceAmount: nextPreview.advanceAmount,
      policy: nextPreview.policy,
    }
  }

  const nextSnapshot = {
    ...snapshot,
    selectedDueIds: nextSelectedDueIds,
    tenureMonths: nextTenureMonths,
    preview: preview ?? snapshot.preview,
    cheque: nextMode === 'CHEQUE'
      ? {
          chequeNumber: nextChequeNumber,
          chequeDate: nextChequeDate,
          bankName: nextChequeBankName,
        }
      : undefined,
    account: nextAccount ?? undefined,
    overrideReason: nextOverrideReason ?? undefined,
    paymentEdit: {
      before: beforeState,
      after: afterState,
      editedByUserId: input.actorUserId,
      editedAt: new Date().toISOString(),
    },
    amountEdit: amountChanged ? {
      previousAmount,
      amount: nextAmount,
      editedByUserId: input.actorUserId,
      editedAt: new Date().toISOString(),
    } : snapshot.amountEdit,
  }

  const receiptShouldInvalidate =
    Boolean(payment.receipt_number) &&
    (
      amountChanged ||
      paymentDateChanged ||
      flatChanged ||
      payerChanged ||
      modeChanged ||
      transferKindChanged ||
      referencesChanged ||
      reallocatePayment
    )

  await client.query(
    `
      update payments
      set
        payer_user_id = $2,
        received_for_flat_id = $3,
        mode = $4::payment_mode,
        transfer_kind = $5,
        payment_date = $6::date,
        amount = $7,
        allocation_mode = $8,
        allocation_snapshot = $9::jsonb,
        utr_reference = $10,
        bank_reference = $11,
        is_default_utr = $12,
        notes = $13,
        receipt_file_path = case when $14::boolean then null else receipt_file_path end,
        receipt_generated_at = case when $14::boolean then now() else receipt_generated_at end,
        updated_at = now()
      where id = $1
    `,
    [
      payment.id,
      nextPayerUserId,
      nextFlatId,
      nextMode,
      nextTransferKind,
      nextPaymentDate,
      nextAmount,
      nextAllocationMode,
      JSON.stringify(nextSnapshot),
      nextUtrReference,
      nextBankReference,
      referencesChanged ? !input.changes.allowDuplicateUtr : payment.is_default_utr,
      nextNotes,
      receiptShouldInvalidate,
    ],
  )

  await recomputeAccessForAffectedDues(client, affected)

  return {
    paymentId: payment.id,
    previousAmount,
    amount: nextAmount,
    allocatedAmount: preview?.allocatedAmount ?? null,
    advanceAmount: preview?.advanceAmount ?? null,
    receiptInvalidated: Boolean(payment.receipt_file_path && receiptShouldInvalidate),
    changed: true,
    beforeState,
    afterState,
    bankAccountId: accountChanged ? bankAccountId : null,
  }
}

export const updatePaymentAmountWithClient = async (
  client: PoolClient,
  input: {
    paymentId: string
    societyId: string
    actorUserId: string
    amount: number
  },
) =>
  updatePaymentWithClient(client, {
    paymentId: input.paymentId,
    societyId: input.societyId,
    actorUserId: input.actorUserId,
    changes: { amount: input.amount, allowDuplicateUtr: false },
  })

export const allocateMaintenancePayment = async (paymentId: string) => {
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const result = await allocateMaintenancePaymentWithClient(client, paymentId)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export const consumeAdvanceCreditsForDueWithClient = async (
  client: PoolClient,
  dueId: string,
) => {
  const dueResult = await client.query<DueRow>(
    `
      select
        md.id,
        md.society_id,
        md.billing_period_id,
        bp.label as billing_period_label,
        md.flat_id,
        md.due_date::text,
        md.base_amount::text,
        md.late_fee_amount::text,
        md.waived_amount::text,
        md.paid_amount::text,
        md.total_amount::text,
        md.balance_amount::text,
        md.status
      from maintenance_dues md
      inner join billing_periods bp on bp.id = md.billing_period_id
      where md.id = $1
      for update of md
    `,
    [dueId],
  )
  const due = dueResult.rows[0]
  if (!due) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Due not found.',
    })
  }
  const policy = await getPaymentPolicy(client, due.society_id)
  const settlementDate = todayDate()
  let remaining = getPaymentCreditedBalance(due)
  let consumedAmount = 0
  let consumedCreditCount = 0
  const credits = await client.query<{
    id: string
    current_balance: string
    source_payment_id: string | null
  }>(
    `
      select id, current_balance::text, source_payment_id
      from resident_advance_credits
      where society_id = $1 and flat_id = $2 and status = 'ACTIVE' and current_balance > 0
      order by created_at asc
      for update
    `,
    [due.society_id, due.flat_id],
  )

  for (const credit of credits.rows) {
    if (remaining <= 0) break
    const amount = roundMoney(
      Math.min(remaining, Number(credit.current_balance)),
    )
    const allocationAmounts = buildAllocationLineAmounts(
      due,
      roundMoney(consumedAmount + amount),
      settlementDate,
      policy.graceDays,
      policy.lateFeePerDay,
    )
    const payment = await client.query<{ id: string }>(
      `
        insert into payments (
          society_id,
          payer_user_id,
          received_for_flat_id,
          mode,
          status,
          payment_date,
          amount,
          allocation_mode,
          notes,
          verified_at
        )
        select society_id, user_id, flat_id, 'ADVANCE_CREDIT', 'VERIFIED', $4::date, $2, 'SELECTED_PERIODS', $3, now()
        from resident_advance_credits
        where id = $1
        returning id
      `,
      [credit.id, amount, `Advance credit consumed against due ${dueId}.`, settlementDate],
    )
    const allocation = await client.query<{ id: string }>(
      `
        insert into payment_allocations (
          payment_id,
          maintenance_due_id,
          allocated_amount,
          due_amount,
          late_fee_component,
          remaining_balance,
          allocation_order,
          allocation_type
        )
        values ($1, $2, $3, $4, $5, $6, 1, 'ADVANCE_CREDIT')
        returning id
      `,
      [
        payment.rows[0]?.id,
        dueId,
        amount,
        allocationAmounts.dueAmount,
        allocationAmounts.lateFeeComponent,
        allocationAmounts.remainingBalance,
      ],
    )
    await client.query(
      `
        update resident_advance_credits
        set current_balance = current_balance - $2,
            status = case when current_balance - $2 <= 0 then 'CONSUMED' else status end
        where id = $1
      `,
      [credit.id, amount],
    )
    await client.query(
      `
        insert into resident_advance_credit_history (
          credit_id,
          action,
          amount,
          payment_id,
          payment_allocation_id,
          notes
        )
        values ($1, 'CONSUMED', $2, $3, $4, $5)
      `,
      [
        credit.id,
        amount,
        payment.rows[0]?.id,
        allocation.rows[0]?.id,
        `Consumed against due ${dueId}.`,
      ],
    )
    remaining = roundMoney(remaining - amount)
    consumedAmount = roundMoney(consumedAmount + amount)
    consumedCreditCount += 1
  }

  const refreshed = await refreshDueTotals(
    client,
    dueId,
    policy.graceDays,
    policy.lateFeePerDay,
    settlementDate,
  )
  if (refreshed) {
    await recomputeAccessForAffectedDues(client, [refreshed])
  }

  return {
    consumedAmount,
    consumedCreditCount,
    balanceAmount: refreshed?.balanceAmount ?? remaining,
  }
}

export const consumeAdvanceCreditsForDue = async (dueId: string) => {
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const result = await consumeAdvanceCreditsForDueWithClient(client, dueId)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export const getPaymentReceiptData = async (
  paymentId: string,
  access?: {
    societyId?: string
    userId?: string
    isStaff?: boolean
    allowLinkedFlatAccess?: boolean
  },
) => {
  const params: unknown[] = [paymentId]
  const filters = ['p.id = $1']

  if (access?.societyId) {
    params.push(access.societyId)
    filters.push(`p.society_id = $${params.length}`)
  }

  if (access?.userId && !access.isStaff && access.allowLinkedFlatAccess) {
    params.push(access.userId)
    filters.push(`(
      p.payer_user_id = $${params.length}
      or exists (
        select 1
        from flat_residents fr
        where fr.user_id = $${params.length}
          and fr.flat_id = p.received_for_flat_id
          and fr.is_active = true
      )
    )`)
  } else if (access?.userId && !access.isStaff) {
    params.push(access.userId)
    filters.push(`p.payer_user_id = $${params.length}`)
  }

  const paymentResult = await queryRows<PaymentReceiptRow>(
    `
      select
        p.id,
        p.society_id,
        p.payer_user_id,
        p.received_for_flat_id,
        p.amount::text,
        p.payment_date::text,
        p.mode::text,
        p.transfer_kind::text,
        p.status::text,
        p.utr_reference,
        p.bank_reference,
        p.receipt_number,
        p.receipt_file_path,
        p.receipt_generated_at::text,
        p.notes,
        u.full_name as payer_name,
        u.email::text as payer_email,
        u.mobile_number as payer_mobile_number,
        f.flat_number,
        b.name as block_name,
        sp.name as society_name,
        sp.code as society_code,
        concat_ws(', ', sp.address_line_1, sp.address_line_2, sp.city, sp.state, sp.pincode) as society_address
      from payments p
      join society_profile sp on sp.id = p.society_id
      left join users u on u.id = p.payer_user_id
      left join flats f on f.id = p.received_for_flat_id
      left join blocks b on b.id = f.block_id
      where ${filters.join(' and ')}
      limit 1
    `,
    params,
  )
  const payment = paymentResult.rows[0]
  if (!payment) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Payment not found.',
    })
  }

  const allocationsResult = await queryRows<PaymentReceiptAllocationRow>(
    `
      select
        pa.maintenance_due_id as due_id,
        bp.label as billing_period_label,
        md.due_date::text,
        pa.due_amount::text,
        pa.late_fee_component::text,
        pa.allocated_amount::text,
        pa.remaining_balance::text,
        pa.allocation_order
      from payment_allocations pa
      left join maintenance_dues md on md.id = pa.maintenance_due_id
      left join billing_periods bp on bp.id = md.billing_period_id
      where pa.payment_id = $1
      order by pa.allocation_order asc, bp.start_date asc
    `,
    [paymentId],
  )

  return {
    payment,
    allocations: allocationsResult.rows,
  }
}

export const generatePaymentReceiptPdf = async (
  paymentId: string,
  access?: {
    societyId?: string
    userId?: string
    isStaff?: boolean
    allowLinkedFlatAccess?: boolean
  },
) => {
  const { payment, allocations } = await getPaymentReceiptData(
    paymentId,
    access,
  )

  if (!payment.receipt_number) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'A receipt has not been generated for this payment yet.',
    })
  }

  const reference = payment.utr_reference || payment.bank_reference || '-'
  const flatLabel =
    [payment.block_name, payment.flat_number].filter(Boolean).join(' ') || '-'
  const receiptStampImage = getSocietyStampImage()
  const allocationBody: unknown[][] = [
    [
      { text: 'Period', style: 'tableHeader' },
      { text: 'Due Date', style: 'tableHeader' },
      { text: 'Due', style: 'tableHeader' },
      { text: 'Late Fee', style: 'tableHeader' },
      { text: 'Allocated', style: 'tableHeader' },
      { text: 'Balance', style: 'tableHeader' },
    ],
    ...allocations.map((allocation) => [
      { text: allocation.billing_period_label ?? '-', style: 'tableCell' },
      { text: formatReceiptDate(allocation.due_date), style: 'tableCell' },
      {
        text: formatReceiptMoney(Number(allocation.due_amount)),
        style: 'tableCellRight',
      },
      {
        text: formatReceiptMoney(Number(allocation.late_fee_component)),
        style: 'tableCellRight',
      },
      {
        text: formatReceiptMoney(Number(allocation.allocated_amount)),
        style: 'tableCellRight',
      },
      {
        text: formatReceiptMoney(Number(allocation.remaining_balance)),
        style: 'tableCellRight',
      },
    ]),
  ]

  if (allocationBody.length === 1) {
    allocationBody.push([
      {
        text: 'No allocation lines were recorded for this payment.',
        colSpan: 6,
        style: 'tableCell',
      },
      '',
      '',
      '',
      '',
      '',
    ])
  }

  const docDefinition = {
    pageMargins: [36, 42, 36, 36],
    content: [
      { text: payment.society_name, style: 'brand' },
      { text: payment.society_address, style: 'subtle' },
      {
        columns: [
          [
            { text: 'Payment Receipt', style: 'title' },
            {
              text: `Receipt No: ${payment.receipt_number}`,
              style: 'receiptNumber',
            },
          ],
          [
            {
              text: `Payment Date: ${formatReceiptDate(payment.payment_date)}`,
              style: 'rightMeta',
            },
            {
              text: `Generated: ${formatReceiptDate(payment.receipt_generated_at)}`,
              style: 'rightMeta',
            },
          ],
        ],
        columnGap: 16,
        margin: [0, 14, 0, 16],
      },
      {
        columns: [
          {
            table: {
              widths: ['38%', '*'],
              body: [
                [
                  { text: 'Received From', style: 'labelCell' },
                  { text: payment.payer_name ?? '-', style: 'valueCell' },
                ],
                [
                  { text: 'Flat', style: 'labelCell' },
                  { text: flatLabel, style: 'valueCell' },
                ],
                [
                  { text: 'Contact', style: 'labelCell' },
                  {
                    text:
                      payment.payer_mobile_number ?? payment.payer_email ?? '-',
                    style: 'valueCell',
                  },
                ],
              ],
            },
            layout: 'noBorders',
          },
          {
            table: {
              widths: ['38%', '*'],
              body: [
                [
                  { text: 'Amount', style: 'labelCell' },
                  {
                    text: formatReceiptMoney(Number(payment.amount)),
                    style: 'valueCell',
                  },
                ],
                [
                  { text: 'Mode', style: 'labelCell' },
                  {
                    text: payment.transfer_kind ?? payment.mode,
                    style: 'valueCell',
                  },
                ],
                [
                  { text: 'Reference', style: 'labelCell' },
                  { text: reference, style: 'valueCell' },
                ],
              ],
            },
            layout: 'noBorders',
          },
        ],
        columnGap: 16,
        margin: [0, 0, 0, 18],
      },
      {
        table: {
          headerRows: 1,
          widths: ['*', '16%', '15%', '15%', '15%', '15%'],
          body: allocationBody,
        },
        layout: 'lightHorizontalLines',
      },
      {
        columns: [
          {
            stack: [
              ...(receiptStampImage
                ? [
                    {
                      image: receiptStampImage,
                      fit: [124, 76],
                      margin: [0, 0, 0, 4],
                    },
                  ]
                : []),
              {
                text: [`${payment.society_name}\n`, 'Authorised Signatory'],
                style: 'signature',
              },
            ],
          },
          {
            text: 'This is a system-generated receipt for society maintenance records.',
            style: 'footerNote',
            alignment: 'right',
          },
        ],
        columnGap: 16,
        margin: [0, 20, 0, 0],
      },
    ],
    styles: {
      brand: { fontSize: 14, color: '#0f766e', bold: true },
      title: { fontSize: 20, bold: true, color: '#2f4050' },
      receiptNumber: {
        fontSize: 10,
        bold: true,
        color: '#2f4050',
        margin: [0, 4, 0, 0],
      },
      subtle: { fontSize: 8, color: '#6b7280', margin: [0, 3, 0, 0] },
      rightMeta: { alignment: 'right', fontSize: 9, color: '#4b5563' },
      labelCell: {
        bold: true,
        fontSize: 9,
        color: '#4b5563',
        margin: [0, 2, 0, 2],
      },
      valueCell: { fontSize: 9, color: '#111827', margin: [0, 2, 0, 2] },
      tableHeader: {
        bold: true,
        fontSize: 8,
        color: '#ffffff',
        fillColor: '#2a3f54',
      },
      tableCell: { fontSize: 8, color: '#2f4050' },
      tableCellRight: { fontSize: 8, color: '#2f4050', alignment: 'right' },
      signature: { fontSize: 8, color: '#111827', bold: true },
      footerNote: { fontSize: 8, color: '#6b7280', italics: true },
    },
    defaultStyle: { font: 'Roboto' },
  }

  const buffer = await createPdfBuffer(docDefinition)

  return {
    buffer,
    fileName: `${payment.receipt_number}.pdf`.replace(/[^a-z0-9._-]/gi, '-'),
    receiptNumber: payment.receipt_number,
    storageObjectKey:
      payment.receipt_file_path ?? `receipts/${payment.receipt_number}.pdf`,
    uploadedBy: payment.payer_user_id,
  }
}

export const assignReceiptNumberForPayment = async (
  client: PoolClient,
  paymentId: string,
) => {
  const result = await client.query<{
    receipt_number: string | null
    society_id: string
  }>(
    `select receipt_number, society_id from payments where id = $1 for update`,
    [paymentId],
  )
  const payment = result.rows[0]
  if (!payment) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Payment not found.',
    })
  }
  if (payment.receipt_number) {
    return payment.receipt_number
  }

  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())
  const year = new Date().getFullYear()
  const seq = await client.query<{ value: string }>(
    `select next_yearly_sequence('RECEIPT', $1)::text as value`,
    [year],
  )
  const receiptNumber = `${runtimeConfig.societyCode}-${year}-${String(seq.rows[0]?.value ?? '1').padStart(6, '0')}`
  await client.query(
    `
      update payments
      set receipt_number = $2,
          receipt_file_path = $3,
          receipt_generated_at = now()
      where id = $1
    `,
    [paymentId, receiptNumber, `receipts/${receiptNumber}.pdf`],
  )

  return receiptNumber
}

export const uploadReceiptPdfForPayment = async (paymentId: string) => {
  const receipt = await generatePaymentReceiptPdf(paymentId)
  await uploadPrivateFile({
    storageTargetKey: 'receipts',
    storageObjectKey: receipt.storageObjectKey,
    originalFileName: receipt.fileName,
    mimeType: 'application/pdf',
    sizeBytes: receipt.buffer.length,
    body: receipt.buffer,
    uploadedBy: receipt.uploadedBy,
    relation: {
      recordType: 'payments',
      recordId: paymentId,
    },
  })
}

export const generateReceiptForPayment = async (paymentId: string) => {
  const client = await getDatabasePool().connect()
  let receiptNumber: string

  try {
    await client.query('begin')
    receiptNumber = await assignReceiptNumberForPayment(client, paymentId)
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }

  await uploadReceiptPdfForPayment(paymentId)

  return receiptNumber
}

export const enqueueReceiptReadyNotification = async (paymentId: string) => {
  const client = await getDatabasePool().connect()

  try {
    const result = await client.query<PaymentNotificationRow>(
      `
        select
          p.id,
          p.society_id,
          p.payer_user_id,
          p.received_for_flat_id,
          p.amount::text,
          p.receipt_number,
          f.flat_number,
          b.name as block_name
        from payments p
        left join flats f on f.id = p.received_for_flat_id
        left join blocks b on b.id = f.block_id
        where p.id = $1
        limit 1
      `,
      [paymentId],
    )
    const payment = result.rows[0]

    if (!payment?.payer_user_id) {
      return { eventId: null, audienceCount: 0, jobCount: 0 }
    }

    const users = await resolveNotificationAudience(
      client,
      payment.society_id,
      {
        scope: 'USERS',
        userIds: [payment.payer_user_id],
      },
    )
    const flatLabel =
      [payment.block_name, payment.flat_number].filter(Boolean).join(' ') ||
      'your flat'
    const receiptLabel = payment.receipt_number
      ? `Receipt ${payment.receipt_number}`
      : 'Your receipt'

    return enqueueNotificationForUsers(client, {
      societyId: payment.society_id,
      eventKey: 'receipt.ready',
      category: 'PAYMENTS',
      sourceTable: 'payments',
      sourceId: payment.id,
      priority: 'MEDIUM',
      title: 'Payment receipt ready',
      body: `${receiptLabel} for ${formatReceiptMoney(Number(payment.amount))} has been generated for ${flatLabel}.`,
      payload: {
        paymentId: payment.id,
        receiptNumber: payment.receipt_number,
        amount: Number(payment.amount),
        flatId: payment.received_for_flat_id,
        flatLabel,
        deepLinkUrl: '/my/receipts',
      },
      idempotencyKey: `receipt.ready:${payment.id}`,
      idempotencyWindowSeconds: 31536000,
      users,
      audienceLabel: 'Payment payer',
      audienceSnapshot: { eventKey: 'receipt.ready', paymentId: payment.id },
    })
  } finally {
    client.release()
  }
}

export const verifyRazorpayWebhookSignature = (
  rawBody: string,
  signature: string,
) => {
  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())
  const expected = createHmac('sha256', runtimeConfig.razorpayWebhookSecret)
    .update(rawBody)
    .digest('hex')
  return expected === signature
}

export const searchPaymentByReference = async (reference: string) =>
  queryRows(
    `
      select
        p.id,
        p.payment_date::text,
        p.amount::text,
        p.mode,
        p.status,
        p.utr_reference,
        p.bank_reference,
        p.receipt_number,
        f.flat_number
      from payments p
      left join flats f on f.id = p.received_for_flat_id
      where lower(coalesce(p.utr_reference, '')) = lower($1)
         or lower(coalesce(p.bank_reference, '')) = lower($1)
         or lower(coalesce(p.gateway_payment_id, '')) = lower($1)
      order by p.created_at desc
    `,
    [reference],
  )
