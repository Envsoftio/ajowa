import assert from 'node:assert/strict'
import test from 'node:test'
import { toResidentOnlinePaymentStatus } from '../server/utils/online-payments.ts'

test('a gateway-confirmed payment cannot invite another charge while AJOWA is recovering', () => {
  const status = toResidentOnlinePaymentStatus({
    payment_id: 'payment-id',
    society_id: 'society-id',
    payer_user_id: 'payer-id',
    received_for_flat_id: 'flat-id',
    status: 'INITIATED',
    amount: '16032.00',
    receipt_number: null,
    merchant_transaction_id: 'AJTEST123',
    attempt_status: 'MANUAL_REVIEW',
    gateway_success: true,
    retry_allowed: false,
    failure_code: 'PAYMENT_RECEIVED_PROCESSING',
    resident_message: null,
  })
  assert.equal(status.retryAllowed, false)
  assert.match(status.title, /Gateway paid/)
  assert.match(status.message, /Do not pay again/)
  assert.equal(status.pollAfterMs, 5000)
})

test('a background worker can assign a receipt without Nuxt runtime globals', async () => {
  Object.assign(process.env, {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    BETTER_AUTH_SECRET: 'test-secret',
    BETTER_AUTH_URL: 'https://example.test',
    APP_URL: 'https://example.test',
    QR_SECRET: 'test-qr-secret',
    SOCIETY_CODE: 'AJOWA',
    NUXT_PUBLIC_APP_URL: 'https://example.test',
    NUXT_PUBLIC_SUPABASE_URL: 'https://example.test',
    NUXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    NUXT_PUBLIC_SOCIETY_CODE: 'AJOWA',
  })
  const { assignReceiptNumberForPayment } = await import('../server/utils/payments.ts')
  const queries = []
  const client = {
    async query(sql, params) {
      queries.push({ sql, params })
      if (sql.includes('select receipt_number, society_id'))
        return { rows: [{ receipt_number: null, society_id: 'society-id' }] }
      if (sql.includes('next_yearly_sequence'))
        return { rows: [{ value: '42' }] }
      return { rows: [] }
    },
  }

  const receiptNumber = await assignReceiptNumberForPayment(client, 'payment-id')
  assert.match(receiptNumber, /^AJOWA-\d{4}-000042$/)
  assert.deepEqual(queries.at(-1).params, [
    'payment-id', receiptNumber, `receipts/${receiptNumber}.pdf`,
  ])
})
