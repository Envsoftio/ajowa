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
    reportType: string
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
  { label: 'Expense summary', value: 'expense-summary', excel: true },
  { label: 'Income summary', value: 'income-summary', excel: true },
  { label: 'Income transactions', value: 'income-only', excel: true },
  { label: 'Expense transactions', value: 'expense-only', excel: true },
  { label: 'Category expenses', value: 'category-expense', excel: true },
  { label: 'Vendor expenses', value: 'vendor-expense', excel: true },
  { label: 'Missing attachments', value: 'attachment-missing', excel: true },
]
const periodOptions = [
  { label: 'Monthly', value: 'MONTHLY' },
  { label: 'Quarterly', value: 'QUARTERLY' },
  { label: 'Half-yearly', value: 'HALF_YEARLY' },
  { label: 'Yearly', value: 'YEARLY' },
  { label: 'Custom', value: 'CUSTOM' },
]

const today = new Date()
const toInputDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const firstDay = toInputDate(new Date(today.getFullYear(), today.getMonth() - 11, 1))
const lastDay = toInputDate(new Date(today.getFullYear(), today.getMonth() + 1, 0))

type CalendarPeriodMode = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY'

const filters = reactive<{
  reportType: string
  periodMode: CalendarPeriodMode | 'CUSTOM'
  startDate: string
  endDate: string
  flatId: string | null
  ownerUserId: string | null
  categoryId: string | null
  status: string
  search: string
}>({
  reportType: 'expense-summary',
  periodMode: 'YEARLY',
  startDate: firstDay,
  endDate: lastDay,
  flatId: null as string | null,
  ownerUserId: null as string | null,
  categoryId: null as string | null,
  status: '',
  search: '',
})

const setRangeByPeriodMode = (periodMode: CalendarPeriodMode) => {
  const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const targets: Record<CalendarPeriodMode, [Date, Date]> = {
    MONTHLY: [new Date(currentMonthStart), new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + 1, 0)],
    QUARTERLY: [
      new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - 2, 1),
      new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + 1, 0),
    ],
    HALF_YEARLY: [
      new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - 5, 1),
      new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + 1, 0),
    ],
    YEARLY: [
      new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - 11, 1),
      new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + 1, 0),
    ],
  }

  const [startDate, endDate] = targets[periodMode]
  filters.startDate = toInputDate(startDate)
  filters.endDate = toInputDate(endDate)
}

watch(() => filters.periodMode, (periodMode) => {
  if (periodMode === 'CUSTOM') return
  setRangeByPeriodMode(periodMode)
})

const showFlatFilter = computed(() => ['collection', 'defaulter', 'resident-payment-ledger'].includes(filters.reportType))
const showOwnerFilter = computed(() => filters.reportType === 'resident-payment-ledger')

const query = computed(() => ({
  ...filters,
  flatId: showFlatFilter.value ? filters.flatId ?? undefined : undefined,
  ownerUserId: showOwnerFilter.value ? filters.ownerUserId ?? undefined : undefined,
  status: filters.status || undefined,
  search: filters.search || undefined,
}))

const [
  reportAsyncData,
  flatsAsyncData,
  ownersAsyncData,
] = await Promise.all([
  useAsyncData(
    'finance-reports',
    () => api<ReportResponse>('/api/admin/finance/reports', { query: query.value }),
    { watch: [query] },
  ),
  useAsyncData('finance-report-flats', () =>
    api<FlatsResponse>('/api/admin/flats', { query: { pageSize: 300, 'filters[isActive]': 'true' } }),
  ),
  useAsyncData('finance-report-owners', () =>
    api<ResidentsResponse>('/api/admin/residents', { query: { pageSize: 300, 'filters[isActive]': 'true' } }),
  ),
])

