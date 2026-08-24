import assert from 'node:assert/strict'
import test from 'node:test'

import { buildMaintenanceBillNumber } from '../server/utils/billing.ts'

const due = {
  society_code: 'AJOWA',
  period_start_date: '2026-06-01',
  invoice_sequence_number: '42',
}

test('invoice number uses the immutable due serial instead of the flat number', () => {
  assert.equal(
    buildMaintenanceBillNumber(due, 'CAM'),
    'AJOWA-BILL-202606-CAM-000042',
  )
})

test('CAM and DG documents for the same due have distinct invoice numbers', () => {
  assert.notEqual(
    buildMaintenanceBillNumber(due, 'CAM'),
    buildMaintenanceBillNumber(due, 'DG'),
  )
  assert.equal(
    buildMaintenanceBillNumber(due, 'DG'),
    'AJOWA-BILL-202606-DG-000042',
  )
})

test('different dues cannot share an invoice number when flat labels change', () => {
  assert.notEqual(
    buildMaintenanceBillNumber(due, 'CAM'),
    buildMaintenanceBillNumber({ ...due, invoice_sequence_number: '43' }, 'CAM'),
  )
})
