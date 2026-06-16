import { allocateMaintenancePayment, generateReceiptForPayment, verifyRazorpayWebhookSignature } from '~/server/utils/payments'
import { createApiSuccess } from '~/server/utils/api'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import type { H3Event } from 'h3'

const readRawBody = async (event: H3Event) =>
  await new Promise<string>((resolve, reject) => {
    const node = event.node
    if (!node) {
      resolve('')
      return
    }
    let body = ''
    node.req.setEncoding('utf8')
    node.req.on('data', (chunk: string) => {
      body += chunk
    })
    node.req.on('end', () => resolve(body))
    node.req.on('error', reject)
  })

export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event)
  const signature = getHeader(event, 'x-razorpay-signature') ?? ''

  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    throw new AppError({ code: 'FORBIDDEN', statusCode: 401, message: 'Invalid Razorpay signature.' })
  }

  const payload = JSON.parse(rawBody)
  const paymentEntity = payload?.payload?.payment?.entity ?? {}
  const orderId = paymentEntity.order_id
  const paymentId = paymentEntity.id
  const eventId = payload?.id ?? `${payload?.event}:${paymentId ?? orderId}`
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const webhook = await client.query<{ id: string; processed_at: string | null }>(
      `
        insert into razorpay_webhook_events (
          event_id,
          event_type,
          gateway_payment_id,
          gateway_order_id,
          signature,
          raw_payload
        )
        values ($1, $2, $3, $4, $5, $6::jsonb)
        on conflict (event_id) do update set event_id = excluded.event_id
        returning id, processed_at
      `,
      [eventId, payload?.event ?? 'unknown', paymentId ?? null, orderId ?? null, signature, JSON.stringify(payload)],
    )

    if (webhook.rows[0]?.processed_at) {
      await client.query('commit')
      return createApiSuccess(event, { duplicate: true })
    }

    if (payload?.event === 'payment.captured' && orderId && paymentId) {
      const payment = await client.query<{ id: string }>(
        `
          update payments
          set
            gateway_payment_id = $2,
            gateway_webhook_event_id = $3,
            status = 'VERIFIED',
            verified_at = now()
          where gateway_order_id = $1
          returning id
        `,
        [orderId, paymentId, eventId],
      )
      await client.query(
        `update razorpay_webhook_events set processed_at = now() where event_id = $1`,
        [eventId],
      )
      await client.query('commit')

      const localPaymentId = payment.rows[0]?.id
      if (localPaymentId) {
        await allocateMaintenancePayment(localPaymentId)
        await generateReceiptForPayment(localPaymentId)
      }
      return createApiSuccess(event, { processed: true, paymentId: localPaymentId ?? null })
    }

    await client.query(`update razorpay_webhook_events set processed_at = now() where event_id = $1`, [eventId])
    await client.query('commit')
    return createApiSuccess(event, { processed: true, ignored: true })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
