import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  disabledDgLateFeePolicy,
  resolveEffectiveLateFeePolicy,
} from '../shared/dg-late-fee.ts'

test('keeps DG late fees disabled by default', () => {
  assert.deepEqual(
    resolveEffectiveLateFeePolicy({
      chargeType: 'DG_SET',
      graceDays: 10,
      lateFeePerDay: 50,
    }),
    { graceDays: 0, lateFeePerDay: 0 },
  )
})

test('wires the zero DG fee into due computation while DG fees are disabled', async () => {
  const source = await readFile(
    new URL('../server/utils/billing.ts', import.meta.url),
    'utf8',
  )
  const dgAwareStart = source.indexOf(
    'export const computeDgAwareBillingDueAmounts',
  )
  const displayStart = source.indexOf(
    'export const resolveBillingDueAmountsForDisplay',
  )
  const originalCalculator = source.slice(
    source.indexOf('export const computeBillingDueAmounts'),
    dgAwareStart,
  )
  const dgCalculator = source.slice(dgAwareStart, displayStart)

  assert.doesNotMatch(originalCalculator, /DG_SET|dgLateFeePolicy/)
  assert.match(
    dgCalculator,
    /if \(due\.billingPeriodChargeType !== 'DG_SET'\) \{\s*return computeBillingDueAmounts\(due, today, graceDays, lateFeePerDay\)/,
  )
  assert.match(dgCalculator, /resolveEffectiveLateFeePolicy\(/)
  assert.match(
    dgCalculator,
    /effectivePolicy\.graceDays,\s*effectivePolicy\.lateFeePerDay,/,
  )
})

test('applies the configured DG grace period and daily fee only when enabled', () => {
  assert.deepEqual(
    resolveEffectiveLateFeePolicy({
      chargeType: 'DG_SET',
      graceDays: 10,
      lateFeePerDay: 50,
      dgPolicy: {
        dgLateFeeEnabled: true,
        dgGraceDays: 2,
        dgLateFeePerDay: 25,
      },
    }),
    { graceDays: 2, lateFeePerDay: 25 },
  )
})

test('publishes a safe disabled DG late-fee policy by default', () => {
  assert.deepEqual(disabledDgLateFeePolicy, {
    dgLateFeeEnabled: false,
    dgGraceDays: 0,
    dgLateFeePerDay: 0,
  })
})

test('does not change the general and CAM late-fee policy', () => {
  for (const chargeType of ['GENERAL', 'CAM']) {
    assert.deepEqual(
      resolveEffectiveLateFeePolicy({
        chargeType,
        graceDays: 3,
        lateFeePerDay: 50,
      }),
      { graceDays: 3, lateFeePerDay: 50 },
    )
  }
})

test('preserves the historical CAM payment-policy fallbacks', async () => {
  const source = await readFile(
    new URL('../server/utils/payments.ts', import.meta.url),
    'utf8',
  )

  assert.match(source, /settings\.graceDays \?\? 0/)
  assert.match(source, /settings\.lateFeePerDay \?\? 0/)
})

test('keeps the DG advance refresh path on the DG-specific policy', async () => {
  const source = await readFile(
    new URL('../server/utils/payments.ts', import.meta.url),
    'utf8',
  )

  assert.match(
    source,
    /refreshDueTotals\(\s*client,\s*dueId,\s*policy\.graceDays,\s*policy\.lateFeePerDay,\s*policy,\s*settlementDate,/s,
  )
})

test('repairs only DG late fees for societies where the feature is disabled', async () => {
  const migration = await readFile(
    new URL(
      '../supabase/migrations/20260803123000_repair_disabled_dg_late_fees.sql',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(migration, /bp\.charge_type = 'DG_SET'/)
  assert.match(migration, /settings->'dgLateFeeEnabled'/)
  assert.match(migration, /late_fee_amount = 0/)
  assert.match(
    migration,
    /balance_amount = greatest\(\s*md\.base_amount - md\.waived_amount - md\.paid_amount,\s*0\s*\)/s,
  )
})
