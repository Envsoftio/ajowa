import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BILL_NOTIFICATION_REQUEST_BATCH_SIZE,
  DG_DUE_GENERATION_BATCH_SIZE,
  chunkBillingRequestIds,
  getAdvanceConsumptionDueTargets,
  getDueGenerationFlatIdBatches,
} from '../shared/billing.ts'

test('keeps DG due generation below the production timeout batch size', () => {
  assert.equal(DG_DUE_GENERATION_BATCH_SIZE, 10)
  assert.ok(DG_DUE_GENERATION_BATCH_SIZE < 40)
})

test('keeps notification requests within the server queue limit', () => {
  assert.equal(BILL_NOTIFICATION_REQUEST_BATCH_SIZE, 40)
})

test('routes DG generation through explicit batches of at most ten flats', () => {
  const selectedFlatIds = Array.from({ length: 23 }, (_, index) => `selected-${index + 1}`)
  const batches = getDueGenerationFlatIdBatches({
    chargeType: 'DG_SET',
    selectedFlatIds,
    availableFlatIds: ['unused-available-flat'],
  })

  assert.deepEqual(batches.map((batch) => batch?.length), [10, 10, 3])
  assert.deepEqual(batches.flat(), selectedFlatIds)
})

test('routes all-flat DG generation through explicit flat ID batches', () => {
  const availableFlatIds = Array.from({ length: 11 }, (_, index) => `available-${index + 1}`)
  const batches = getDueGenerationFlatIdBatches({
    chargeType: 'DG_SET',
    selectedFlatIds: [],
    availableFlatIds,
  })

  assert.deepEqual(batches, [availableFlatIds.slice(0, 10), availableFlatIds.slice(10)])
  assert.ok(batches.every((batch) => Array.isArray(batch)))
})

test('does not create an implicit all-flat DG request when no target IDs exist', () => {
  assert.deepEqual(
    getDueGenerationFlatIdBatches({
      chargeType: 'DG_SET',
      selectedFlatIds: [],
      availableFlatIds: [],
    }),
    [],
  )
})

test('keeps selected CAM and general generation in one request', () => {
  const selectedFlatIds = Array.from({ length: 23 }, (_, index) => `selected-${index + 1}`)

  for (const chargeType of ['CAM', 'GENERAL']) {
    assert.deepEqual(
      getDueGenerationFlatIdBatches({
        chargeType,
        selectedFlatIds,
        availableFlatIds: ['unused-available-flat'],
      }),
      [selectedFlatIds],
    )
  }
})

test('keeps all-flat CAM and general generation as one unfiltered request', () => {
  for (const chargeType of ['CAM', 'GENERAL']) {
    assert.deepEqual(
      getDueGenerationFlatIdBatches({
        chargeType,
        selectedFlatIds: [],
        availableFlatIds: ['available-1', 'available-2'],
      }),
      [undefined],
    )
  }
})

test('rejects invalid billing request batch sizes', () => {
  assert.throws(
    () => chunkBillingRequestIds(['flat-1'], 0),
    /positive integer/,
  )
})

test('lets a DG retry apply scoped advance to an existing due without changing CAM retries', () => {
  const generatedDues = [
    { dueId: 'due-new', flatId: 'flat-new' },
  ]
  const skippedDues = [
    { dueId: 'due-existing', flatId: 'flat-existing' },
  ]

  assert.deepEqual(
    getAdvanceConsumptionDueTargets({
      chargeType: 'DG_SET',
      generatedDues,
      skippedDues,
    }),
    [...generatedDues, ...skippedDues],
  )
  assert.deepEqual(
    getAdvanceConsumptionDueTargets({
      chargeType: 'CAM',
      generatedDues,
      skippedDues,
    }),
    generatedDues,
  )
})

test('deduplicates DG retry targets before consuming advances', () => {
  const due = { dueId: 'due-1', flatId: 'flat-1' }

  assert.deepEqual(
    getAdvanceConsumptionDueTargets({
      chargeType: 'DG_SET',
      generatedDues: [due],
      skippedDues: [due],
    }),
    [due],
  )
})
