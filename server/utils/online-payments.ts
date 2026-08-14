import { z } from 'zod'
import { AppError } from './errors'
import { getDatabasePool, queryRows } from './database'
import {
  getEasebuzzIntegrationStatus,
  getEasebuzzCredentialStatus,
  getValidatedRuntimeConfig,
} from './env'
import {
  allocateMaintenancePaymentWithClient,
  assignReceiptNumberForPayment,
  paymentChargeTypeSchema,
  previewPaymentAllocation,
  type PaymentPreviewInput,
} from './payments'
import { postOnlineMaintenanceReceiptJournal } from './finance'
import { normalizeSocietySettings } from './master-data'
import {
  buildOnlinePaymentRequestFingerprint,
  canonicalizeEasebuzzAmount,
  createEasebuzzTransactionId,
  decryptEasebuzzAccessKey,
  EASEBUZZ_CURRENCY,
  EASEBUZZ_PROVIDER,
  extractEasebuzzTransaction,
  encryptEasebuzzAccessKey,
  buildEasebuzzEventFingerprint,
  redactEasebuzzPayload,
  sha256Hex,
  verifyEasebuzzReverseHash,
  initiateEasebuzzPayment,
  normalizeEasebuzzStatus,
  parseEasebuzzPaidAt,
  retrieveEasebuzzTransaction,
  type EasebuzzFormPayload,
} from './easebuzz'
import type { AuthMe } from '~/types/auth'

export const onlinePaymentInitiateSchema = z.object({
  flatId: z.string().uuid(),
  chargeType: paymentChargeTypeSchema,
  amount: z.coerce.number().min(1),
  allocationMode: z
    .enum(['OLDEST_UNPAID_FIRST', 'SELECTED_PERIODS', 'TENURE_PACK'])
    .default('OLDEST_UNPAID_FIRST'),
  selectedDueIds: z.array(z.string().uuid()).max(36).default([]),
  tenureMonths: z.coerce.number().int().positive().max(24).optional(),
  idempotencyKey: z.string().uuid(),
})

export type OnlinePaymentInitiateInput = z.output<
  typeof onlinePaymentInitiateSchema
>

type AttemptRow = {
  id: string
  payment_id: string
  society_id: string
  provider: string
  merchant_transaction_id: string
  idempotency_key: string
  request_fingerprint: string
  status: string
  amount: string
  currency: string
  gateway_payment_id: string | null
  access_key_ciphertext: string | null
  access_key_expires_at: string | null
}

type BlockingAttemptRow = AttemptRow & {
  payer_user_id: string
  received_for_flat_id: string
}

const ACTIVE_ATTEMPT_STATUSES = [
  'CREATED',
  'INITIATING',
  'INITIATED',
  'PENDING_VERIFICATION',
  'GATEWAY_SUCCESS',
  'MANUAL_REVIEW',
] as const

const requireEasebuzz = () => {
  const runtimeConfig = getValidatedRuntimeConfig(
    typeof useRuntimeConfig === 'function' ? useRuntimeConfig() : undefined,
  )
  const status = getEasebuzzIntegrationStatus(runtimeConfig)
  if (!status.enabled) {
    throw new AppError({
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
      message: 'Online payments are currently unavailable.',
    })
  }
  return { runtimeConfig, config: status.config }
}

const requireEasebuzzCredentials = () => {
  const runtimeConfig = getValidatedRuntimeConfig(
    typeof useRuntimeConfig === 'function' ? useRuntimeConfig() : undefined,
  )
  const status = getEasebuzzCredentialStatus(runtimeConfig)
  if (!status.enabled) {
    throw new AppError({
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
      message: 'Online payment verification is currently unavailable.',
    })
  }
  return status.config
}

const requireResidentPaymentAccess = async (authMe: AuthMe, flatId: string) => {
  if (authMe.user.role !== 'RESIDENT') {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'Online checkout is available only to residents.',
    })
  }
  const access = authMe.flatAccess.find((flat) => flat.flatId === flatId)
  if (!access?.isBillingContact) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'Payment access is limited to the billing contact.',
    })
  }
  const society = await queryRows<{ settings: Record<string, unknown> }>(
    `select settings from society_profile where id = $1 limit 1`,
    [authMe.user.societyId],
  )
  const settings = normalizeSocietySettings(society.rows[0]?.settings)
  const allowed =
    access.relationshipType === 'OWNER' ||
    (access.relationshipType === 'TENANT' && settings.tenantPaymentsEnabled)
  if (!allowed) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'Your resident relationship is not eligible for online payment.',
    })
  }
}

