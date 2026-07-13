<script setup lang="ts">
import type { DataTablePageEvent } from 'primevue/datatable'

definePageMeta({
  layout: 'resident',
  middleware: ['protected'],
  title: 'My Receipts',
})

type ReceiptSummary = {
  id: string
  paymentDate: string
  amount: string
  mode: string
  status: string
  utrReference: string | null
  bankReference: string | null
  receiptNumber: string
  receiptFilePath: string | null
  receiptGeneratedAt: string | null
  downloadUrl: string
  flatId: string
  flatNumber: string | null
  blockName: string | null
}

type ReceiptsResponse = {
  ok: true
  data: {
    items: ReceiptSummary[]
    total: number
    page: number
    pageSize: number
  }
}

type SummaryCardKey = 'paid' | 'receipts' | 'flats'

const api = useApi()
const authStore = useAuthStore()

const query = reactive({
  page: 1,
  pageSize: 20,
  search: '',
  fromDate: '',
  toDate: '',
  minAmount: '',
  maxAmount: '',
  mode: '',
  flatId: '',
})

const paymentModes = [
  { label: 'All modes', value: '' },
  { label: 'Cash', value: 'CASH' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Bank transfer', value: 'BANK_TRANSFER' },
  { label: 'Cheque', value: 'CHEQUE' },
  { label: 'Online gateway', value: 'ONLINE_GATEWAY' },
  { label: 'Advance credit', value: 'ADVANCE_CREDIT' },
]

const flatOptions = computed(() => [
  { label: 'All flats', value: '' },
  ...(authStore.me?.flatAccess ?? []).map((flat) => ({
    label: `${flat.blockName} ${flat.flatNumber}`,
    value: flat.flatId,
  })),
])

const formatMoney = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0))

const formatDate = (value: string | null | undefined) =>
  value
    ? new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString('en-IN', {
        dateStyle: 'medium',
      })
    : '-'

const flatLabel = (receipt: ReceiptSummary) =>
  [receipt.blockName, receipt.flatNumber].filter(Boolean).join(' ') || '-'

const referenceLabel = (receipt: ReceiptSummary) =>
  receipt.utrReference || receipt.bankReference || '-'

const loadReceipts = () =>
  api<ReceiptsResponse>('/api/my/receipts', {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search || undefined,
      fromDate: query.fromDate || undefined,
      toDate: query.toDate || undefined,
      minAmount: query.minAmount || undefined,
      maxAmount: query.maxAmount || undefined,
      mode: query.mode || undefined,
      flatId: query.flatId || undefined,
    },
  })

const { data, pending, refresh } = await useAsyncData('my-receipts', loadReceipts, {
  watch: [query],
})

const receipts = computed(() => data.value?.data.items ?? [])
const totalRecords = computed(() => data.value?.data.total ?? 0)

const summary = computed(() => ({
  totalPaid: receipts.value.reduce((sum, receipt) => sum + Number(receipt.amount), 0),
  receiptCount: receipts.value.length,
  flatCount: new Set(receipts.value.map((receipt) => receipt.flatId)).size,
}))

const filtersExpanded = ref(false)

const activeFilterCount = computed(() =>
  Object.entries(query).filter(([key, value]) => !['page', 'pageSize'].includes(key) && Boolean(value)).length,
)

const hasActiveFilters = computed(() => activeFilterCount.value > 0)

const filterToggleLabel = computed(() =>
  activeFilterCount.value > 0 ? `Search (${activeFilterCount.value})` : 'Search',
)

const activeSummaryHelp = ref<SummaryCardKey | null>(null)
const isSummaryHelpOpen = (key: SummaryCardKey) => activeSummaryHelp.value === key
const toggleSummaryHelp = (key: SummaryCardKey) => {
  activeSummaryHelp.value = isSummaryHelpOpen(key) ? null : key
}
const summaryHelpIds: Record<SummaryCardKey, string> = {
  paid: 'my-receipts-summary-help-paid',
  receipts: 'my-receipts-summary-help-receipts',
  flats: 'my-receipts-summary-help-flats',
}
const isPaidHelpOpen = computed(() => isSummaryHelpOpen('paid'))
const isReceiptsHelpOpen = computed(() => isSummaryHelpOpen('receipts'))
const isFlatsHelpOpen = computed(() => isSummaryHelpOpen('flats'))
const togglePaidHelp = () => toggleSummaryHelp('paid')
const toggleReceiptsHelp = () => toggleSummaryHelp('receipts')
const toggleFlatsHelp = () => toggleSummaryHelp('flats')

