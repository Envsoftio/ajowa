import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getAdvanceApplicableChargeType,
  getAdvanceCreditScope,
  getAdvanceCreditScopeLabel,
  isAdvanceConsumptionAllowedForDueStatus,
  isAdvanceCreditEligibleForCharge,
  resolveAdvanceCreditContext,
  wouldApplyAdvanceOutsideScope,
} from '../server/utils/payment-advance.ts'

test('does not consume advance credits against closed dues', () => {
  for (const status of ['PAID', 'WAIVED', 'CANCELLED']) {
    assert.equal(isAdvanceConsumptionAllowedForDueStatus(status), false)
  }
  for (const status of ['OPEN', 'PARTIALLY_PAID', 'OVERDUE']) {
    assert.equal(isAdvanceConsumptionAllowedForDueStatus(status), true)
  }
})

test('scopes excess from one DG Set bill to DG Set and its source period', () => {
  const result = resolveAdvanceCreditContext([
    {
      billingPeriodId: '11111111-1111-4111-8111-111111111111',
      billingPeriodChargeType: 'DG_SET',
    },
  ])

  assert.deepEqual(result, {
    applicableChargeType: 'DG_SET',
    sourceBillingPeriodId: '11111111-1111-4111-8111-111111111111',
  })
  assert.equal(
    getAdvanceCreditScopeLabel(result.applicableChargeType),
    'DG Set only',
  )
})

test('keeps a DG Set scope when a payment covers multiple DG Set periods', () => {
  const result = resolveAdvanceCreditContext([
    {
      billingPeriodId: '11111111-1111-4111-8111-111111111111',
      billingPeriodChargeType: 'DG_SET',
    },
    {
      billingPeriodId: '22222222-2222-4222-8222-222222222222',
      billingPeriodChargeType: 'DG_SET',
    },
  ])

  assert.deepEqual(result, {
    applicableChargeType: 'DG_SET',
    sourceBillingPeriodId: null,
  })
})

test('leaves mixed or non-DG excess as general advance', () => {
  const mixed = resolveAdvanceCreditContext([
    {
      billingPeriodId: '11111111-1111-4111-8111-111111111111',
      billingPeriodChargeType: 'DG_SET',
    },
    {
      billingPeriodId: '22222222-2222-4222-8222-222222222222',
      billingPeriodChargeType: 'CAM',
    },
  ])
  const camOnly = resolveAdvanceCreditContext([
    {
      billingPeriodId: '22222222-2222-4222-8222-222222222222',
      billingPeriodChargeType: 'CAM',
    },
  ])

  assert.deepEqual(mixed, {
    applicableChargeType: null,
    sourceBillingPeriodId: null,
  })
  assert.deepEqual(camOnly, {
    applicableChargeType: null,
    sourceBillingPeriodId: null,
  })
  assert.equal(getAdvanceCreditScopeLabel(null), 'Any non-DG bill')
})

test('maps explicit advance scopes to stored charge types without broadening them', () => {
  assert.equal(getAdvanceApplicableChargeType('DG_SET'), 'DG_SET')
  assert.equal(getAdvanceApplicableChargeType('CAM'), 'CAM')
  assert.equal(getAdvanceApplicableChargeType('GENERAL'), 'GENERAL')
  assert.equal(getAdvanceApplicableChargeType('ANY_BILL'), null)

  assert.equal(getAdvanceCreditScope('DG_SET'), 'DG_SET')
  assert.equal(getAdvanceCreditScope('CAM'), 'CAM')
  assert.equal(getAdvanceCreditScope('GENERAL'), 'GENERAL')
  assert.equal(getAdvanceCreditScope(null), 'ANY_BILL')

  assert.equal(getAdvanceCreditScopeLabel('CAM'), 'CAM only')
  assert.equal(getAdvanceCreditScopeLabel('GENERAL'), 'General bills only')
})

test('requires explicit DG scope before applying an advance to a DG bill', () => {
  assert.equal(isAdvanceCreditEligibleForCharge('DG_SET', 'DG_SET'), true)
  assert.equal(isAdvanceCreditEligibleForCharge(null, 'DG_SET'), false)
  assert.equal(isAdvanceCreditEligibleForCharge('GENERAL', 'DG_SET'), false)
  assert.equal(isAdvanceCreditEligibleForCharge('CAM', 'DG_SET'), false)

  assert.equal(isAdvanceCreditEligibleForCharge(null, 'CAM'), true)
  assert.equal(isAdvanceCreditEligibleForCharge('CAM', 'CAM'), true)
  assert.equal(isAdvanceCreditEligibleForCharge('DG_SET', 'CAM'), false)
})

test('keeps the full CAM, DG, and general advance eligibility matrix separate', () => {
  const scopes = [null, 'GENERAL', 'CAM', 'DG_SET']
  const expected = {
    GENERAL: new Set([null, 'GENERAL']),
    CAM: new Set([null, 'CAM']),
    DG_SET: new Set(['DG_SET']),
  }

  for (const targetChargeType of ['GENERAL', 'CAM', 'DG_SET']) {
    for (const applicableChargeType of scopes) {
      assert.equal(
        isAdvanceCreditEligibleForCharge(
          applicableChargeType,
          targetChargeType,
        ),
        expected[targetChargeType].has(applicableChargeType),
        `${String(applicableChargeType)} scope against ${targetChargeType}`,
      )
    }
  }
})

test('prevents a source advance edit from increasing allocations outside its scope', () => {
  assert.equal(
    wouldApplyAdvanceOutsideScope({
      applicableChargeType: 'DG_SET',
      previousAllocations: [],
      nextAllocations: [
        { billingPeriodChargeType: 'CAM', allocatedAmount: 1000 },
      ],
    }),
    true,
  )
  assert.equal(
    wouldApplyAdvanceOutsideScope({
      applicableChargeType: 'DG_SET',
      previousAllocations: [],
      nextAllocations: [
        { billingPeriodChargeType: 'DG_SET', allocatedAmount: 1000 },
      ],
    }),
    false,
  )
  assert.equal(
    wouldApplyAdvanceOutsideScope({
      applicableChargeType: null,
      previousAllocations: [],
      nextAllocations: [
        { billingPeriodChargeType: 'DG_SET', allocatedAmount: 1000 },
      ],
    }),
    true,
  )
})

test('preserves historical allocations but does not let them consume more scoped advance', () => {
  const previousAllocations = [
    { billingPeriodChargeType: 'CAM', allocatedAmount: 500 },
  ]

  assert.equal(
    wouldApplyAdvanceOutsideScope({
      applicableChargeType: 'DG_SET',
      previousAllocations,
      nextAllocations: previousAllocations,
    }),
    false,
  )
  assert.equal(
    wouldApplyAdvanceOutsideScope({
      applicableChargeType: 'DG_SET',
      previousAllocations,
      nextAllocations: [
        { billingPeriodChargeType: 'CAM', allocatedAmount: 500.01 },
      ],
    }),
    true,
  )
})