const buildPreviewInput = (
  input: OnlinePaymentInitiateInput,
): PaymentPreviewInput => ({
  flatId: input.flatId,
  chargeType: input.chargeType,
  amount: input.amount,
  allocationMode: input.allocationMode,
  selectedDueIds: input.selectedDueIds,
  ...(input.tenureMonths === undefined
    ? {}
    : { tenureMonths: input.tenureMonths }),
})

const assertAttemptMatches = (
  attempt: AttemptRow,
  expected: {
    paymentId: string
    societyId: string
    fingerprint: string
    amount: number
  },
) => {
  if (
    attempt.payment_id !== expected.paymentId ||
    attempt.society_id !== expected.societyId ||
    attempt.provider !== EASEBUZZ_PROVIDER ||
    attempt.request_fingerprint !== expected.fingerprint ||
    canonicalizeEasebuzzAmount(attempt.amount) !==
      canonicalizeEasebuzzAmount(expected.amount)
  ) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message:
        'This idempotency key is already associated with another payment request.',
    })
  }
}

const findBlockingOnlinePaymentAttempt = async (input: {
  societyId: string
  payerUserId: string
  flatId: string
  idempotencyKey: string
}) => {
  const result = await queryRows<BlockingAttemptRow>(
    `select
       attempt.id, attempt.payment_id, attempt.society_id, attempt.provider,
       attempt.merchant_transaction_id, attempt.idempotency_key,
       attempt.request_fingerprint, attempt.status, attempt.amount::text,
       attempt.currency, attempt.gateway_payment_id,
       attempt.access_key_ciphertext, attempt.access_key_expires_at,
       payment.payer_user_id, payment.received_for_flat_id
     from payments payment
     inner join payment_gateway_attempts attempt on attempt.payment_id = payment.id
     where payment.society_id = $1
       and payment.payer_user_id = $2
       and payment.received_for_flat_id = $3
       and payment.idempotency_key <> $4
       and payment.status in ('INITIATED', 'PENDING_VERIFICATION')
       and attempt.status = any($5::text[])
     order by attempt.created_at
     limit 1`,
    [
      input.societyId,
      input.payerUserId,
      input.flatId,
      input.idempotencyKey,
      [...ACTIVE_ATTEMPT_STATUSES],
    ],
  )
  return result.rows[0] ?? null
}

const reconcileBlockingOnlinePaymentAttempt = async (input: {
  societyId: string
  payerUserId: string
  flatId: string
  idempotencyKey: string
}) => {
  const attempt = await findBlockingOnlinePaymentAttempt(input)
  if (!attempt) return

  try {
    // Easebuzz is the source of truth. A confirmed failure/cancellation clears
    // the local block; an unknown or unreachable result deliberately does not.
    await retrieveAndApplyOnlinePayment(attempt.id)
  } catch {
    // The locked transaction below will return the existing payment reference.
    // Reconciliation remains scheduled and a duplicate charge stays blocked.
  }
}

