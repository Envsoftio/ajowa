import assert from 'node:assert/strict'
import test from 'node:test'
import { takeTenureBills } from '../server/utils/payments.ts'

test('a late-fee-only bill does not use up the tenure bill limit', () => {
  const dues = [
    { id: 'previous-quarter', computedBalance: 150, computedLateFee: 150 },
    { id: 'current-quarter', computedBalance: 17762, computedLateFee: 650 },
    { id: 'next-quarter', computedBalance: 17112, computedLateFee: 0 },
  ]

  assert.deepEqual(
    takeTenureBills(dues, 1).map((due) => due.id),
    ['previous-quarter', 'current-quarter'],
  )
})

test('a principal-bearing bill uses one tenure slot', () => {
  const dues = [
    { id: 'first', computedBalance: 5704, computedLateFee: 0 },
    { id: 'second', computedBalance: 5704, computedLateFee: 0 },
  ]

  assert.deepEqual(takeTenureBills(dues, 1).map((due) => due.id), ['first'])
})
