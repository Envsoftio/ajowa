import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  buildDgBalanceSummary,
  buildDgDueStatementSummary,
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

test('shows previous and current DG balances once in the statement payable', () => {
  assert.deepEqual(
    buildDgDueStatementSummary({
      currentChargeAmount: 435,
      currentBalanceAmount: 435,
      previousOutstandingAmount: 406,
      advanceAppliedAmount: 0,
      availableAdvanceAmount: 0,
    }),
    {
      currentChargeAmount: 435,
      currentBalanceAmount: 435,
      previousOutstandingAmount: 406,
      combinedPayableAmount: 841,
      advanceAppliedAmount: 0,
      availableAdvanceAmount: 0,
    },
  )
})

test('does not deduct an unapplied DG advance or an applied advance twice', () => {
  assert.deepEqual(
    buildDgDueStatementSummary({
      currentChargeAmount: 900,
      currentBalanceAmount: 0,
      previousOutstandingAmount: 100,
      advanceAppliedAmount: 900,
      availableAdvanceAmount: 425,
    }),
    {
      currentChargeAmount: 900,
      currentBalanceAmount: 0,
      previousOutstandingAmount: 100,
      combinedPayableAmount: 100,
      advanceAppliedAmount: 900,
      availableAdvanceAmount: 425,
    },
  )

  const unapplied = buildDgDueStatementSummary({
    currentChargeAmount: 435,
    currentBalanceAmount: 435,
    previousOutstandingAmount: 406,
    advanceAppliedAmount: 0,
    availableAdvanceAmount: 1_000,
  })
  assert.equal(unapplied.combinedPayableAmount, 841)
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

test('keeps generated DG bills out of the carried-forward balance register', async () => {
  const source = await readFile(
    new URL(
      '../server/api/admin/billing/dg-balances/index.get.ts',
      import.meta.url,
    ),
    'utf8',
  )
  const openingBalanceFilters =
    source.match(/md\.origin = 'DG_OPENING_BALANCE'/g) ?? []

  assert.ok(openingBalanceFilters.length >= 3)
})