const { data, pending, refresh } = reportAsyncData
const { data: flatsData } = flatsAsyncData
const { data: ownersData } = ownersAsyncData

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
const isMonthlyTransactionSummary = computed(() => ['expense-summary', 'income-summary'].includes(String(report.value?.reportType ?? '')))
const summaryTransactionType = computed(() => report.value?.reportType === 'income-summary' ? 'INCOME' : 'EXPENSE')

const summaryLabel = (key: string) =>
  key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())

const columnLetter = (index: number) => {
  let value = ''
  let cursor = index + 1
  while (cursor > 0) {
    const remainder = (cursor - 1) % 26
    value = String.fromCharCode(65 + remainder) + value
    cursor = Math.floor((cursor - 1) / 26)
  }
  return value
}

const toUtcDate = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)

const clampToReportRange = (range: { dateFrom: string; dateTo: string; label: string }) => ({
  dateFrom: range.dateFrom < filters.startDate ? filters.startDate : range.dateFrom,
  dateTo: range.dateTo > filters.endDate ? filters.endDate : range.dateTo,
  label: range.label,
})

const monthRangeFromColumn = (column: ReportColumn) => {
  const match = /^m(\d{4})_(\d{2})$/.exec(column.key)
  if (!match) return null

  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  return clampToReportRange({
    dateFrom: toUtcDate(year, monthIndex, 1),
    dateTo: toUtcDate(year, monthIndex + 1, 0),
    label: column.label,
  })
}

const isTotalSummaryRow = (row: Record<string, unknown>) =>
  String(row.description ?? '') === 'TOTAL AMOUNT'

const summaryDrilldownLabel = (row: Record<string, unknown>, column: ReportColumn, rangeLabel: string) => {
  const transactionLabel = summaryTransactionType.value === 'INCOME' ? 'income' : 'expenses'
  const rowLabel = isTotalSummaryRow(row)
    ? `All ${transactionLabel}`
    : String(row.description ?? transactionLabel)

  return `${rowLabel} - ${column.key === 'total' ? 'selected range' : rangeLabel}`
}

const summaryEntryLink = (row: Record<string, unknown>, column: ReportColumn) => {
  if (!isMonthlyTransactionSummary.value || column.type !== 'money') return null

  const valueForLink = row[column.key]
  const amount = Number(valueForLink ?? 0)
  if (!Number.isFinite(amount) || amount <= 0) return null

  const range =
    column.key === 'total'
      ? { dateFrom: filters.startDate, dateTo: filters.endDate, label: 'selected range' }
      : monthRangeFromColumn(column)
  if (!range) return null

  const queryParams: Record<string, string> = {
    transactionType: summaryTransactionType.value,
    status: 'POSTED',
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    pageSize: '2000',
    source: 'report',
    reportDrilldown: summaryDrilldownLabel(row, column, range.label),
    reportAmount: String(amount),
  }
  if (typeof row.categoryId === 'string') {
    queryParams.categoryId = row.categoryId
  }
  if (filters.search) {
    queryParams.search = filters.search
  }

  return {
    path: '/admin/finance/transactions',
    query: queryParams,
  }
}

