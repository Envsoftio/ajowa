import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dgAdvanceClassificationSchema,
  getDgAdvanceClassificationEligibility,
} from '../shared/dg-advance-classification.ts'

const eligibleCredit = {
  paymentStatus: 'VERIFIED',
  paymentMode: 'BANK_TRANSFER',
  sourceCreditCount: 1,
  creditStatus: 'ACTIVE',
  originalAmount: '1250.50',
  currentBalance: '1250.50',
  applicableChargeType: null,
  dependentHistoryCount: 0,
}

test('allows only a verified, non-synthetic, fully unused unclassified credit', () => {
  assert.deepEqual(getDgAdvanceClassificationEligibility(eligibleCredit), {
    eligible: true,
  })
})

test('rejects ambiguous and synthetic source credits', () => {
  assert.equal(
    getDgAdvanceClassificationEligibility({
      ...eligibleCredit,
      paymentMode: 'ADVANCE_CREDIT',
    }).eligible,
    false,
  )
  assert.equal(
    getDgAdvanceClassificationEligibility({
      ...eligibleCredit,
      sourceCreditCount: 2,
    }).eligible,
    false,
  )
  assert.equal(
    getDgAdvanceClassificationEligibility({
      ...eligibleCredit,
      paymentStatus: 'PENDING',
    }).eligible,
    false,
  )
})

test('rejects used, inactive, scoped, or dependent credits', () => {
  for (const input of [
    { ...eligibleCredit, currentBalance: '1200.50' },
    { ...eligibleCredit, creditStatus: 'CONSUMED' },
    { ...eligibleCredit, applicableChargeType: 'CAM' },
    { ...eligibleCredit, applicableChargeType: 'DG_SET' },
    { ...eligibleCredit, dependentHistoryCount: 1 },
  ]) {
    assert.equal(getDgAdvanceClassificationEligibility(input).eligible, false)
  }
})

test('requires a meaningful, bounded audit reason', () => {
  assert.deepEqual(dgAdvanceClassificationSchema.parse({ reason: '  DG receipt  ' }), {
    reason: 'DG receipt',
  })
  assert.equal(dgAdvanceClassificationSchema.safeParse({ reason: 'DG' }).success, false)
  assert.equal(
    dgAdvanceClassificationSchema.safeParse({ reason: 'x'.repeat(501) }).success,
    false,
  )
})