watch(
  () => [query.search, query.fromDate, query.toDate, query.minAmount, query.maxAmount, query.mode, query.flatId],
  () => {
    query.page = 1
  },
)

const resetFilters = () => {
  query.search = ''
  query.fromDate = ''
  query.toDate = ''
  query.minAmount = ''
  query.maxAmount = ''
  query.mode = ''
  query.flatId = ''
}
</script>

<template>
  <div class="landing-page">
    <div class="surface-grid resident-summary-grid">
      <section class="surface-card resident-summary-card">
        <div class="resident-summary-card__topline">
          <p class="eyebrow">Visible paid</p>
          <button
            type="button"
            class="resident-summary-card__help-button"
            :aria-expanded="isPaidHelpOpen"
            :aria-controls="summaryHelpIds.paid"
            aria-label="Show visible paid help"
            @click="togglePaidHelp"
          >
            <i class="pi pi-info-circle" aria-hidden="true" />
          </button>
        </div>
        <h3>{{ formatMoney(summary.totalPaid) }}</h3>
        <p
          :id="summaryHelpIds.paid"
          class="resident-summary-card__help-text"
          :class="{ 'is-open': isPaidHelpOpen }"
        >
          {{ totalRecords }} receipts match the current filters.
        </p>
      </section>
      <section class="surface-card resident-summary-card">
        <div class="resident-summary-card__topline">
          <p class="eyebrow">Receipts shown</p>
          <button
            type="button"
            class="resident-summary-card__help-button"
            :aria-expanded="isReceiptsHelpOpen"
            :aria-controls="summaryHelpIds.receipts"
            aria-label="Show receipts shown help"
            @click="toggleReceiptsHelp"
          >
            <i class="pi pi-info-circle" aria-hidden="true" />
          </button>
        </div>
        <h3>{{ summary.receiptCount }}</h3>
        <p
          :id="summaryHelpIds.receipts"
          class="resident-summary-card__help-text"
          :class="{ 'is-open': isReceiptsHelpOpen }"
        >
          Download PDF receipts for your linked payments.
        </p>
      </section>
      <section class="surface-card resident-summary-card">
        <div class="resident-summary-card__topline">
          <p class="eyebrow">Linked flats</p>
          <button
            type="button"
            class="resident-summary-card__help-button"
            :aria-expanded="isFlatsHelpOpen"
            :aria-controls="summaryHelpIds.flats"
            aria-label="Show linked flats help"
            @click="toggleFlatsHelp"
          >
            <i class="pi pi-info-circle" aria-hidden="true" />
          </button>
        </div>
        <h3>{{ summary.flatCount }}</h3>
        <p
          :id="summaryHelpIds.flats"
          class="resident-summary-card__help-text"
          :class="{ 'is-open': isFlatsHelpOpen }"
        >
          Receipt rows currently visible across your flats.
        </p>
      </section>
    </div>

    <section class="list-page surface-card resident-receipts-panel">
      <header class="list-page__header">
        <div>
          <h1>My receipts</h1>
          <p>Payment history and downloadable maintenance receipts for your active resident relationships.</p>
        </div>
        <div class="list-page__exports">
          <Button
            class="resident-receipts__filter-toggle"
            :label="filterToggleLabel"
            :icon="filtersExpanded ? 'pi pi-chevron-up' : 'pi pi-search'"
            severity="secondary"
            outlined
            aria-controls="resident-receipts-filters"
            :aria-expanded="filtersExpanded"
            @click="filtersExpanded = !filtersExpanded"
          />
          <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined :loading="pending" @click="() => refresh()" />
          <Button label="Clear filters" icon="pi pi-filter-slash" severity="secondary" outlined :disabled="!hasActiveFilters" @click="resetFilters" />
        </div>
      </header>

      <div id="resident-receipts-filters" class="list-page__toolbar resident-receipts__toolbar" :class="{ 'is-expanded': filtersExpanded }">
        <label class="list-page__search">
          <span class="field-label">Search</span>
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="query.search" placeholder="Receipt, UTR, reference, flat" />
          </IconField>
        </label>
        <div class="list-page__filters">
          <label>
            <span class="field-label">From</span>
            <InputText v-model="query.fromDate" type="date" />
          </label>
          <label>
            <span class="field-label">To</span>
            <InputText v-model="query.toDate" type="date" />
          </label>
          <label>
            <span class="field-label">Flat</span>
            <Select v-model="query.flatId" :options="flatOptions" option-label="label" option-value="value" />
          </label>
          <label>
            <span class="field-label">Mode</span>
            <Select v-model="query.mode" :options="paymentModes" option-label="label" option-value="value" />
          </label>
          <label>
            <span class="field-label">Min amount</span>
            <InputText v-model="query.minAmount" inputmode="decimal" />
          </label>
          <label>
            <span class="field-label">Max amount</span>
            <InputText v-model="query.maxAmount" inputmode="decimal" />
          </label>
        </div>
      </div>

      <AppSkeletonState v-if="pending" />
      <AppState
        v-else-if="receipts.length === 0"
        variant="empty"
        title="No receipts found"
        message="Receipts will appear after verified payments are allocated and receipt numbers are generated."
      />

      <template v-else>
        <AppDataTable
          :value="receipts"
          paginator
          :rows="query.pageSize"
          :total-records="totalRecords"
          :lazy="true"
          responsive-layout="scroll"
          class="list-page__table"
          data-key="id"
          @page="
            (event: DataTablePageEvent) => {
              query.page = Math.floor(event.first / event.rows) + 1
              query.pageSize = event.rows
            }
          "
        >
          <Column field="paymentDate" header="Date">
            <template #body="{ data: row }">
              {{ formatDate(row.paymentDate) }}
            </template>
          </Column>
          <Column field="receiptNumber" header="Receipt">
            <template #body="{ data: row }">
              <strong>{{ row.receiptNumber }}</strong>
              <p class="table-muted">{{ flatLabel(row) }}</p>
            </template>
          </Column>
          <Column field="amount" header="Amount">
            <template #body="{ data: row }">
              {{ formatMoney(row.amount) }}
            </template>
          </Column>
          <Column field="mode" header="Mode">
            <template #body="{ data: row }">
              <span>{{ row.mode }}</span>
              <p class="table-muted">{{ referenceLabel(row) }}</p>
            </template>
          </Column>
          <Column field="status" header="Status">
            <template #body="{ data: row }">
              <AppStatusBadge :status="row.status" />
            </template>
          </Column>
          <Column header="Actions" style="width: 120px">
            <template #body="{ data: row }">
              <AppDocumentLink :href="row.downloadUrl" viewer-title="Receipt PDF" icon="pi pi-download" severity="secondary" text rounded aria-label="Download receipt" title="Download receipt" />
            </template>
          </Column>
        </AppDataTable>

        <div class="list-page__cards">
          <article v-for="receipt in receipts" :key="receipt.id" class="list-card">
            <div class="list-card__header">
              <div>
                <h3>{{ receipt.receiptNumber }}</h3>
                <p>{{ flatLabel(receipt) }} · {{ formatDate(receipt.paymentDate) }}</p>
              </div>
              <AppStatusBadge :status="receipt.status" />
            </div>
            <div class="resident-receipts-card__meta">
              <div class="list-card__row">
                <span>Amount</span>
                <strong>{{ formatMoney(receipt.amount) }}</strong>
              </div>
              <div class="list-card__row">
                <span>Mode</span>
                <strong>{{ receipt.mode }}</strong>
              </div>
              <div class="list-card__row">
                <span>Reference</span>
                <strong>{{ referenceLabel(receipt) }}</strong>
              </div>
            </div>
            <AppDocumentLink :href="receipt.downloadUrl" viewer-title="Receipt PDF" label="Download receipt" icon="pi pi-download" size="small" severity="secondary" outlined />
          </article>
        </div>
      </template>
    </section>
  </div>
</template>
