import assert from 'node:assert/strict'
import test from 'node:test'
import { getDgAdvanceAllocationFields } from '../shared/dg-advance.ts'
import {
  getDgAdvanceRegisterStatePredicate,
  isDedicatedDgAdvanceAllocation,
} from '../server/utils/dg-advance.ts'
import { getAdminRoutePermission } from '../shared/auth.ts'

test('fixes dedicated DG advances to advance-only DG Set allocation', () => {
  assert.deepEqual(getDgAdvanceAllocationFields(), {
    allocationMode: 'ADVANCE_ONLY',
    advanceCreditScope: 'DG_SET',
    selectedDueIds: [],
  })
})

test('returns a fresh selected-due list for every DG advance payment', () => {
  const first = getDgAdvanceAllocationFields()
  const second = getDgAdvanceAllocationFields()

  assert.notEqual(first.selectedDueIds, second.selectedDueIds)
  assert.equal(first.advanceCreditScope, 'DG_SET')
  assert.equal(second.advanceCreditScope, 'DG_SET')
})

test('keeps the consumed-state OR condition grouped inside DG tenant filters', () => {
  assert.equal(
    getDgAdvanceRegisterStatePredicate('consumed'),
    "(rac.status = 'CONSUMED' or rac.current_balance = 0)",
  )
})

test('ignores unknown DG register states instead of widening the SQL', () => {
  assert.equal(getDgAdvanceRegisterStatePredicate('unexpected'), null)
  assert.equal(getDgAdvanceRegisterStatePredicate(undefined), null)
})

test('protects the dedicated DG Advance route with billing management permission', () => {
  assert.equal(
    getAdminRoutePermission('/admin/billing/dg-advance'),
    'billing.manage',
  )
})

test('accepts only the dedicated DG advance allocation contract', () => {
  assert.equal(
    isDedicatedDgAdvanceAllocation({
      allocationMode: 'ADVANCE_ONLY',
      advanceCreditScope: 'DG_SET',
      selectedDueIds: [],
    }),
    true,
  )

  for (const invalid of [
    {
      allocationMode: 'ADVANCE_ONLY',
      advanceCreditScope: 'CAM',
      selectedDueIds: [],
    },
    {
      allocationMode: 'OLDEST_UNPAID_FIRST',
      advanceCreditScope: 'DG_SET',
      selectedDueIds: [],
    },
    {
      allocationMode: 'ADVANCE_ONLY',
      advanceCreditScope: 'DG_SET',
      selectedDueIds: ['11111111-1111-4111-8111-111111111111'],
    },
  ]) {
    assert.equal(isDedicatedDgAdvanceAllocation(invalid), false)
  }
})
