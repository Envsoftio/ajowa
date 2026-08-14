import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  buildEasebuzzEventFingerprint,
  buildEasebuzzInitiateHash,
  buildEasebuzzReverseHash,
  buildOnlinePaymentRequestFingerprint,
  canonicalizeEasebuzzAmount,
  decryptEasebuzzAccessKey,
  encryptEasebuzzAccessKey,
  extractEasebuzzTransaction,
  normalizeEasebuzzStatus,
  parseEasebuzzPaidAt,
  redactEasebuzzPayload,
  verifyEasebuzzReverseHash,
} from '../server/utils/easebuzz.ts'

const sha512 = (value) =>
  createHash('sha512').update(value, 'utf8').digest('hex')

const fixture = {
  key: 'merchant-key',
  txnid: 'AJTEST123',
  amount: '125.50',
  productinfo: 'AJOWA Maintenance',
  firstname: 'Resident One',
  email: 'resident@example.test',
  udf1: '11111111-1111-4111-8111-111111111111',
  udf2: '22222222-2222-4222-8222-222222222222',
  udf3: '',
  udf4: '',
  udf5: '',
  udf6: '',
  udf7: '',
  udf8: '',
  udf9: '',
  udf10: '',
}

test('matches the documented Easebuzz initiation field order including empty UDFs', () => {
  const source = [
    fixture.key,
    fixture.txnid,
    fixture.amount,
    fixture.productinfo,
    fixture.firstname,
    fixture.email,
    fixture.udf1,
    fixture.udf2,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'merchant-salt',
  ].join('|')
  assert.equal(
    buildEasebuzzInitiateHash(fixture, 'merchant-salt'),
    sha512(source),
  )
})

test('validates the documented reverse hash and rejects tampering', () => {
  const payload = { ...fixture, status: 'success', easepayid: 'EASE123' }
  payload.hash = buildEasebuzzReverseHash(payload, 'merchant-salt')
  assert.equal(verifyEasebuzzReverseHash(payload, 'merchant-salt'), true)
  assert.equal(
    verifyEasebuzzReverseHash(
      { ...payload, amount: '125.51' },
      'merchant-salt',
    ),
    false,
  )
  assert.equal(
    verifyEasebuzzReverseHash({ ...payload, hash: 'bad' }, 'merchant-salt'),
    false,
  )
})

test('normalizes only explicitly supported gateway states', () => {
  assert.equal(normalizeEasebuzzStatus('success'), 'SUCCESS')
  assert.equal(normalizeEasebuzzStatus('user_cancelled'), 'CANCELLED')
  assert.equal(normalizeEasebuzzStatus('pending'), 'PENDING')
  assert.equal(normalizeEasebuzzStatus('refund_pending'), 'REFUND_REVIEW')
  assert.equal(normalizeEasebuzzStatus('unexpected-new-state'), 'UNKNOWN')
})

test('extracts Transaction V2 decline details from the Easebuzz msg wrapper', () => {
  assert.deepEqual(
    extractEasebuzzTransaction({
      status: true,
      msg: {
        txnid: 'AJDECLINED123',
        easepayid: 'EASE123',
        amount: 14138,
        status: 'failure',
        error: 'Transaction has failed.',
      },
    }),
    {
      txnid: 'AJDECLINED123',
      easepayid: 'EASE123',
      amount: '14138',
      status: 'failure',
      error: 'Transaction has failed.',
    },
  )
})

test('does not treat a Transaction V2 response wrapper as a transaction', () => {
  assert.equal(
    extractEasebuzzTransaction({ status: false, msg: 'Transaction not found' }),
    null,
  )
})

test('canonicalizes INR amounts and rejects invalid payment values', () => {
  assert.equal(canonicalizeEasebuzzAmount(125.5), '125.50')
  assert.throws(() => canonicalizeEasebuzzAmount(0))
  assert.throws(() => canonicalizeEasebuzzAmount('not-a-number'))
})

test('parses Easebuzz paid timestamps as India time and rejects invalid dates', () => {
  assert.equal(
    parseEasebuzzPaidAt({ addedon: '2026-08-12 10:30:00' }),
    '2026-08-12T05:00:00.000Z',
  )
  assert.equal(parseEasebuzzPaidAt({ addedon: 'invalid' }), null)
})

test('payment intent fingerprints are stable across due ordering but change with value', () => {
  const input = {
    societyId: 'society',
    payerUserId: 'payer',
    flatId: 'flat',
    chargeType: 'GENERAL',
    amount: 125.5,
    allocationMode: 'SELECTED_PERIODS',
    selectedDueIds: ['due-b', 'due-a'],
  }
  assert.equal(
    buildOnlinePaymentRequestFingerprint(input),
    buildOnlinePaymentRequestFingerprint({
      ...input,
      selectedDueIds: ['due-a', 'due-b'],
    }),
  )
  assert.notEqual(
    buildOnlinePaymentRequestFingerprint(input),
    buildOnlinePaymentRequestFingerprint({ ...input, amount: 126 }),
  )
  assert.notEqual(
    buildOnlinePaymentRequestFingerprint(input),
    buildOnlinePaymentRequestFingerprint({ ...input, chargeType: 'CAM' }),
  )
})