export const initiateOnlinePayment = async (
  input: OnlinePaymentInitiateInput,
  authMe: AuthMe,
) => {
  const { runtimeConfig, config } = requireEasebuzz()
  await requireResidentPaymentAccess(authMe, input.flatId)
  await reconcileBlockingOnlinePaymentAttempt({
    societyId: authMe.user.societyId,
    payerUserId: authMe.user.id,
    flatId: input.flatId,
    idempotencyKey: input.idempotencyKey,
  })
  const preview = await previewPaymentAllocation(buildPreviewInput(input))
  const fingerprint = buildOnlinePaymentRequestFingerprint({
    societyId: authMe.user.societyId,
    payerUserId: authMe.user.id,
    flatId: input.flatId,
    chargeType: input.chargeType,
    amount: input.amount,
    allocationMode: input.allocationMode,
    selectedDueIds: input.selectedDueIds,
    ...(input.tenureMonths === undefined
      ? {}
      : { tenureMonths: input.tenureMonths }),
  })

  const pool = getDatabasePool()
  const client = await pool.connect()
  let paymentId: string
  let attempt: AttemptRow | undefined
  try {
    await client.query('begin')
    await client.query(
      `select pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [[authMe.user.societyId, authMe.user.id, input.flatId].join(':')],
    )
    const activePayment = await client.query<{
      id: string
      merchant_transaction_id: string
    }>(
      `select payment.id, attempt.merchant_transaction_id
       from payments payment
       inner join payment_gateway_attempts attempt on attempt.payment_id = payment.id
       where payment.society_id = $1
         and payment.payer_user_id = $2
         and payment.received_for_flat_id = $3
         and payment.idempotency_key <> $4
         and payment.status in ('INITIATED', 'PENDING_VERIFICATION')
         and attempt.status in (
           'CREATED', 'INITIATING', 'INITIATED', 'PENDING_VERIFICATION',
           'GATEWAY_SUCCESS', 'MANUAL_REVIEW'
         )
       limit 1
       for update of payment, attempt`,
      [
        authMe.user.societyId,
        authMe.user.id,
        input.flatId,
        input.idempotencyKey,
      ],
    )
    if (activePayment.rows[0]) {
      const blocked = activePayment.rows[0]
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message:
          'A payment for this flat is already being verified. Do not pay again until its status is resolved.',
        details: {
          paymentId: blocked.id,
          transactionReference: blocked.merchant_transaction_id,
          retryAllowed: false,
        },
      })
    }
    const paymentResult = await client.query<{
      id: string
      society_id: string
      payer_user_id: string
      received_for_flat_id: string
      amount: string
      mode: string
      payment_provider: string | null
      allocation_snapshot: Record<string, unknown>
    }>(
      `insert into payments (
         society_id,
         payer_user_id,
         received_for_flat_id,
         charge_type,
         mode,
         status,
         payment_date,
         amount,
         payment_provider,
         idempotency_key,
         allocation_mode,
         allocation_snapshot
       ) values (
         $1, $2, $3, $4, 'ONLINE_GATEWAY', 'INITIATED', current_date,
         $5, 'EASEBUZZ', $6, $7, $8::jsonb
       )
       on conflict (idempotency_key) where idempotency_key is not null
       do update set idempotency_key = excluded.idempotency_key
       returning
         id,
         society_id,
         payer_user_id,
         received_for_flat_id,
         amount::text,
         mode::text,
         payment_provider,
         allocation_snapshot`,
      [
        authMe.user.societyId,
        authMe.user.id,
        input.flatId,
        input.chargeType,
        input.amount,
        input.idempotencyKey,
        input.allocationMode,
        JSON.stringify({
          chargeType: input.chargeType,
          selectedDueIds: input.selectedDueIds,
          tenureMonths: input.tenureMonths,
          preview,
          requestFingerprint: fingerprint,
        }),
      ],
    )
    const payment = paymentResult.rows[0]
    if (!payment) throw new Error('Payment creation did not return a row.')
    if (
      payment.society_id !== authMe.user.societyId ||
      payment.payer_user_id !== authMe.user.id ||
      payment.received_for_flat_id !== input.flatId ||
      payment.mode !== 'ONLINE_GATEWAY' ||
      payment.payment_provider !== EASEBUZZ_PROVIDER ||
      canonicalizeEasebuzzAmount(payment.amount) !==
        canonicalizeEasebuzzAmount(input.amount) ||
      payment.allocation_snapshot?.requestFingerprint !== fingerprint
    ) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message:
          'This idempotency key is already associated with another payment request.',
      })
    }
    paymentId = payment.id

    const attemptResult = await client.query<AttemptRow>(
      `insert into payment_gateway_attempts (
         payment_id,
         society_id,
         provider,
         merchant_transaction_id,
         idempotency_key,
         request_fingerprint,
         amount,
         currency
       ) values ($1, $2, 'EASEBUZZ', $3, $4, $5, $6, 'INR')
       on conflict (society_id, provider, idempotency_key)
       do update set idempotency_key = excluded.idempotency_key
       returning
         id,
         payment_id,
         society_id,
         provider,
         merchant_transaction_id,
         idempotency_key,
         request_fingerprint,
         status,
         amount::text,
         currency,
         gateway_payment_id,
         access_key_ciphertext,
         access_key_expires_at`,
      [
        payment.id,
        authMe.user.societyId,
        createEasebuzzTransactionId(),
        input.idempotencyKey,
        fingerprint,
        input.amount,
      ],
    )
    attempt = attemptResult.rows[0]
    if (!attempt)
      throw new Error('Gateway attempt creation did not return a row.')
    assertAttemptMatches(attempt, {
      paymentId,
      societyId: authMe.user.societyId,
      fingerprint,
      amount: input.amount,
    })
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }

  if (!attempt) throw new Error('Gateway attempt is unavailable.')
  if (attempt.status !== 'CREATED') {
    const recoveredAccessKey =
      attempt.status === 'INITIATED' &&
      attempt.access_key_ciphertext &&
      attempt.access_key_expires_at &&
      new Date(attempt.access_key_expires_at).getTime() > Date.now()
        ? decryptEasebuzzAccessKey(
            attempt.access_key_ciphertext,
            runtimeConfig.betterAuthSecret,
          )
        : null
    return {
      paymentId,
      txnid: attempt.merchant_transaction_id,
      status: attempt.status,
      ...(recoveredAccessKey
        ? {
            accessKey: recoveredAccessKey,
            merchantKey: config.key,
            environment: config.environment,
          }
        : {}),
      retryAllowed: false,
      allocationPreview: preview,
    }
  }

  const claimed = await pool.query<{ id: string }>(
    `update payment_gateway_attempts
     set status = 'INITIATING', attempt_count = attempt_count + 1
     where id = $1 and status = 'CREATED'
     returning id`,
    [attempt.id],
  )
  if (!claimed.rows[0]) {
    return {
      paymentId,
      txnid: attempt.merchant_transaction_id,
      status: 'PENDING_VERIFICATION',
      retryAllowed: false,
      allocationPreview: preview,
    }
  }

  try {
    const initiated = await initiateEasebuzzPayment(config, {
      txnid: attempt.merchant_transaction_id,
      amount: canonicalizeEasebuzzAmount(input.amount),
      productinfo: 'AJOWA Maintenance',
      firstname: authMe.user.fullName.slice(0, 150),
      email: authMe.user.email,
      phone: authMe.user.mobileNumber,
      surl: `${runtimeConfig.appUrl}/api/payments/easebuzz/callback`,
      furl: `${runtimeConfig.appUrl}/api/payments/easebuzz/callback`,
      udf1: paymentId,
      udf2: authMe.user.societyId,
      udf3: '',
      udf4: '',
      udf5: '',
      udf6: '',
      udf7: '',
      udf8: '',
      udf9: '',
      udf10: '',
    })
    if (!initiated.ok) {
      await pool.query(
        `update payment_gateway_attempts
         set status = 'FAILED', failure_stage = 'initiation',
             failure_code = 'PAYMENT_INITIATION_FAILED', retry_allowed = true,
             last_error_message = 'Easebuzz rejected payment initiation.'
         where id = $1`,
        [attempt.id],
      )
      await pool.query(
        `update payments set status = 'FAILED' where id = $1 and status = 'INITIATED'`,
        [paymentId],
      )
      throw new AppError({
        code: 'SERVICE_UNAVAILABLE',
        statusCode: 502,
        message:
          'We could not start your payment. No successful payment was created.',
      })
    }

    const encryptedAccessKey = encryptEasebuzzAccessKey(
      initiated.accessKey,
      runtimeConfig.betterAuthSecret,
    )
    await pool.query(
      `update payment_gateway_attempts
       set status = 'INITIATED', initiated_at = now(),
           initiation_response = jsonb_build_object('accepted', true),
           access_key_ciphertext = $2,
           access_key_expires_at = now() + interval '15 minutes'
       where id = $1`,
      [attempt.id, encryptedAccessKey],
    )
    return {
      paymentId,
      txnid: attempt.merchant_transaction_id,
      accessKey: initiated.accessKey,
      merchantKey: config.key,
      environment: config.environment,
      amount: Number(canonicalizeEasebuzzAmount(input.amount)),
      currency: EASEBUZZ_CURRENCY,
      status: 'INITIATED',
      retryAllowed: false,
      allocationPreview: preview,
    }
  } catch (error) {
    if (error instanceof AppError) throw error
    await pool.query(
      `update payment_gateway_attempts
       set status = 'PENDING_VERIFICATION',
           failure_stage = 'initiation',
           failure_code = 'PAYMENT_STATUS_UNKNOWN',
           retry_allowed = false,
           next_reconciliation_at = now()
       where id = $1`,
      [attempt.id],
    )
    await pool.query(
      `update payments
       set status = 'PENDING_VERIFICATION'
       where id = $1 and status = 'INITIATED'`,
      [paymentId],
    )
    return {
      paymentId,
      txnid: attempt.merchant_transaction_id,
      status: 'PENDING_VERIFICATION',
      code: 'PAYMENT_STATUS_UNKNOWN',
      retryAllowed: false,
      allocationPreview: preview,
    }
  }
}

const finalizeVerifiedPayment = async (
  attemptId: string,
  gateway: EasebuzzFormPayload,
) => {
  const pool = getDatabasePool()
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await client.query<
      AttemptRow & { received_for_flat_id: string | null }
    >(
      `select
         attempt.id,
         attempt.payment_id,
         attempt.society_id,
         attempt.provider,
         attempt.merchant_transaction_id,
         attempt.idempotency_key,
         attempt.request_fingerprint,
         attempt.status,
         attempt.amount::text,
         attempt.currency,
         attempt.gateway_payment_id,
         payment.received_for_flat_id
       from payment_gateway_attempts attempt
       inner join payments payment on payment.id = attempt.payment_id
       where attempt.id = $1
       for update of attempt, payment`,
      [attemptId],
    )
    const attempt = result.rows[0]
    if (!attempt) throw new Error('Payment attempt was not found.')
    if (attempt.status === 'VERIFIED') {
      await client.query('commit')
      return attempt.payment_id
    }

    const gatewayAmount = canonicalizeEasebuzzAmount(gateway.amount ?? '')
    if (
      gateway.txnid !== attempt.merchant_transaction_id ||
      gatewayAmount !== canonicalizeEasebuzzAmount(attempt.amount) ||
      !gateway.easepayid
    ) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'The payment response does not match the initiated payment.',
      })
    }
    const gatewayPaidAt =
      parseEasebuzzPaidAt(gateway) ?? new Date().toISOString()
    await client.query(
      `update payments
       set gateway_order_id = $2,
           gateway_payment_id = $3,
           bank_reference = nullif($4, ''),
           gateway_paid_at = $5,
           payment_date = ($5::timestamptz at time zone 'Asia/Kolkata')::date,
           status = 'VERIFIED',
           verified_at = now()
       where id = $1`,
      [
        attempt.payment_id,
        attempt.merchant_transaction_id,
        gateway.easepayid,
        gateway.bank_ref_num ?? '',
        gatewayPaidAt,
      ],
    )
    await allocateMaintenancePaymentWithClient(client, attempt.payment_id)
    await assignReceiptNumberForPayment(client, attempt.payment_id)
    await postOnlineMaintenanceReceiptJournal(client, {
      paymentId: attempt.payment_id,
      societyId: attempt.society_id,
    })
    await client.query(
      `insert into payment_effect_jobs (society_id, payment_id, job_type)
       values ($1, $2, 'RECEIPT_PDF'), ($1, $2, 'RECEIPT_NOTIFICATION')
       on conflict (payment_id, job_type) do nothing`,
      [attempt.society_id, attempt.payment_id],
    )
    await client.query(
      `update payment_gateway_attempts
       set status = 'VERIFIED', completed_at = now(), retry_allowed = false,
           access_key_ciphertext = null, access_key_expires_at = null
       where id = $1`,
      [attempt.id],
    )
    await client.query(
      `update payments
       set gateway_finalized_at = now(), gateway_finalization_error = null
       where id = $1`,
      [attempt.payment_id],
    )
    await client.query('commit')
    return attempt.payment_id
  } catch (error) {
    await client.query('rollback')
    await pool.query(
      `update payment_gateway_attempts
       set status = 'MANUAL_REVIEW', manual_review_required_at = now(),
           failure_stage = 'finalization',
           failure_code = 'PAYMENT_RECEIVED_PROCESSING', retry_allowed = false,
           next_reconciliation_at = now() + interval '5 minutes'
       where id = $1`,
      [attemptId],
    )
    throw error
  } finally {
    client.release()
  }
}

export const applyAuthoritativeEasebuzzTransaction = async (
  attempt: AttemptRow,
  gateway: EasebuzzFormPayload,
) => {
  const normalized = normalizeEasebuzzStatus(gateway.status)
  const expectedAmount = canonicalizeEasebuzzAmount(attempt.amount)
  if (
    gateway.txnid !== attempt.merchant_transaction_id ||
    canonicalizeEasebuzzAmount(gateway.amount ?? '') !== expectedAmount
  ) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'The retrieved transaction does not match the payment attempt.',
    })
  }
  const pool = getDatabasePool()
  if (normalized === 'SUCCESS') {
    if (!gateway.easepayid) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message:
          'The successful transaction has no Easebuzz payment identifier.',
      })
    }
    await pool.query(
      `update payment_gateway_attempts
       set status = 'GATEWAY_SUCCESS', last_gateway_status = $2,
           authoritative_gateway_success_at = coalesce(authoritative_gateway_success_at, now()),
           gateway_payment_id = $3,
           bank_reference = nullif($4, ''),
           last_verified_at = now(), retry_allowed = false
       where id = $1 and status <> 'VERIFIED'`,
      [
        attempt.id,
        gateway.status,
        gateway.easepayid,
        gateway.bank_ref_num ?? '',
      ],
    )
    return {
      normalized,
      paymentId: await finalizeVerifiedPayment(attempt.id, gateway),
    }
  }

  if (normalized === 'FAILED' || normalized === 'CANCELLED') {
    const localStatus = normalized === 'FAILED' ? 'FAILED' : 'CANCELLED'
    const failureCode =
      normalized === 'FAILED' ? 'PAYMENT_DECLINED' : 'PAYMENT_CANCELLED'
    const residentMessage =
      normalized === 'FAILED'
        ? 'The payment was not completed by the bank or payment provider. You may try again.'
        : 'You cancelled the checkout. No successful payment has been confirmed. You may try again.'
    const client = await pool.connect()
    try {
      await client.query('begin')
      const locked = await client.query<{
        attempt_status: string
        payment_status: string
      }>(
        `select attempt.status as attempt_status, payment.status::text as payment_status
         from payment_gateway_attempts attempt
         inner join payments payment on payment.id = attempt.payment_id
         where attempt.id = $1
         for update of attempt, payment`,
        [attempt.id],
      )
      const current = locked.rows[0]
      if (!current) throw new Error('Payment attempt was not found.')
      if (
        current.attempt_status === 'VERIFIED' ||
        current.payment_status === 'VERIFIED'
      ) {
        await client.query('commit')
        return { normalized: 'SUCCESS' as const, paymentId: attempt.payment_id }
      }
      await client.query(
        `update payment_gateway_attempts
         set status = $2, last_gateway_status = $3, completed_at = now(),
             retry_allowed = true, last_verified_at = now(),
             failure_stage = 'verification', failure_code = $4,
             resident_message = $5, next_reconciliation_at = null,
             manual_review_required_at = null,
             last_error_code = null, last_error_message = null,
             access_key_ciphertext = null, access_key_expires_at = null
         where id = $1`,
        [attempt.id, localStatus, gateway.status, failureCode, residentMessage],
      )
      await client.query(
        `update payments set status = $2 where id = $1`,
        [attempt.payment_id, localStatus],
      )
      await client.query('commit')
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
    return { normalized, paymentId: attempt.payment_id }
  }

  await pool.query(
    `update payment_gateway_attempts
     set status = case when $2 = 'UNKNOWN' then 'MANUAL_REVIEW' else 'PENDING_VERIFICATION' end,
         last_gateway_status = $3,
         failure_stage = 'verification',
         failure_code = case when $2 = 'UNKNOWN' then 'PAYMENT_UNDER_REVIEW' else 'PAYMENT_PENDING' end,
         resident_message = case
           when $2 = 'UNKNOWN' then 'We could not safely verify this payment. It is under review. Do not pay again.'
           else 'Your payment is still being processed. Please do not pay again.' end,
         last_verified_at = now(), retry_allowed = false,
         next_reconciliation_at = now() + interval '5 minutes',
         manual_review_required_at = case when $2 = 'UNKNOWN' then coalesce(manual_review_required_at, now()) else manual_review_required_at end
     where id = $1 and status not in ('VERIFIED', 'FAILED', 'CANCELLED')`,
    [attempt.id, normalized, gateway.status ?? ''],
  )
  await pool.query(
    `update payments
     set status = 'PENDING_VERIFICATION'
     where id = $1 and status not in ('VERIFIED', 'FAILED', 'CANCELLED')`,
    [attempt.payment_id],
  )
  return { normalized, paymentId: attempt.payment_id }
}

export const retrieveAndApplyOnlinePayment = async (attemptId: string) => {
  const config = requireEasebuzzCredentials()
  const attemptResult = await queryRows<AttemptRow>(
    `select
       id, payment_id, society_id, provider, merchant_transaction_id,
       idempotency_key, request_fingerprint, status, amount::text,
       currency, gateway_payment_id
       , access_key_ciphertext, access_key_expires_at
     from payment_gateway_attempts
     where id = $1 and provider = 'EASEBUZZ'
     limit 1`,
    [attemptId],
  )
  const attempt = attemptResult.rows[0]
  if (!attempt) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Online payment attempt not found.',
    })
  }
  if (attempt.status === 'VERIFIED') {
    return { normalized: 'SUCCESS' as const, paymentId: attempt.payment_id }
  }
  const raw = await retrieveEasebuzzTransaction(
    config,
    attempt.merchant_transaction_id,
  )
  const transaction = extractEasebuzzTransaction(raw)
  if (!transaction) {
    throw new AppError({
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 502,
      message: 'Payment verification is temporarily unavailable.',
    })
  }
  const payloadHash = sha256Hex(JSON.stringify(raw))
  const eventFingerprint = buildEasebuzzEventFingerprint({
    eventKind: 'TRANSACTION_RETRIEVAL',
    payload: transaction,
    payloadHash,
  })
  const event = await queryRows<{ id: string }>(
    `insert into payment_gateway_events (
       society_id, payment_id, attempt_id, provider, event_fingerprint,
       event_kind, merchant_transaction_id, gateway_payment_id,
       gateway_status, amount, payload_hash, hash_verified, redacted_payload
     ) values (
       $1, $2, $3, 'EASEBUZZ', $4, 'TRANSACTION_RETRIEVAL', $5,
       nullif($6, ''), nullif($7, ''), $8, $9, true, $10::jsonb
     )
     on conflict (provider, event_fingerprint) do update
       set received_count = payment_gateway_events.received_count + 1,
           last_received_at = now(), updated_at = now()
     returning id`,
    [
      attempt.society_id,
      attempt.payment_id,
      attempt.id,
      eventFingerprint,
      attempt.merchant_transaction_id,
      transaction.easepayid ?? '',
      transaction.status ?? '',
      canonicalizeEasebuzzAmount(transaction.amount ?? ''),
      payloadHash,
      JSON.stringify(redactEasebuzzPayload(transaction)),
    ],
  )
  const applied = await applyAuthoritativeEasebuzzTransaction(
    attempt,
    transaction,
  )
  if (['SUCCESS', 'FAILED', 'CANCELLED'].includes(applied.normalized)) {
    await queryRows(
      `update payment_gateway_events
       set processed_at = now(), processing_error = null
       where attempt_id = $1 and hash_verified = true and processed_at is null`,
      [attempt.id],
    )
  } else if (event.rows[0]) {
    await queryRows(
      `update payment_gateway_events set processing_error = 'Transaction remains non-terminal.' where id = $1`,
      [event.rows[0].id],
    )
  }
  return applied
}

export const findOnlinePaymentAttempt = async (input: {
  paymentId?: string
  txnid?: string
}) => {
  const result = await queryRows<AttemptRow>(
    `select
       id, payment_id, society_id, provider, merchant_transaction_id,
       idempotency_key, request_fingerprint, status, amount::text,
       currency, gateway_payment_id
       , access_key_ciphertext, access_key_expires_at
     from payment_gateway_attempts
     where ($1::uuid is not null and payment_id = $1)
        or ($2::text is not null and merchant_transaction_id = $2)
     limit 1`,
    [input.paymentId ?? null, input.txnid ?? null],
  )
  return result.rows[0] ?? null
}

export const getSafeOnlinePaymentStatus = async (paymentId: string) => {
  const result = await queryRows<{
    payment_id: string
    society_id: string
    payer_user_id: string
    received_for_flat_id: string
    status: string
    amount: string
    receipt_number: string | null
    merchant_transaction_id: string
    attempt_status: string
    retry_allowed: boolean
    failure_code: string | null
    resident_message: string | null
  }>(
    `select
       payment.id as payment_id,
       payment.society_id,
       payment.payer_user_id,
       payment.received_for_flat_id,
       payment.status::text,
       payment.amount::text,
       payment.receipt_number,
       attempt.merchant_transaction_id,
       attempt.status as attempt_status,
       attempt.retry_allowed,
       attempt.failure_code,
       attempt.resident_message
     from payments payment
     inner join payment_gateway_attempts attempt on attempt.payment_id = payment.id
     where payment.id = $1 and payment.payment_provider = 'EASEBUZZ'
     limit 1`,
    [paymentId],
  )
  return result.rows[0] ?? null
}

export const toResidentOnlinePaymentStatus = (
  status: NonNullable<Awaited<ReturnType<typeof getSafeOnlinePaymentStatus>>>,
) => {
  const terminalFailure = ['FAILED', 'CANCELLED'].includes(status.status)
  const verified = status.status === 'VERIFIED'
  const underReview = status.attempt_status === 'MANUAL_REVIEW'
  return {
    paymentId: status.payment_id,
    status: status.status,
    attemptStatus: status.attempt_status,
    amount: Number(status.amount),
    receiptNumber: status.receipt_number,
    reference: status.merchant_transaction_id,
    retryAllowed: status.retry_allowed,
    failureCode: status.failure_code,
    title: verified
      ? 'Payment confirmed'
      : terminalFailure
        ? 'Payment not completed'
        : underReview
          ? 'Payment under review'
          : 'Payment verification in progress',
    message:
      status.resident_message ??
      (verified
        ? 'Your payment has been confirmed.'
        : terminalFailure
          ? 'No successful payment has been confirmed. You may try again.'
          : underReview
            ? 'We could not safely verify this payment. Do not pay again and contact support with the payment reference.'
            : 'Your payment is still being processed. Please do not pay again.'),
    ...(verified || terminalFailure ? {} : { pollAfterMs: 5000 }),
  }
}

export const markEventForReconciliation = async (attemptId: string) => {
  await queryRows(
    `update payment_gateway_attempts
     set next_reconciliation_at = now(),
         status = case when status in ('CREATED', 'INITIATING', 'INITIATED')
           then 'PENDING_VERIFICATION' else status end
     where id = $1 and status <> 'VERIFIED'`,
    [attemptId],
  )
}

export const persistEasebuzzEvent = async (input: {
  eventKind: 'CALLBACK' | 'WEBHOOK'
  rawBody: string
  payload: EasebuzzFormPayload
}) => {
  const runtimeConfig = getValidatedRuntimeConfig(
    typeof useRuntimeConfig === 'function' ? useRuntimeConfig() : undefined,
  )
  const credentials = getEasebuzzCredentialStatus(runtimeConfig)
  const payloadHash = sha256Hex(input.rawBody)
  const eventFingerprint = buildEasebuzzEventFingerprint({
    eventKind: input.eventKind,
    payload: input.payload,
    payloadHash,
  })
  const attempt = input.payload.txnid
    ? await findOnlinePaymentAttempt({ txnid: input.payload.txnid })
    : null
  const amount = (() => {
    try {
      return canonicalizeEasebuzzAmount(input.payload.amount ?? '')
    } catch {
      return null
    }
  })()
  const correlated = Boolean(
    attempt &&
    input.payload.udf1 === attempt.payment_id &&
    input.payload.udf2 === attempt.society_id &&
    input.payload.key === credentials.config?.key &&
    amount === canonicalizeEasebuzzAmount(attempt.amount),
  )
  const hashVerified = Boolean(
    credentials.enabled &&
    correlated &&
    verifyEasebuzzReverseHash(input.payload, credentials.config.salt),
  )
  const result = await queryRows<{ id: string }>(
    `insert into payment_gateway_events (
       society_id, payment_id, attempt_id, provider, event_fingerprint,
       event_kind, merchant_transaction_id, gateway_payment_id,
       gateway_status, amount, payload_hash, hash_verified, redacted_payload,
       processing_error
     ) values (
       $1, $2, $3, 'EASEBUZZ', $4, $5, nullif($6, ''), nullif($7, ''),
       nullif($8, ''), $9, $10, $11, $12::jsonb,
       case when $11 then null else 'Message integrity or correlation check failed.' end
     )
     on conflict (provider, event_fingerprint) do update
       set received_count = payment_gateway_events.received_count + 1,
           last_received_at = now(),
           updated_at = now()
     returning id`,
    [
      correlated ? attempt?.society_id : null,
      correlated ? attempt?.payment_id : null,
      correlated ? attempt?.id : null,
      eventFingerprint,
      input.eventKind,
      input.payload.txnid ?? '',
      input.payload.easepayid ?? '',
      input.payload.status ?? '',
      amount,
      payloadHash,
      hashVerified,
      JSON.stringify(redactEasebuzzPayload(input.payload)),
    ],
  )

  if (hashVerified && attempt) {
    await markEventForReconciliation(attempt.id)
  }

  return {
    eventId: result.rows[0]?.id,
    paymentId: correlated ? attempt?.payment_id : null,
    attemptId: correlated ? attempt?.id : null,
    accepted: hashVerified,
  }
}
