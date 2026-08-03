import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('includes DG Set allocations in finance transaction and income report sources', async () => {
  const [transactionsSource, reportsSource] = await Promise.all([
    readSource('../server/utils/finance-transactions.ts'),
    readSource('../server/utils/reports.ts'),
  ])

  for (const source of [transactionsSource, reportsSource]) {
    assert.match(source, /'DG_SET'::text as charge_type/)
    assert.match(source, /bp\.charge_type in \('CAM', 'DG_SET'\)/)
    assert.match(
      source,
      /bp\.charge_type <> 'DG_SET' or p\.mode <> 'ADVANCE_CREDIT'/,
    )
  }

  assert.match(transactionsSource, /source_tc\.code = case/)
  assert.match(
    reportsSource,
    /cc\.charge_type = 'CAM'\s*or source_tc\.code = 'INC-MNT-002'/,
  )

  assert.equal(
    transactionsSource.match(
      /bp\.charge_type <> 'DG_SET' or p\.mode <> 'ADVANCE_CREDIT'/g,
    )?.length,
    2,
    'both finance summary and transaction rows must exclude DG internal advance applications',
  )
})

test('leaves the existing profit and loss transaction source unchanged', async () => {
  const reportsSource = await readSource('../server/utils/reports.ts')

  assert.match(reportsSource, /from transactions/)
  assert.match(reportsSource, /status = 'POSTED'/)
  assert.doesNotMatch(reportsSource, /from journal_entries je/)
})

test('adds only DG synthetic collections to the normal posted-income listing', async () => {
  const [indexSource, exportSource, transactionUtilsSource] = await Promise.all([
    readSource('../server/api/admin/finance/transactions/index.get.ts'),
    readSource('../server/api/admin/finance/transactions/export.get.ts'),
    readSource('../server/utils/finance-transactions.ts'),
  ])

  for (const source of [indexSource, exportSource]) {
    assert.match(source, /query\.source === 'report' && isPostedIncome/)
    assert.match(source, /billingChargeTypes: \['DG_SET'\] as const/)
  }

  assert.match(
    transactionUtilsSource,
    /bp\.charge_type = any\(\$\$\{billingParams\.length\}::text\[\]\)/,
  )
  assert.match(
    transactionUtilsSource,
    /return compareValues\(right\.createdAt, left\.createdAt\)/,
  )
})
