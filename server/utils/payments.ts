import { createHmac } from 'node:crypto'
import pdfMake from 'pdfmake/build/pdfmake.js'
import pdfFonts from 'pdfmake/build/vfs_fonts.js'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { AppError } from './errors'
import { getDatabasePool, queryRows } from './database'
import { computeDueAmounts, todayDate } from './billing'
import { getValidatedRuntimeConfig } from './env'
import { enqueueNotificationForUsers, resolveNotificationAudience } from './notifications'
import { recomputeUserAccess } from './qr-access'
import { uploadPrivateFile } from './storage'

pdfMake.vfs = pdfFonts?.pdfMake?.vfs ?? pdfFonts?.vfs

export const allocationModeSchema = z.enum(['OLDEST_UNPAID_FIRST', 'SELECTED_PERIODS', 'TENURE_PACK'])

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

export type PaymentPreviewInput = z.output<typeof paymentPreviewSchema>

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
  status: string
  allocation_mode: string
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

const roundMoney = (value: number) => Math.round(value * 100) / 100

const formatReceiptMoney = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value)

const formatReceiptDate = (value: string | null | undefined) =>
  value
    ? new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString('en-IN', {
        dateStyle: 'medium',
      })
    : '-'

const syncFlatCamAdvancePaidUntil = async (client: PoolClient, dueId: string, status: string) => {
  if (status !== 'PAID') return

  const result = await client.query<{
    society_id: string
    flat_id: string
    end_date: string
    charge_type: string
  }>(
    `
      select
        md.society_id,
        md.flat_id,
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

  await client.query(
    `
      update flats
      set
        cam_advance_paid_until = case
          when cam_advance_paid_until is null or cam_advance_paid_until < $3::date then $3::date
          else cam_advance_paid_until
        end,
        cam_advance_note = case
          when cam_advance_paid_until is null or cam_advance_paid_until < $3::date then $4
          else cam_advance_note
        end,
        cam_advance_updated_at = case
          when cam_advance_paid_until is null or cam_advance_paid_until < $3::date then now()
          else cam_advance_updated_at
        end,
        updated_at = case
          when cam_advance_paid_until is null or cam_advance_paid_until < $3::date then now()
          else updated_at
        end
      where society_id = $1
        and id = $2
    `,
    [
      row.society_id,
      row.flat_id,
      row.end_date,
      `Auto-marked from paid CAM bill through ${formatReceiptDate(row.end_date)}.`,
    ],
  )
}

const getPaymentPolicy = async (client: PoolClient, societyId: string) => {
  const result = await client.query<{ settings: Record<string, unknown> }>(
    `select settings from society_profile where id = $1 limit 1`,
    [societyId],
  )
  const settings = result.rows[0]?.settings ?? {}

  return {
    excessPaymentHandling: String(settings.excessPaymentHandling ?? 'KEEP_AS_ADVANCE'),
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
    lockRows?: boolean
  },
) => {
  const params: unknown[] = [input.flatId]
  const filters = [`md.flat_id = $1`, `md.status not in ('PAID', 'WAIVED', 'CANCELLED')`]

  if (input.mode === 'SELECTED_PERIODS') {
    if (!input.selectedDueIds?.length) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Select at least one billing period for selected-period allocation.',
      })
    }
    params.push(input.selectedDueIds)
    filters.push(`md.id = any($${params.length}::uuid[])`)
  }

  const limitClause =
    input.mode === 'TENURE_PACK' && input.tenureMonths ? `limit ${Number(input.tenureMonths)}` : ''

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

  const today = todayDate()

  return result.rows.map((due) => {
    const computed = computeDueAmounts(
      {
        dueDate: due.due_date,
        baseAmount: Number(due.base_amount),
        paidAmount: Number(due.paid_amount),
        waivedAmount: Number(due.waived_amount),
        storedStatus: due.status,
      },
      today,
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

export const previewPaymentAllocation = async (input: PaymentPreviewInput) => {
  const client = await getDatabasePool().connect()

  try {
    const societyResult = await client.query<{ society_id: string }>(
      `select society_id from flats where id = $1 limit 1`,
      [input.flatId],
    )
    const societyId = societyResult.rows[0]?.society_id
    if (!societyId) {
      throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Flat not found.' })
    }

    const policy = await getPaymentPolicy(client, societyId)
    const dueInput: Parameters<typeof selectAllocatableDues>[1] = {
      flatId: input.flatId,
      mode: input.allocationMode,
      selectedDueIds: input.selectedDueIds,
      graceDays: policy.graceDays,
      lateFeePerDay: policy.lateFeePerDay,
    }
    if (input.tenureMonths !== undefined) {
      dueInput.tenureMonths = input.tenureMonths
    }
    const dues = await selectAllocatableDues(client, dueInput)

    let remainingPayment = input.amount
    const lines = dues
      .map((due, index) => {
        const allocatedAmount = roundMoney(Math.min(remainingPayment, due.computedBalance))
        remainingPayment = roundMoney(remainingPayment - allocatedAmount)
        return {
          dueId: due.id,
          billingPeriodId: due.billing_period_id,
          billingPeriodLabel: due.billing_period_label,
          dueAmount: due.computedTotal,
          lateFeeComponent: due.computedLateFee,
          allocatedAmount,
          remainingBalance: roundMoney(due.computedBalance - allocatedAmount),
          allocationOrder: index + 1,
        }
      })
      .filter((line) => line.allocatedAmount > 0)

    return {
      lines,
      totalDue: roundMoney(dues.reduce((sum, due) => sum + due.computedBalance, 0)),
      allocatedAmount: roundMoney(lines.reduce((sum, line) => sum + line.allocatedAmount, 0)),
      advanceAmount: roundMoney(Math.max(0, remainingPayment)),
      policy: policy.excessPaymentHandling,
    }
  } finally {
    client.release()
  }
}

const refreshDueTotals = async (client: PoolClient, dueId: string, graceDays: number, lateFeePerDay: number) => {
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
    todayDate(),
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
    [dueId, computed.lateFeeAmount, paidAmount, computed.totalAmount, computed.balanceAmount, computed.status],
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

export const allocateMaintenancePayment = async (paymentId: string) => {
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')

    const paymentResult = await client.query<PaymentRow>(
      `
        select
          id,
          society_id,
          payer_user_id,
          received_for_flat_id,
          amount::text,
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
      throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Payment not found.' })
    }

    const existing = await client.query<{ count: string }>(
      `select count(*)::text from payment_allocations where payment_id = $1`,
      [paymentId],
    )
    if (Number(existing.rows[0]?.count ?? 0) > 0) {
      await client.query('commit')
      return { paymentId, idempotent: true, affectedPeriods: [] }
    }

    if (payment.status !== 'VERIFIED') {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'Payment allocation runs only after verification.',
      })
    }

    const snapshotResult = await client.query<{ allocation_snapshot: Record<string, unknown> }>(
      `select allocation_snapshot from payments where id = $1`,
      [paymentId],
    )
    const snapshot = snapshotResult.rows[0]?.allocation_snapshot ?? {}
    const policy = await getPaymentPolicy(client, payment.society_id)
    const preview = await previewPaymentAllocation({
      flatId: payment.received_for_flat_id,
      amount: Number(payment.amount),
      allocationMode: allocationModeSchema.parse(payment.allocation_mode),
      selectedDueIds: Array.isArray(snapshot.selectedDueIds) ? (snapshot.selectedDueIds as string[]) : [],
      tenureMonths: typeof snapshot.tenureMonths === 'number' ? snapshot.tenureMonths : undefined,
    })

    if (preview.advanceAmount > 0 && policy.excessPaymentHandling !== 'KEEP_AS_ADVANCE') {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'Payment exceeds the selected dues and the society policy does not allow advance credit.',
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
        const refreshed = await refreshDueTotals(client, line.dueId, policy.graceDays, policy.lateFeePerDay)
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
        [creditResult.rows[0]?.id, preview.advanceAmount, paymentId, 'Created during payment allocation.'],
      )
    }

    await recomputeAccessForAffectedDues(client, affected)

    await client.query('commit')
    return { paymentId, idempotent: false, affectedPeriods: affected, advanceAmount: preview.advanceAmount }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export const consumeAdvanceCreditsForDueWithClient = async (client: PoolClient, dueId: string) => {
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
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Due not found.' })
  }
  const policy = await getPaymentPolicy(client, due.society_id)
  const computed = computeDueAmounts(
    {
      dueDate: due.due_date,
      baseAmount: Number(due.base_amount),
      paidAmount: Number(due.paid_amount),
      waivedAmount: Number(due.waived_amount),
      storedStatus: due.status,
    },
    todayDate(),
    policy.graceDays,
    policy.lateFeePerDay,
  )
  let remaining = computed.balanceAmount
  let consumedAmount = 0
  let consumedCreditCount = 0
  const credits = await client.query<{ id: string; current_balance: string; source_payment_id: string | null }>(
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
    const amount = roundMoney(Math.min(remaining, Number(credit.current_balance)))
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
        select society_id, user_id, flat_id, 'ADVANCE_CREDIT', 'VERIFIED', current_date, $2, 'SELECTED_PERIODS', $3, now()
        from resident_advance_credits
        where id = $1
        returning id
      `,
      [credit.id, amount, `Advance credit consumed against due ${dueId}.`],
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
      [payment.rows[0]?.id, dueId, amount, computed.totalAmount, computed.lateFeeAmount, roundMoney(remaining - amount)],
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
      [credit.id, amount, payment.rows[0]?.id, allocation.rows[0]?.id, `Consumed against due ${dueId}.`],
    )
    remaining = roundMoney(remaining - amount)
    consumedAmount = roundMoney(consumedAmount + amount)
    consumedCreditCount += 1
  }

  const refreshed = await refreshDueTotals(client, dueId, policy.graceDays, policy.lateFeePerDay)
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
  access?: { societyId?: string; userId?: string; isStaff?: boolean },
) => {
  const params: unknown[] = [paymentId]
  const filters = ['p.id = $1']

  if (access?.societyId) {
    params.push(access.societyId)
    filters.push(`p.society_id = $${params.length}`)
  }

  if (access?.userId && !access.isStaff) {
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
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Payment not found.' })
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
  access?: { societyId?: string; userId?: string; isStaff?: boolean },
) => {
  const { payment, allocations } = await getPaymentReceiptData(paymentId, access)

  if (!payment.receipt_number) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'A receipt has not been generated for this payment yet.',
    })
  }

  const reference = payment.utr_reference || payment.bank_reference || '-'
  const flatLabel = [payment.block_name, payment.flat_number].filter(Boolean).join(' ') || '-'
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
      { text: formatReceiptMoney(Number(allocation.due_amount)), style: 'tableCellRight' },
      { text: formatReceiptMoney(Number(allocation.late_fee_component)), style: 'tableCellRight' },
      { text: formatReceiptMoney(Number(allocation.allocated_amount)), style: 'tableCellRight' },
      { text: formatReceiptMoney(Number(allocation.remaining_balance)), style: 'tableCellRight' },
    ]),
  ]

  if (allocationBody.length === 1) {
    allocationBody.push([
      { text: 'No allocation lines were recorded for this payment.', colSpan: 6, style: 'tableCell' },
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
            { text: `Receipt No: ${payment.receipt_number}`, style: 'receiptNumber' },
          ],
          [
            { text: `Payment Date: ${formatReceiptDate(payment.payment_date)}`, style: 'rightMeta' },
            { text: `Generated: ${formatReceiptDate(payment.receipt_generated_at)}`, style: 'rightMeta' },
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
                [{ text: 'Received From', style: 'labelCell' }, { text: payment.payer_name ?? '-', style: 'valueCell' }],
                [{ text: 'Flat', style: 'labelCell' }, { text: flatLabel, style: 'valueCell' }],
                [{ text: 'Contact', style: 'labelCell' }, { text: payment.payer_mobile_number ?? payment.payer_email ?? '-', style: 'valueCell' }],
              ],
            },
            layout: 'noBorders',
          },
          {
            table: {
              widths: ['38%', '*'],
              body: [
                [{ text: 'Amount', style: 'labelCell' }, { text: formatReceiptMoney(Number(payment.amount)), style: 'valueCell' }],
                [{ text: 'Mode', style: 'labelCell' }, { text: payment.transfer_kind ?? payment.mode, style: 'valueCell' }],
                [{ text: 'Reference', style: 'labelCell' }, { text: reference, style: 'valueCell' }],
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
        text: 'This is a system-generated receipt for society maintenance records.',
        style: 'footerNote',
      },
    ],
    styles: {
      brand: { fontSize: 14, color: '#0f766e', bold: true },
      title: { fontSize: 20, bold: true, color: '#2f4050' },
      receiptNumber: { fontSize: 10, bold: true, color: '#2f4050', margin: [0, 4, 0, 0] },
      subtle: { fontSize: 8, color: '#6b7280', margin: [0, 3, 0, 0] },
      rightMeta: { alignment: 'right', fontSize: 9, color: '#4b5563' },
      labelCell: { bold: true, fontSize: 9, color: '#4b5563', margin: [0, 2, 0, 2] },
      valueCell: { fontSize: 9, color: '#111827', margin: [0, 2, 0, 2] },
      tableHeader: { bold: true, fontSize: 8, color: '#ffffff', fillColor: '#2a3f54' },
      tableCell: { fontSize: 8, color: '#2f4050' },
      tableCellRight: { fontSize: 8, color: '#2f4050', alignment: 'right' },
      footerNote: { fontSize: 8, color: '#6b7280', margin: [0, 16, 0, 0] },
    },
    defaultStyle: { font: 'Roboto' },
  }

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    pdfMake.createPdf(docDefinition).getBuffer((pdfBuffer: Buffer) => {
      try {
        resolve(Buffer.from(pdfBuffer))
      } catch (error) {
        reject(error)
      }
    })
  })

  return {
    buffer,
    fileName: `${payment.receipt_number}.pdf`.replace(/[^a-z0-9._-]/gi, '-'),
    receiptNumber: payment.receipt_number,
    storageObjectKey: payment.receipt_file_path ?? `receipts/${payment.receipt_number}.pdf`,
    uploadedBy: payment.payer_user_id,
  }
}

export const generateReceiptForPayment = async (paymentId: string) => {
  const client = await getDatabasePool().connect()
  let receiptNumber: string

  try {
    await client.query('begin')
    const result = await client.query<{ receipt_number: string | null; society_id: string }>(
      `select receipt_number, society_id from payments where id = $1 for update`,
      [paymentId],
    )
    const payment = result.rows[0]
    if (!payment) {
      throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Payment not found.' })
    }
    if (payment.receipt_number) {
      await client.query('commit')
      return payment.receipt_number
    }
    const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())
    const year = new Date().getFullYear()
    const seq = await client.query<{ value: string }>(
      `select next_yearly_sequence('RECEIPT', $1)::text as value`,
      [year],
    )
    receiptNumber = `${runtimeConfig.societyCode}-${year}-${String(seq.rows[0]?.value ?? '1').padStart(6, '0')}`
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
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }

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

    const users = await resolveNotificationAudience(client, payment.society_id, {
      scope: 'USERS',
      userIds: [payment.payer_user_id],
    })
    const flatLabel = [payment.block_name, payment.flat_number].filter(Boolean).join(' ') || 'your flat'
    const receiptLabel = payment.receipt_number ? `Receipt ${payment.receipt_number}` : 'Your receipt'

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

export const verifyRazorpayWebhookSignature = (rawBody: string, signature: string) => {
  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())
  const expected = createHmac('sha256', runtimeConfig.razorpayWebhookSecret).update(rawBody).digest('hex')
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
