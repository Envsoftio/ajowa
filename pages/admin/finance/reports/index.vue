<script setup lang="ts">
import type { FlatSummary, ResidentSummary } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Finance Reports',
})

type ReportColumn = { key: string; label: string; type?: string }
type ReportResponse = {
  ok: true
  data: {
    title: string
    generatedAt: string
    columns: ReportColumn[]
    rows: Record<string, unknown>[]
    summary: Record<string, number | string>
    chart: Array<{ label: string; value: number; color: string }>
    reconciliation: Array<{ label: string; expected: number; actual: number; variance: number }>
    performanceMs: number
    rowCount: number
    truncated: boolean
  }
}
type FlatsResponse = { ok: true; data: { items: FlatSummary[] } }
type ResidentsResponse = { ok: true; data: { items: ResidentSummary[] } }

const api = useApi()
const { formatMoney, formatDate, formatDateTime } = useFinanceFormatters()

const reportOptions = [
  { label: 'Resident payment ledger', value: 'resident-payment-ledger', excel: false },
  { label: 'Collection report', value: 'collection', excel: true },
  { label: 'Defaulter list', value: 'defaulter', excel: true },
  { label: 'Income and expense', value: 'income-expense', excel: true },
  { label: 'P&L statement', value: 'profit-loss', excel: false },
  { label: 'Category expenses', value: 'category-expense', excel: true },
  { label: 'Vendor expenses', value: 'vendor-expense', excel: true },
  { label: 'Missing attachments', value: 'attachment-missing', excel: true },
  { label: 'Pending review/rejected', value: 'pending-review', excel: true },
  { label: 'Gate access log', value: 'gate-access', excel: true },
  { label: 'Service requests', value: 'service-requests', excel: true },
  { label: 'Notification campaigns', value: 'notification-campaign', excel: true },
]
const periodOptions = [
  { label: 'Monthly', value: 'MONTHLY' },
  { label: 'Quarterly', value: 'QUARTERLY' },
  { label: 'Half-yearly', value: 'HALF_YEARLY' },
  { label: 'Yearly', value: 'YEARLY' },
  { label: 'Custom', value: 'CUSTOM' },
]

const today = new Date()
const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10)

const filters = reactive({
  reportType: 'income-expense',
  periodMode: 'MONTHLY',
  startDate: firstDay,
  endDate: lastDay,
  flatId: null as string | null,
  ownerUserId: null as string | null,
  status: '',
  search: '',
})

const query = computed(() => ({
  ...filters,
  flatId: filters.flatId ?? undefined,
  ownerUserId: filters.ownerUserId ?? undefined,
  status: filters.status || undefined,
  search: filters.search || undefined,
}))

const { data, pending, refresh } = await useAsyncData(
  'finance-reports',
  () => api<ReportResponse>('/api/admin/finance/reports', { query: query.value }),
  { watch: [query] },
)
const { data: flatsData } = await useAsyncData('finance-report-flats', () =>
  api<FlatsResponse>('/api/admin/flats', { query: { pageSize: 300, 'filters[isActive]': 'true' } }),
)
const { data: ownersData } = await useAsyncData('finance-report-owners', () =>
  api<ResidentsResponse>('/api/admin/residents', { query: { pageSize: 300, 'filters[isActive]': 'true' } }),
)

const report = computed(() => data.value?.data)
const rows = computed(() => report.value?.rows ?? [])
const columns = computed(() => report.value?.columns ?? [])
const summaryEntries = computed(() => Object.entries(report.value?.summary ?? {}).slice(0, 4))
const maxChartValue = computed(() => Math.max(1, ...(report.value?.chart ?? []).map((item) => item.value)))
const flats = computed(() => flatsData.value?.data.items ?? [])
const owners = computed(() => ownersData.value?.data.items ?? [])
const flatOptions = computed(() => flats.value.map((flat) => ({ label: `${flat.blockName} ${flat.flatNumber}`, value: flat.id })))
const ownerOptions = computed(() => owners.value.map((owner) => ({ label: owner.fullName, value: owner.id })))
const activeReport = computed(() => reportOptions.find((item) => item.value === filters.reportType))

const formatSummaryValue = (value: number | string) =>
  typeof value === 'number' ? formatMoney(value) : value

