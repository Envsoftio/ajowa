import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const sourceSlice = (source, start, end) => {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex)
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`)
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`)
  return source.slice(startIndex, endIndex)
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

test('locks the established CAM calculator and CAM PDF section', async () => {
  const source = await readSource('../server/utils/billing.ts')

  assert.equal(
    sha256(sourceSlice(
      source,
      'export const computeBillingDueAmounts',
      'export const computeDgAwareBillingDueAmounts',
    )),
    'c693708df8ac4bc3c26184ef7800e72577aa77596db3ccc1044ffa581793482a',
  )
  assert.equal(
    sha256(sourceSlice(
      source,
      'export const resolveBillingDueAmountsForDisplay',
      'export const resolveDgAwareBillingDueAmountsForDisplay',
    )),
    '69aa2d3dc2c0bc2cefd48d4241b3aa523967769d1cee596d5ef9117acaf133ab',
  )
  assert.equal(
    sha256(sourceSlice(
      source,
      '  const buildMaintenanceInvoiceSection =',
      '  const buildDgBillNoticeSection =',
    )),
    '0a24e8f951ed7d822e15233b776a164c96596b5cc371bdc499ba6461256fd9cd',
  )
})

test('keeps prior CAM and DG balances in separate PDF buckets', async () => {
  const source = await readSource('../server/utils/billing.ts')

  assert.match(source, /totals\.dg \+= computed\.balanceAmount/)
  assert.match(source, /totals\.nonDg \+= computed\.balanceAmount/)
  assert.match(
    source,
    /previousNonDgOutstanding: previousOutstanding/,
  )
  assert.match(
    source,
    /previousOutstandingAmount: dgCharges\.length > 0\s*\? previousDgOutstanding\s*: previousOutstanding/,
  )
})

test('does not let an optional DG advance request hide resident CAM dues', async () => {
  const source = await readSource('../pages/my/dues.vue')

  assert.match(source, /await useAsyncData\('my-dues'/)
  assert.match(source, /useLazyAsyncData\('my-dg-advances'/)
  assert.doesNotMatch(source, /Promise\.all\(\[\s*api<DuesResponse>/)
  assert.match(
    source,
    /api<DgAdvanceSummaryResponse>\('\/api\/my\/dg-advances'\)\.catch\(\(\) => \(\{/,
  )
  assert.match(source, /items: \[\],\s*totalAvailable: 0,/)
})

test('adds the DG source column only when a DG row is exported', async () => {
  const source = await readSource('../server/api/admin/billing/dues/index.get.ts')

  assert.match(
    source,
    /const includeDgSource = items\.some\(\s*\(item\) => item\.billingPeriodChargeType === 'DG_SET'/,
  )
  assert.match(source, /\.\.\.\(includeDgSource\s*\? \{\s*Source:/)
  assert.match(source, /\.\.\.\(includeDgSource \? \[\{ wch: 24 \}\] : \[\]\)/)
})
