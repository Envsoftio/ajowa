import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getResidentLedgerEntryLabel,
  getResidentLedgerReceiptAmount,
  isSyntheticAdvanceApplication,
} from '../server/utils/payment-reporting.ts'

test('does not count an internal advance application as new money received', () => {
  assert.equal(isSyntheticAdvanceApplication('ADVANCE_CREDIT'), true)
  assert.equal(
    getResidentLedgerReceiptAmount({
      paymentAmount: 750,
      paymentMode: 'ADVANCE_CREDIT',
      alreadyCounted: false,
    }),
    0,
  )
  assert.equal(getResidentLedgerEntryLabel('ADVANCE_CREDIT'), 'Advance applied')
})

test('counts an external receipt once when it has multiple allocations', () => {
  assert.equal(
    getResidentLedgerReceiptAmount({
      paymentAmount: 1_000,
      paymentMode: 'BANK_TRANSFER',
      alreadyCounted: false,
    }),
    1_000,
  )
  assert.equal(
    getResidentLedgerReceiptAmount({
      paymentAmount: 1_000,
      paymentMode: 'BANK_TRANSFER',
      alreadyCounted: true,
    }),
    0,
  )
  assert.equal(getResidentLedgerEntryLabel('BANK_TRANSFER'), 'BANK TRANSFER')
})