const formatCell = (column: ReportColumn, value: unknown) => {
  if (column.type === 'money') return formatMoney(Number(value ?? 0))
  if (column.type === 'date') return formatDate(String(value ?? ''))
  if (column.type === 'datetime') return formatDateTime(String(value ?? ''))
  return value ?? '-'
}

const exportUrl = (format: 'pdf' | 'xlsx') => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query.value)) {
    if (value) params.set(key, String(value))
  }
  params.set('format', format)
  return `/api/admin/finance/reports/export?${params.toString()}`
}
</script>

<template>
  <div class="landing-page">
    <div class="surface-grid">
      <section v-for="[key, value] in summaryEntries" :key="key" class="surface-card">
        <p class="eyebrow">{{ key.replace(/([A-Z])/g, ' $1') }}</p>
        <h3>{{ formatSummaryValue(value) }}</h3>
        <p>{{ report?.title }}</p>
      </section>
    </div>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Finance reports</h1>
          <p>{{ report?.title ?? 'Loading report' }} · {{ report?.performanceMs ?? 0 }} ms</p>
        </div>
        <div class="list-page__exports">
          <Button as="a" :href="exportUrl('pdf')" label="PDF" icon="pi pi-file-pdf" target="_blank" />
          <Button
            as="a"
            :href="exportUrl('xlsx')"
            label="Excel"
            icon="pi pi-file-excel"
            severity="secondary"
            outlined
            target="_blank"
            :disabled="activeReport?.excel === false"
          />
          <Button as="router-link" to="/admin/finance/reports/shares" label="Shares" icon="pi pi-share-alt" severity="secondary" outlined />
        </div>
      </header>

      <div class="list-page__toolbar">
        <label>
          <span>Report</span>
          <Select v-model="filters.reportType" :options="reportOptions" option-label="label" option-value="value" />
        </label>
        <label>
          <span>Range</span>
          <Select v-model="filters.periodMode" :options="periodOptions" option-label="label" option-value="value" />
        </label>
        <label>
          <span>Start</span>
          <InputText v-model="filters.startDate" type="date" />
        </label>
        <label>
          <span>End</span>
          <InputText v-model="filters.endDate" type="date" />
        </label>
        <label>
          <span>Flat</span>
          <Select v-model="filters.flatId" :options="flatOptions" option-label="label" option-value="value" show-clear filter />
        </label>
        <label>
          <span>Owner</span>
          <Select v-model="filters.ownerUserId" :options="ownerOptions" option-label="label" option-value="value" show-clear filter />
        </label>
        <label class="list-page__search">
          <span>Search</span>
          <InputText v-model="filters.search" />
        </label>
        <Button icon="pi pi-refresh" severity="secondary" outlined title="Refresh" @click="() => refresh()" />
      </div>

      <div class="report-chart">
        <div v-for="item in report?.chart ?? []" :key="item.label" class="report-chart__row">
          <span>{{ item.label }}</span>
          <div class="report-chart__track">
            <div class="report-chart__bar" :style="{ width: `${(item.value / maxChartValue) * 100}%`, background: item.color }" />
          </div>
          <strong>{{ formatMoney(item.value) }}</strong>
        </div>
      </div>

      <DataTable :value="rows" :loading="pending" responsive-layout="scroll" class="list-page__table" scrollable scroll-height="32rem">
        <Column v-for="column in columns" :key="column.key" :field="column.key" :header="column.label">
          <template #body="{ data: row }">
            {{ formatCell(column, row[column.key]) }}
          </template>
        </Column>
      </DataTable>

      <DataTable :value="report?.reconciliation ?? []" responsive-layout="scroll">
        <Column field="label" header="Reconciliation" />
        <Column field="expected" header="Expected">
          <template #body="{ data: row }">{{ formatMoney(row.expected) }}</template>
        </Column>
        <Column field="actual" header="Actual">
          <template #body="{ data: row }">{{ formatMoney(row.actual) }}</template>
        </Column>
        <Column field="variance" header="Variance">
          <template #body="{ data: row }">{{ formatMoney(row.variance) }}</template>
        </Column>
      </DataTable>
    </section>

    <SharedReportLinkPanel :owners="owners" :flats="flats" :start-date="filters.startDate" :end-date="filters.endDate" />
  </div>
</template>
