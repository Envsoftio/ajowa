import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateTenantDepositSettlementAmounts,
  roundTenantMoney,
} from '../shared/tenant-deposit.ts'

const calculateTenantDepositSettlement = calculateTenantDepositSettlementAmounts

test('returns a full refund when the move-out inspection has no deductions', () => {
  assert.deepEqual(
    calculateTenantDepositSettlement({
      receivedAmount: 10_000,
      deductions: [],
    }),
    {
      receivedAmount: 10_000,
      damageDeductionAmount: 0,
      penaltyDeductionAmount: 0,
      totalDeductionAmount: 0,
      refundAmount: 10_000,
    },
  )
})

test('separates damage and penalty deductions and refunds only the balance', () => {
  assert.deepEqual(
    calculateTenantDepositSettlement({
      receivedAmount: 15_000,
      deductions: [
        { deductionType: 'DAMAGE', amount: 1_250.5 },
        { deductionType: 'DAMAGE', amount: 749.5 },
        { deductionType: 'PENALTY', amount: 500 },
      ],
    }),
    {
      receivedAmount: 15_000,
      damageDeductionAmount: 2_000,
      penaltyDeductionAmount: 500,
      totalDeductionAmount: 2_500,
      refundAmount: 12_500,
    },
  )
})

test('rounds all settlement values to paise without producing a residual', () => {
  const result = calculateTenantDepositSettlement({
    receivedAmount: 100.1 + 0.2,
    deductions: [
      { deductionType: 'DAMAGE', amount: 10.105 },
      { deductionType: 'PENALTY', amount: 0.1 + 0.2 },
    ],
  })

  assert.equal(result.receivedAmount, 100.3)
  assert.equal(result.damageDeductionAmount, 10.11)
  assert.equal(result.penaltyDeductionAmount, 0.3)
  assert.equal(result.totalDeductionAmount, 10.41)
  assert.equal(result.refundAmount, 89.89)
  assert.equal(
    roundTenantMoney(result.totalDeductionAmount + result.refundAmount),
    result.receivedAmount,
  )
})

test('rejects deductions greater than the posted deposit receipts', () => {
  assert.throws(
    () =>
      calculateTenantDepositSettlement({
        receivedAmount: 5_000,
        deductions: [{ deductionType: 'DAMAGE', amount: 5_000.01 }],
      }),
    /cannot exceed the amount received/i,
  )
})

test('supports a zero-money move-out without creating a negative refund', () => {
  assert.deepEqual(
    calculateTenantDepositSettlement({ receivedAmount: 0, deductions: [] }),
    {
      receivedAmount: 0,
      damageDeductionAmount: 0,
      penaltyDeductionAmount: 0,
      totalDeductionAmount: 0,
      refundAmount: 0,
    },
  )
})
