import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('loads previous outstanding only for generated DG dues', async () => {
  const source = await readSource('../server/utils/dg-outstanding.ts')

  assert.match(source, /current_bp\.charge_type = 'DG_SET'/)
  assert.match(source, /current_md\.origin = 'GENERATED_BILL'/)
  assert.match(source, /prior_bp\.charge_type = 'DG_SET'/)
  assert.match(source, /prior_bp\.start_date < current_bp\.start_date/)
  assert.match(
    source,
    /prior_md\.status <> 'CANCELLED'/,
  )
  assert.match(source, /computeDgAwareBillingDueAmounts\(/)
})

test('enriches generated DG rows after the unchanged dues mapper', async () => {
  const source = await readSource(
    '../server/api/admin/billing/dues/index.get.ts',
  )

  assert.match(source, /where md\.society_id = \$1\s+and md\.origin = 'GENERATED_BILL'/)
  assert.match(
    source,
    /item\.billingPeriodChargeType === 'DG_SET'[\s\S]*item\.origin !== 'DG_OPENING_BALANCE'/,
  )
  assert.match(source, /if \(generatedDgDueIds\.length === 0\) return items/)
  assert.match(source, /previousDgOutstandingAmount: previous\.initialAmount/)
  assert.match(source, /previousDgOutstandingCount: previous\.count/)
})

test('renders the combined figure as DG-only context and pre-fills combined payable', async () => {
  const source = await readSource('../pages/admin/billing/dues/index.vue')

  assert.match(
    source,
    /const isGeneratedDgDue = \(due: MaintenanceDue\) =>\s*isDgDue\(due\) && due\.origin !== 'DG_OPENING_BALANCE'/,
  )
  assert.match(
    source,
    /v-if="isGeneratedDgDue\(row\)" class="billing-dg-statement"/,
  )
  assert.match(source, /Previous DG outstanding/)
  assert.match(source, /Combined DG payable/)
  assert.match(source, /Available DG advance:/)
  assert.match(
    source,
    /Number\(due\.advanceAppliedAmount \?\? 0\) > 0 &&\s*due\.balanceAmount <= 0\s*\) return 'covered'/,
  )
  assert.match(source, /v-if="!isGeneratedDgDue\(row\)"/)
  assert.match(source, /<span v-if="isDgDue\(row\)">Not charged<\/span>/)
  assert.match(source, /amount: String\(isDg \? combinedPayable : due\.balanceAmount\)/)
  assert.match(source, /isDgCombined: isDg && previousOutstanding > 0 \? 'true' : undefined/)
})
