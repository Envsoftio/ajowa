import assert from 'node:assert/strict'
import test from 'node:test'
import { selectCurrentQrBillingPeriodId } from '../shared/qr-access.ts'

const period = (overrides) => ({
  id: 'period',
  chargeType: 'CAM',
  startDate: '2026-07-01',
  endDate: '2026-09-30',
  hasGeneratedDues: true,
  ...overrides,
})

test('selects an active CAM period with dues over a newer overlapping empty period', () => {
  assert.equal(
    selectCurrentQrBillingPeriodId([
      period({
        id: 'empty-august',
        startDate: '2026-08-01',
        endDate: '2026-10-31',
        hasGeneratedDues: false,
      }),
      period({ id: 'generated-july' }),
    ]),
    'generated-july',
  )
})

test('keeps the latest CAM period when competing periods both have dues', () => {
  assert.equal(
    selectCurrentQrBillingPeriodId([
      period({ id: 'july' }),
      period({
        id: 'august',
        startDate: '2026-08-01',
        endDate: '2026-10-31',
      }),
    ]),
    'august',
  )
})

test('falls back to the latest active CAM period when none have dues', () => {
  assert.equal(
    selectCurrentQrBillingPeriodId([
      period({ id: 'july', hasGeneratedDues: false }),
      period({
        id: 'august',
        startDate: '2026-08-01',
        endDate: '2026-10-31',
        hasGeneratedDues: false,
      }),
    ]),
    'august',
  )
})

test('continues to prefer CAM over other active charge types', () => {
  assert.equal(
    selectCurrentQrBillingPeriodId([
      period({ id: 'cam', hasGeneratedDues: false }),
      period({ id: 'dg', chargeType: 'DG_SET' }),
    ]),
    'cam',
  )
})

test('returns null when there is no active billing period candidate', () => {
  assert.equal(selectCurrentQrBillingPeriodId([]), null)
})
