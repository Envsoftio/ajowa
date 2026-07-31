import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getAdvanceCreditScopeLabel,
  resolveAdvanceCreditContext,
} from '../server/utils/payment-advance.ts'

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
  assert.equal(getAdvanceCreditScopeLabel(null), 'Any bill')
})