const summaryEntryTarget = (row: Record<string, unknown>, column: ReportColumn) =>
  summaryEntryLink(row, column) ?? '/admin/finance/transactions'

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
  <div class="landing-page report-page">
    <section class="report-workbook">
      <header class="list-page__header report-workbook__header">
        <div>
          <h1>Finance reports</h1>
          <p>{{ report?.title ?? 'Loading report' }} · {{ report?.performanceMs ?? 0 }} ms</p>
        </div>
        <div class="list-page__exports">
          <Button
            as="router-link"
            to="/admin/finance/transactions/new?type=expense"
            label="Add expense"
            icon="pi pi-minus-circle"
            severity="secondary"
            outlined
          />
          <Button
            as="router-link"
            to="/admin/finance/transactions/new?type=income"
            label="Add income"
            icon="pi pi-plus-circle"
            severity="secondary"
            outlined
          />
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

      <div class="list-page__toolbar report-workbook__ribbon">
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
        <label v-if="showFlatFilter">
          <span>Flat</span>
          <Select v-model="filters.flatId" :options="flatOptions" option-label="label" option-value="value" show-clear filter />
        </label>
        <label v-if="showOwnerFilter">
          <span>Owner</span>
          <Select v-model="filters.ownerUserId" :options="ownerOptions" option-label="label" option-value="value" show-clear filter />
        </label>
        <label class="list-page__search">
          <span>Search</span>
          <InputText v-model="filters.search" />
        </label>
        <Button icon="pi pi-refresh" severity="secondary" outlined title="Refresh" @click="() => refresh()" />
      </div>

      <div class="report-workbook__metrics">
        <div v-for="[key, value] in summaryEntries" :key="key" class="report-workbook__metric">
          <span>{{ summaryLabel(key) }}</span>
          <strong>{{ formatSummaryValue(value) }}</strong>
        </div>
      </div>

      <div class="report-workbook__formula">
        <span class="report-workbook__name-box">A1</span>
        <span class="report-workbook__fx">fx</span>
        <span>{{ report?.title ?? '' }}</span>
      </div>

      <div class="report-chart report-workbook__chart">
        <div v-for="item in report?.chart ?? []" :key="item.label" class="report-chart__row">
          <span>{{ item.label }}</span>
          <div class="report-chart__track">
            <div class="report-chart__bar" :style="{ width: `${(item.value / maxChartValue) * 100}%`, background: item.color }" />
          </div>
          <strong>{{ formatMoney(item.value) }}</strong>
        </div>
      </div>

      <div v-if="isMonthlyTransactionSummary" class="expense-summary-table">
        <table>
          <thead>
            <tr class="expense-summary-table__letters">
              <th class="expense-summary-table__corner" />
              <th
                v-for="(column, columnIndex) in columns"
                :key="`letter-${column.key}`"
                :class="{ 'expense-summary-table__first-data-column': columnIndex === 0 }"
              >
                {{ columnLetter(columnIndex) }}
              </th>
            </tr>
            <tr class="expense-summary-table__headers">
              <th class="expense-summary-table__row-header">1</th>
              <th
                v-for="(column, columnIndex) in columns"
                :key="column.key"
                :class="{ 'expense-summary-table__first-data-column': columnIndex === 0 }"
              >
                {{ column.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, index) in rows"
              :key="String(row.description ?? index)"
              :class="{ 'expense-summary-table__total': row.description === 'TOTAL AMOUNT' }"
            >
              <th class="expense-summary-table__row-header" scope="row">
                {{ index + 2 }}
              </th>
              <td
                v-for="(column, columnIndex) in columns"
                :key="column.key"
                :class="{
                  'expense-summary-table__amount': column.type === 'money',
                  'expense-summary-table__first-data-column': columnIndex === 0,
                }"
              >
                <NuxtLink
                  v-if="summaryEntryLink(row, column)"
                  :to="summaryEntryTarget(row, column)"
                  class="expense-summary-table__link"
                >
                  {{ formatCell(column, row[column.key]) }}
                </NuxtLink>
                <span v-else>
                  {{ formatCell(column, row[column.key]) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <AppDataTable :value="rows" :loading="pending" responsive-layout="scroll" class="list-page__table" scrollable scroll-height="32rem">
        <Column v-for="column in columns" :key="column.key" :field="column.key" :header="column.label">
          <template #body="{ data: row }">
            {{ formatCell(column, row[column.key]) }}
          </template>
        </Column>
      </AppDataTable>

      <AppDataTable v-if="(report?.reconciliation ?? []).length > 0" :value="report?.reconciliation ?? []" responsive-layout="scroll">
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
      </AppDataTable>
    </section>

    <SharedReportLinkPanel :owners="owners" :flats="flats" :start-date="filters.startDate" :end-date="filters.endDate" />
  </div>
</template>
