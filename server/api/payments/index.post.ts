import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool, queryRows } from '~/server/utils/database'
import {
  allocateMaintenancePayment,
  generateReceiptForPayment,
  manualPaymentSchema,
  previewPaymentAllocation,
} from '~/server/utils/payments'
import { AppError } from '~/server/utils/errors'

const transferModes = new Set(['BANK_TRANSFER', 'UPI'])

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const input = validateInput(manualPaymentSchema, await readJsonBody(event))

  if (transferModes.has(input.mode) && !input.utrReference && !input.bankReference) {
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
      message: 'Select NEFT, IMPS, RTGS, or bank transfer for bank-transfer payments.',
    })
  }

  if (input.mode === 'CHEQUE' && (!input.chequeNumber || !input.chequeDate || !input.bankName)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Cheque number, cheque date, and bank name are required for cheque payments.',
    })
  }

  if ((input.utrReference || input.bankReference) && !input.allowDuplicateUtr) {
    const duplicate = await queryRows<{ id: string }>(
      `
        select id
        from payments
        where lower(coalesce(utr_reference, '')) = lower($1)
           or lower(coalesce(bank_reference, '')) = lower($2)
        limit 1
      `,
      [input.utrReference ?? '', input.bankReference ?? ''],
    )
    if (duplicate.rows[0]) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'This UTR/reference is already linked to a payment.',
      })
    }
  } else if (input.allowDuplicateUtr && !input.overrideReason) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'An audit reason is required to allow duplicate reference usage.',
    })
  }

  const flat = await queryRows<{ society_id: string; payer_user_id: string | null }>(
    `
      select
        f.society_id,
        (
          select fr.user_id
          from flat_residents fr
          where fr.flat_id = f.id and fr.is_active = true and fr.is_billing_contact = true
          order by fr.created_at asc
          limit 1
        ) as payer_user_id
      from flats f
      where f.id = $1
      limit 1
    `,
    [input.flatId],
  )
  const flatRow = flat.rows[0]
  if (!flatRow) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Flat not found.' })
  }
  const payerUserId = input.payerUserId ?? flatRow.payer_user_id
  if (!payerUserId) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Select a payer for this payment.',
    })
  }

  const previewInput = {
    flatId: input.flatId,
    amount: input.amount,
    allocationMode: input.allocationMode ?? 'OLDEST_UNPAID_FIRST',
    selectedDueIds: input.selectedDueIds ?? [],
  }
  const preview = await previewPaymentAllocation(
    input.tenureMonths === undefined ? previewInput : { ...previewInput, tenureMonths: input.tenureMonths },
  )

  const client = await getDatabasePool().connect()
  try {
    await client.query('begin')
    const result = await client.query<{ id: string }>(
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
        returning id
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
          preview,
          cheque: input.mode === 'CHEQUE' ? z.object({}).passthrough().parse({
            chequeNumber: input.chequeNumber,
            chequeDate: input.chequeDate,
            bankName: input.bankName,
          }) : undefined,
          account: input.account,
          overrideReason: input.overrideReason,
        }),
        input.utrReference ?? null,
        input.bankReference ?? null,
        input.transferKind ?? null,
        !input.allowDuplicateUtr,
        input.proofFilePath ?? null,
        input.notes ?? null,
        authMe.user.id,
        input.idempotencyKey ?? null,
      ],
    )
    await client.query('commit')
    const paymentId = result.rows[0]?.id
    if (!paymentId) {
      throw new AppError({ code: 'INTERNAL_ERROR', statusCode: 500, message: 'Payment creation failed.' })
    }
    await allocateMaintenancePayment(paymentId)
    const receiptNumber = await generateReceiptForPayment(paymentId)

    return createApiSuccess(event, { id: paymentId, receiptNumber })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
