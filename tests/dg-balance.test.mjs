import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDgBalanceSummary,
  getDgBalanceStatePredicate,
} from '../shared/dg-balance.ts'
import { getAdminRoutePermission } from '../shared/auth.ts'

test('reconciles DG receivables and keeps available advances visible separately', () => {
  assert.deepEqual(
    buildDgBalanceSummary({
      principalAmount: 2_000,
      interestAmount: 100,
      lateFeeAmount: 50,
      totalBilledAmount: 2_150,
      cashPaidAmount: 400,
      advanceAppliedAmount: 600,
      waivedAmount: 50,
      outstandingAmount: 1_100,
      availableAdvanceAmount: 250,
    }),
    {
      principalAmount: 2_000,
      interestAmount: 100,
      lateFeeAmount: 50,
      totalBilledAmount: 2_150,
      cashPaidAmount: 400,
      advanceAppliedAmount: 600,
      waivedAmount: 50,
      outstandingAmount: 1_100,
      availableAdvanceAmount: 250,
      netPositionAmount: 850,
    },
  )
})

test('never presents a negative DG net payable when advance exceeds dues', () => {
  const summary = buildDgBalanceSummary({
    principalAmount: 900,
    interestAmount: 0,
    lateFeeAmount: 0,
    totalBilledAmount: 900,
    cashPaidAmount: 0,
    advanceAppliedAmount: 900,
    waivedAmount: 0,
    outstandingAmount: 0,
    availableAdvanceAmount: 100,
  })

  assert.equal(summary.netPositionAmount, 0)
  assert.equal(summary.availableAdvanceAmount, 100)
})

test('maps DG balance register filters to bounded SQL predicates', () => {
  assert.equal(
    getDgBalanceStatePredicate('outstanding'),
    'md.balance_amount > 0',
  )
  assert.equal(getDgBalanceStatePredicate('settled'), 'md.balance_amount = 0')
  assert.equal(
    getDgBalanceStatePredicate('opening'),
    "md.origin = 'DG_OPENING_BALANCE'",
  )
  assert.equal(getDgBalanceStatePredicate('unexpected'), null)
})

test('protects DG balances with billing management permission', () => {
  assert.equal(
    getAdminRoutePermission('/admin/billing/dg-balances'),
    'billing.manage',
  )
})
