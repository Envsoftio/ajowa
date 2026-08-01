import { z } from 'zod'
import { getDatabasePool, queryRows } from './database'
import { AppError } from './errors'
import { postMaintenanceReceiptJournal } from './finance'
import {
  allocateMaintenancePaymentWithClient,
  assignReceiptNumberForPayment,
  enqueueReceiptReadyNotification,
  previewPaymentAllocation,
  uploadReceiptPdfForPayment,
} from './payments'
import type { manualPaymentSchema } from './payments'

export type ManualPaymentInput = z.infer<typeof manualPaymentSchema>

type ManualPaymentActor = {
  userId: string
  societyId: string
}

const transferModes = new Set(['BANK_TRANSFER', 'UPI'])

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

const getSubmittedReferenceValues = (input: {
  utrReference?: string | undefined
  bankReference?: string | undefined
}) => [
  ...new Set(
    [input.utrReference, input.bankReference]
      .map((reference) => reference?.trim().toLowerCase())
      .filter((reference): reference is string => Boolean(reference)),
  ),
]

export const recordManualPayment = async (
  input: ManualPaymentInput,
  actor: ManualPaymentActor,
) => {
  const bankAccountId =
    input.account && z.string().uuid().safeParse(input.account).success
      ? input.account
      : null

  if (
    transferModes.has(input.mode) &&
    !input.utrReference &&
    !input.bankReference
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'UTR or bank reference is required for transfer payments.',
    })
  }

  if (input.mode === 'BANK_TRANSFER' && !input.transferKind) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        'Select NEFT, IMPS, RTGS, or bank transfer for bank-transfer payments.',
    })
  }

  if (
    input.mode === 'CHEQUE' &&
    (!input.chequeNumber || !input.chequeDate || !input.bankName)
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        'Cheque number, cheque date, and bank name are required for cheque payments.',
    })
  }

  if (input.allowDuplicateUtr && !input.overrideReason) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        'An audit reason is required to allow duplicate reference usage.',
    })
  }

  const flat = await queryRows<{
    society_id: string
    payer_user_id: string | null
    supplied_payer_is_valid: boolean
  }>(
    `
      select
        f.society_id,
        (
          select fr.user_id
          from flat_residents fr
          where fr.flat_id = f.id and fr.is_active = true and fr.is_billing_contact = true
          order by fr.created_at asc
          limit 1
        ) as payer_user_id,
        case
          when $3::uuid is null then true
          else exists (
            select 1
            from flat_residents fr
            inner join users u on u.id = fr.user_id
            where fr.flat_id = f.id
              and fr.user_id = $3
              and fr.is_active = true
              and u.society_id = f.society_id
              and u.is_active = true
              and u.deleted_at is null
          )
        end as supplied_payer_is_valid
      from flats f
      where f.id = $1
        and f.society_id = $2
        and f.is_active = true
      limit 1
    `,
    [input.flatId, actor.societyId, input.payerUserId ?? null],
  )
  const flatRow = flat.rows[0]
  if (!flatRow) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Flat not found.',
    })
  }
  if (input.payerUserId && !flatRow.supplied_payer_is_valid) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'The selected payer is not an active resident of this flat.',
    })
  }
  const payerUserId = input.payerUserId ?? flatRow.payer_user_id
  if (!payerUserId) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Select a payer for this payment.',
    })
  }

  const referenceValues = getSubmittedReferenceValues(input)
  if (referenceValues.length > 0 && !input.allowDuplicateUtr) {
    const duplicate = await queryRows<{ id: string }>(
      `
        select id
        from payments
        where society_id = $1
          and ($3::text is null or idempotency_key is distinct from $3)
          and (
            lower(utr_reference) = any($2::text[])
            or lower(bank_reference) = any($2::text[])
            or lower(gateway_payment_id) = any($2::text[])
          )
        limit 1
      `,
      [flatRow.society_id, referenceValues, input.idempotencyKey ?? null],
    )
    if (duplicate.rows[0]) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'This UTR/reference is already linked to a payment.',
      })
    }
  }

  const previewInput = {
    flatId: input.flatId,
    amount: input.amount,
    allocationMode: input.allocationMode ?? 'OLDEST_UNPAID_FIRST',
    advanceCreditScope: input.advanceCreditScope,
    selectedDueIds: input.selectedDueIds ?? [],
    asOfDate: input.paymentDate,
  }
  const preview = await previewPaymentAllocation(
    input.tenureMonths === undefined
      ? previewInput
      : { ...previewInput, tenureMonths: input.tenureMonths },
  )
  const idempotencyFingerprint = JSON.stringify({
    societyId: flatRow.society_id,
    payerUserId,
    flatId: input.flatId,
    amount: input.amount,
    paymentDate: input.paymentDate,
    mode: input.mode,
    transferKind: input.transferKind ?? null,
    allocationMode: input.allocationMode,
    advanceCreditScope: input.advanceCreditScope ?? null,
    selectedDueIds: input.selectedDueIds,
    tenureMonths: input.tenureMonths ?? null,
    utrReference: input.utrReference ?? null,
    bankReference: input.bankReference ?? null,
    chequeNumber: input.chequeNumber ?? null,
    chequeDate: input.chequeDate ?? null,
    bankName: input.bankName ?? null,
    account: input.account ?? null,
    notes: input.notes ?? null,
    proofFilePath: input.proofFilePath ?? null,
    allowDuplicateUtr: input.allowDuplicateUtr,
    overrideReason: input.overrideReason ?? null,
  })

  const recordPaymentResult = await (async () => {
    const client = await getDatabasePool().connect()

    try {
      await client.query('begin')
      const result = await client.query<{
        id: string
        allocation_snapshot: Record<string, unknown>
      }>(
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
            allocation_snapshot,
            utr_reference,
            bank_reference,
            transfer_kind,
            is_default_utr,
            proof_file_path,
            notes,
            verified_by_user_id,
            verified_at,
            idempotency_key
          )
          values ($1, $2, $3, $4, 'VERIFIED', $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, now(), $16)
          on conflict (idempotency_key) where idempotency_key is not null do update set idempotency_key = excluded.idempotency_key
          returning id, allocation_snapshot
        `,
        [
          flatRow.society_id,
          payerUserId,
          input.flatId,
          input.mode,
          input.paymentDate,
          input.amount,
          input.allocationMode,
          JSON.stringify({
            selectedDueIds: input.selectedDueIds,
            tenureMonths: input.tenureMonths,
            advanceCreditScope: input.advanceCreditScope,
            preview,
            cheque:
              input.mode === 'CHEQUE'
                ? z.object({}).passthrough().parse({
                    chequeNumber: input.chequeNumber,
                    chequeDate: input.chequeDate,
                    bankName: input.bankName,
                  })
                : undefined,
            account: input.account,
            overrideReason: input.overrideReason,
            idempotencyFingerprint,
          }),
          input.utrReference ?? null,
          input.bankReference ?? null,
          input.transferKind ?? null,
          !input.allowDuplicateUtr,
          input.proofFilePath ?? null,
          input.notes ?? null,
          actor.userId,
          input.idempotencyKey ?? null,
        ],
      )
      const paymentRow = result.rows[0]
      if (!paymentRow) {
        throw new AppError({
          code: 'INTERNAL_ERROR',
          statusCode: 500,
          message: 'Payment creation failed.',
        })
      }
      if (
        input.idempotencyKey &&
        paymentRow.allocation_snapshot?.idempotencyFingerprint !==
          idempotencyFingerprint
      ) {
        throw new AppError({
          code: 'CONFLICT',
          statusCode: 409,
          message:
            'This idempotency key is already associated with a different payment request.',
        })
      }
      const paymentId = paymentRow.id
      await allocateMaintenancePaymentWithClient(client, paymentId)
      const receiptNumber = await assignReceiptNumberForPayment(
        client,
        paymentId,
      )
      await postMaintenanceReceiptJournal(client, {
        paymentId,
        societyId: flatRow.society_id,
        postedByUserId: actor.userId,
        bankAccountId,
      })

      await client.query('commit')

      return { paymentId, receiptNumber }
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  })()
  const { paymentId, receiptNumber } = recordPaymentResult

  try {
    await uploadReceiptPdfForPayment(paymentId)
  } catch (receiptUploadError) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        message: getErrorMessage(
          receiptUploadError,
          'Receipt PDF upload failed.',
        ),
        paymentId,
      }),
    )
  }

  try {
    await enqueueReceiptReadyNotification(paymentId)
  } catch (notificationError) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        message: getErrorMessage(
          notificationError,
          'Receipt notification enqueue failed.',
        ),
        paymentId,
      }),
    )
  }

  return { id: paymentId, receiptNumber }
}
