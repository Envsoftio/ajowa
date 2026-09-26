import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  BILLING_BATCH_MAX_ATTEMPTS,
  BILL_NOTIFICATION_REQUEST_BATCH_SIZE,
  CAM_DUE_GENERATION_BATCH_SIZE,
  DG_DUE_GENERATION_BATCH_SIZE,
  chunkBillingRequestIds,
  getAdvanceConsumptionDueTargets,
  getDueGenerationFlatIdBatches,
  runBillingBatchWithRetry,
} from '../shared/billing.ts'

test('keeps DG due generation below the production timeout batch size', () => {
  assert.equal(DG_DUE_GENERATION_BATCH_SIZE, 10)
  assert.ok(DG_DUE_GENERATION_BATCH_SIZE < 40)
})

test('keeps CAM due generation within bounded production requests', () => {
  assert.equal(CAM_DUE_GENERATION_BATCH_SIZE, 40)
  assert.equal(BILLING_BATCH_MAX_ATTEMPTS, 3)
})

test('retries transient billing failures with bounded backoff', async () => {
  let attempts = 0
  const delays = []
  const retries = []

  const result = await runBillingBatchWithRetry(
    async () => {
      attempts += 1
      if (attempts < 3) throw { statusCode: 504 }
      return 'saved'
    },
    {
      wait: async (milliseconds) => { delays.push(milliseconds) },
      onRetry: ({ nextAttempt }) => { retries.push(nextAttempt) },
    },
  )

  assert.equal(result, 'saved')
  assert.equal(attempts, 3)
  assert.deepEqual(delays, [1000, 2000])
  assert.deepEqual(retries, [2, 3])
})

test('does not retry permanent billing validation failures', async () => {
  let attempts = 0

  await assert.rejects(
    runBillingBatchWithRetry(async () => {
      attempts += 1
      throw { statusCode: 400 }
    }, { wait: async () => {} }),
  )

  assert.equal(attempts, 1)
})

test('handles a timeout after commit without creating a duplicate due', async () => {
  const storedDues = new Set()
  let attempts = 0

  const result = await runBillingBatchWithRetry(
    async () => {
      attempts += 1
      const inserted = !storedDues.has('period-1:flat-1')
      storedDues.add('period-1:flat-1')

      if (attempts === 1) throw { statusCode: 504 }
      return inserted ? 'created' : 'skipped-existing'
    },
    { wait: async () => {} },
  )

  assert.equal(result, 'skipped-existing')
  assert.equal(storedDues.size, 1)
  assert.equal(attempts, 2)
})

test('keeps batch writes atomic and database-enforced against duplicate dues', async () => {
  const [migration, endpoint] = await Promise.all([
    readFile(new URL('../supabase/migrations/20260615083000_phase_3_schema_foundation.sql', import.meta.url), 'utf8'),
    readFile(new URL('../server/api/admin/billing/dues/index.post.ts', import.meta.url), 'utf8'),
  ])

  assert.match(migration, /unique \(billing_period_id, flat_id\)/)
  assert.match(endpoint, /on conflict \(billing_period_id, flat_id\) do nothing/)
  assert.match(endpoint, /await client\.query\('commit'\)/)
  assert.match(endpoint, /await client\.query\('rollback'\)/)
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

test('batches selected CAM generation while keeping general generation unchanged', () => {
  const selectedFlatIds = Array.from({ length: 83 }, (_, index) => `selected-${index + 1}`)

  assert.deepEqual(
    getDueGenerationFlatIdBatches({
      chargeType: 'CAM',
      selectedFlatIds,
      availableFlatIds: ['unused-available-flat'],
    }).map((batch) => batch?.length),
    [40, 40, 3],
  )
  assert.deepEqual(
    getDueGenerationFlatIdBatches({
      chargeType: 'GENERAL',
      selectedFlatIds,
      availableFlatIds: ['unused-available-flat'],
    }),
    [selectedFlatIds],
  )
})

test('batches all-flat CAM generation while keeping general generation unfiltered', () => {
  const availableFlatIds = Array.from({ length: 41 }, (_, index) => `available-${index + 1}`)

  assert.deepEqual(
    getDueGenerationFlatIdBatches({
      chargeType: 'CAM',
      selectedFlatIds: [],
      availableFlatIds,
    }).map((batch) => batch?.length),
    [40, 1],
  )
  assert.deepEqual(
    getDueGenerationFlatIdBatches({
      chargeType: 'GENERAL',
      selectedFlatIds: [],
      availableFlatIds,
    }),
    [undefined],
  )
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