test('event fingerprints separate callbacks from webhooks and redact personal data', () => {
  const payload = { ...fixture, status: 'success', phone: '9999999999' }
  const callback = buildEasebuzzEventFingerprint({
    eventKind: 'CALLBACK',
    payload,
    payloadHash: 'a'.repeat(64),
  })
  const webhook = buildEasebuzzEventFingerprint({
    eventKind: 'WEBHOOK',
    payload,
    payloadHash: 'a'.repeat(64),
  })
  assert.notEqual(callback, webhook)
  assert.equal(redactEasebuzzPayload(payload).phone, '[REDACTED]')
  assert.equal(
    redactEasebuzzPayload({ ...payload, hash: 'secret' }).hash,
    '[REDACTED]',
  )
})

test('access keys are encrypted at rest and authenticated against tampering', () => {
  const encrypted = encryptEasebuzzAccessKey(
    'a'.repeat(64),
    'application-secret',
  )
  assert.equal(encrypted.includes('a'.repeat(64)), false)
  assert.equal(
    decryptEasebuzzAccessKey(encrypted, 'application-secret'),
    'a'.repeat(64),
  )
  assert.equal(
    decryptEasebuzzAccessKey(`${encrypted}x`, 'application-secret'),
    null,
  )
  assert.equal(decryptEasebuzzAccessKey(encrypted, 'wrong-secret'), null)
})

test('reconciles an older active attempt before blocking a new checkout', async () => {
  const source = await readFile(
    new URL('../server/utils/online-payments.ts', import.meta.url),
    'utf8',
  )

  assert.match(
    source,
    /await reconcileBlockingOnlinePaymentAttempt\([\s\S]*const preview = await previewPaymentAllocation/,
  )
  assert.match(
    source,
    /await retrieveAndApplyOnlinePayment\(attempt\.id\)/,
  )
  assert.match(source, /paymentId: blocked\.id/)
  assert.match(source, /retryAllowed: false/)
})

test('persists authoritative decline and cancellation as retry-safe terminal states', async () => {
  const source = await readFile(
    new URL('../server/utils/online-payments.ts', import.meta.url),
    'utf8',
  )

  assert.match(source, /'PAYMENT_DECLINED' : 'PAYMENT_CANCELLED'/)
  assert.match(source, /retry_allowed = true/)
  assert.match(source, /next_reconciliation_at = null/)
  assert.match(
    source,
    /for update of attempt, payment[\s\S]*update payment_gateway_attempts[\s\S]*update payments set status = \$2[\s\S]*await client\.query\('commit'\)/,
  )
  assert.match(
    source,
    /status not in \('VERIFIED', 'FAILED', 'CANCELLED'\)/,
  )
})

test('admin payments render gateway references separately from manual proof and UTR fields', async () => {
  const listApi = await readFile(
    new URL('../server/api/payments/index.get.ts', import.meta.url),
    'utf8',
  )
  const detailApi = await readFile(
    new URL('../server/api/payments/[id].get.ts', import.meta.url),
    'utf8',
  )
  const page = await readFile(
    new URL('../pages/admin/payments/index.vue', import.meta.url),
    'utf8',
  )
  const payments = await readFile(
    new URL('../server/utils/payments.ts', import.meta.url),
    'utf8',
  )

  assert.match(listApi, /as "gatewayTransactionId"/)
  assert.match(listApi, /as "gatewayPaymentId"/)
  assert.match(listApi, /as "gatewayStatus"/)
  assert.match(detailApi, /attempt\.merchant_transaction_id as gateway_transaction_id/)
  assert.match(page, /Easebuzz payment ID/)
  assert.match(page, /Bank reference/)
  assert.match(page, /Verified gateway fields are read-only/)
  assert.match(page, /class="gateway-detail-grid"/)
  assert.match(page, /overflow-wrap: anywhere/)
  assert.match(
    page,
    /const openPaymentView = \(payment: PaymentSummary\) =>\s*isOnlineGatewayPayment\(payment\)\s*\? openPaymentEdit\(payment\)\s*: openDetail\(payment\)/,
  )
  assert.match(page, /@click="openPaymentView\(row\)"/)
  assert.match(
    page,
    /!isOnlineGatewayPayment\(row\) && row\.proofFilePath/,
  )
  assert.match(
    page,
    /v-if="!isOnlineGatewayEdit" class="admin-form-section"/,
  )
  assert.match(payments, /Only manually recorded payments can be edited\./)
  assert.match(
    payments,
    /paymentModeSchema\.exclude\(\['ONLINE_GATEWAY', 'ADVANCE_CREDIT'\]\)/,
  )
})
