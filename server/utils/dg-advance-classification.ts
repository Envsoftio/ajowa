import type { PoolClient } from 'pg'
import { AppError } from './errors'
import {
  getDgAdvanceClassificationEligibility,
  type DgAdvanceClassificationEligibility,
} from '~/shared/dg-advance-classification'

export {
  dgAdvanceClassificationSchema,
  getDgAdvanceClassificationEligibility,
} from '~/shared/dg-advance-classification'

type DgAdvanceSourcePaymentRow = {
  id: string
  society_id: string
  payer_user_id: string
  received_for_flat_id: string
  status: string
  mode: string
  receipt_number: string | null
  receipt_file_path: string | null
  receipt_generated_at: string | null
}

type DgAdvanceCreditRow = {
  id: string
  society_id: string
  user_id: string
  flat_id: string
  source_payment_id: string | null
  original_amount: string
  current_balance: string
  status: string
  applicable_charge_type: string | null
  source_billing_period_id: string | null
  is_liability_accounted: boolean
}

type DgAdvanceCreditHistoryRow = {
  action: string
  payment_id: string | null
  payment_allocation_id: string | null
}

const throwIneligibleClassification = (
  eligibility: Exclude<DgAdvanceClassificationEligibility, { eligible: true }>,
): never => {
  throw new AppError({
    code: 'CONFLICT',
    statusCode: 409,
    message: eligibility.message,
  })
}

export const classifyLegacyAdvanceCreditAsDgWithClient = async (
  client: PoolClient,
  input: {
    societyId: string
    paymentId: string
    creditId: string
    actorUserId: string
    reason: string
  },
) => {
  // Lock the source payment first so payment edits and credit classification use
  // the same lock order. Keep all validation and writes inside this short transaction.
  const paymentResult = await client.query<DgAdvanceSourcePaymentRow>(
    `
      select
        id,
        society_id,
        payer_user_id,
        received_for_flat_id,
        status::text,
        mode::text,
        receipt_number,
        receipt_file_path,
        receipt_generated_at::text
      from payments
      where id = $1
        and society_id = $2
      for update
    `,
    [input.paymentId, input.societyId],
  )
  const payment = paymentResult.rows[0]
  if (!payment) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Source payment not found.',
    })
  }

  const creditsResult = await client.query<DgAdvanceCreditRow>(
    `
      select
        id,
        society_id,
        user_id,
        flat_id,
        source_payment_id,
        original_amount::text,
        current_balance::text,
        status::text,
        applicable_charge_type,
        source_billing_period_id,
        is_liability_accounted
      from resident_advance_credits
      where source_payment_id = $1
      order by id asc
      for update
    `,
    [payment.id],
  )
  const credit = creditsResult.rows.find((row) => row.id === input.creditId)
  if (!credit || credit.society_id !== input.societyId) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Advance credit not found for this source payment.',
    })
  }
  if (
    credit.flat_id !== payment.received_for_flat_id ||
    credit.user_id !== payment.payer_user_id
  ) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message:
        'The advance credit does not match the source payment resident and flat, so it cannot be classified safely.',
    })
  }

  const historyResult = await client.query<DgAdvanceCreditHistoryRow>(
    `
      select
        action::text,
        payment_id,
        payment_allocation_id
      from resident_advance_credit_history
      where credit_id = $1
      order by id asc
      for update
    `,
    [credit.id],
  )
  const dependentHistoryCount = historyResult.rows.filter(
    (history) =>
      history.action !== 'CREATED' ||
      history.payment_allocation_id !== null ||
      (history.payment_id !== null && history.payment_id !== payment.id),
  ).length
  const eligibility = getDgAdvanceClassificationEligibility({
    paymentStatus: payment.status,
    paymentMode: payment.mode,
    sourceCreditCount: creditsResult.rows.length,
    creditStatus: credit.status,
    originalAmount: credit.original_amount,
    currentBalance: credit.current_balance,
    applicableChargeType: credit.applicable_charge_type,
    dependentHistoryCount,
  })
  if (!eligibility.eligible) {
    throwIneligibleClassification(eligibility)
  }

  const updateResult = await client.query<{
    applicable_charge_type: string
    source_billing_period_id: string | null
  }>(
    `
      update resident_advance_credits
      set
        applicable_charge_type = 'DG_SET',
        source_billing_period_id = null,
        updated_at = now()
      where id = $1
        and society_id = $2
        and source_payment_id = $3
        and status = 'ACTIVE'
        and applicable_charge_type is null
        and current_balance > 0
        and current_balance = original_amount
      returning applicable_charge_type, source_billing_period_id
    `,
    [credit.id, input.societyId, payment.id],
  )
  if (!updateResult.rows[0]) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message:
        'The advance changed while it was being classified. Refresh and try again.',
    })
  }

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
      values ($1, 'ADJUSTED', $2, $3, $4, $5)
    `,
    [
      credit.id,
      credit.current_balance,
      payment.id,
      input.actorUserId,
      `Legacy unused advance classified as DG Set-only. Reason: ${input.reason}`,
    ],
  )

  const receiptInvalidated =
    payment.receipt_file_path !== null || payment.receipt_generated_at !== null
  if (receiptInvalidated) {
    await client.query(
      `
        update payments
        set
          receipt_file_path = null,
          receipt_generated_at = null,
          updated_at = now()
        where id = $1
          and society_id = $2
      `,
      [payment.id, input.societyId],
    )
  }

  const amount = Number(credit.current_balance)
  return {
    paymentId: payment.id,
    creditId: credit.id,
    userId: credit.user_id,
    flatId: credit.flat_id,
    amount,
    isLiabilityAccounted: credit.is_liability_accounted,
    receiptInvalidated,
    beforeState: {
      applicableChargeType: credit.applicable_charge_type,
      sourceBillingPeriodId: credit.source_billing_period_id,
      status: credit.status,
      originalAmount: Number(credit.original_amount),
      currentBalance: amount,
      isLiabilityAccounted: credit.is_liability_accounted,
    },
    afterState: {
      applicableChargeType: 'DG_SET',
      sourceBillingPeriodId: null,
      status: credit.status,
      originalAmount: Number(credit.original_amount),
      currentBalance: amount,
      isLiabilityAccounted: credit.is_liability_accounted,
    },
  }
}
