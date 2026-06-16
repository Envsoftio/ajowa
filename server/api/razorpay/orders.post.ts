import Razorpay from 'razorpay'
import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import { getValidatedRuntimeConfig } from '~/server/utils/env'
import { getDatabasePool, queryRows } from '~/server/utils/database'
import { paymentPreviewSchema, previewPaymentAllocation } from '~/server/utils/payments'
import { AppError } from '~/server/utils/errors'

const schema = paymentPreviewSchema.extend({
  idempotencyKey: z.string().trim().min(8).max(160),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const input = validateInput(schema, await readJsonBody(event))
  const hasFlatAccess = authMe.flatAccess.some((flat) => flat.flatId === input.flatId)

  if (!hasFlatAccess) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'You can only create payment orders for your linked flats.',
    })
  }

  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())
  const previewInput = {
    flatId: input.flatId,
    amount: input.amount,
    allocationMode: input.allocationMode ?? 'OLDEST_UNPAID_FIRST',
    selectedDueIds: input.selectedDueIds ?? [],
  }
  const preview = await previewPaymentAllocation(
    input.tenureMonths === undefined ? previewInput : { ...previewInput, tenureMonths: input.tenureMonths },
  )
  const flat = await queryRows<{ society_id: string }>(
    `select society_id from flats where id = $1 limit 1`,
    [input.flatId],
  )
  const societyId = flat.rows[0]?.society_id
  if (!societyId) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Flat not found.' })
  }

  const razorpay = new Razorpay({
    key_id: runtimeConfig.razorpayKeyId,
    key_secret: runtimeConfig.razorpayKeySecret,
  })
  const order = await razorpay.orders.create({
    amount: Math.round(input.amount * 100),
    currency: 'INR',
    receipt: input.idempotencyKey,
    notes: {
      flatId: input.flatId,
      userId: authMe.user.id,
    },
  })

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
          gateway_order_id,
          idempotency_key,
          allocation_mode,
          allocation_snapshot
        )
        values ($1, $2, $3, 'ONLINE_GATEWAY', 'INITIATED', current_date, $4, $5, $6, $7, $8::jsonb)
        on conflict (idempotency_key) where idempotency_key is not null do update set idempotency_key = excluded.idempotency_key
        returning id
      `,
      [
        societyId,
        authMe.user.id,
        input.flatId,
        input.amount,
        order.id,
        input.idempotencyKey,
        input.allocationMode ?? 'OLDEST_UNPAID_FIRST',
        JSON.stringify({
          selectedDueIds: input.selectedDueIds,
          tenureMonths: input.tenureMonths,
          preview,
          gatewayOrder: order,
        }),
      ],
    )
    await client.query('commit')

    return createApiSuccess(event, {
      paymentId: result.rows[0]?.id,
      orderId: order.id,
      keyId: runtimeConfig.razorpayKeyId,
      amount: order.amount,
      currency: order.currency,
      allocationPreview: preview,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
