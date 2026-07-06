<script setup lang="ts">
import type {
  BankAccount,
  BillingPeriod,
  FinanceCategory,
  FinanceLifecycleStatus,
  FinanceTransaction,
  FinanceTransactionType,
  SocietyProfile,
} from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Finance Transactions',
})

type TransactionsResponse = {
  ok: true
  data: {
    items: FinanceTransaction[]
    total: number
    summary?: {
      income: number
      expense: number
      missingAttachments: number
    }
    page: number
    pageSize: number
  }
}
type CategoriesResponse = { ok: true; data: { items: FinanceCategory[] } }
type BankAccountsResponse = { ok: true; data: { items: BankAccount[] } }
type PeriodsResponse = { ok: true; data: { items: BillingPeriod[] } }
type SocietyResponse = { ok: true; data: SocietyProfile }

const api = useApi()
const route = useRoute()
const { filters, query, resetFilters, applyQuickFilter } =
  useFinanceTransactionFilters()
const { formatMoney, formatDate } = useFinanceFormatters()

const page = ref(1)
const pageSize = ref(20)
const sortBy = ref('transactionDate')
const sortDirection = ref<'asc' | 'desc'>('desc')

const transactionTypeValues: FinanceTransactionType[] = ['INCOME', 'EXPENSE']
const statusValues: FinanceLifecycleStatus[] = [
  'DRAFT',
  'PENDING_REVIEW',
  'POSTED',
  'REJECTED',
  'RETURNED',
  'REVERSED',
  'CANCELLED',
]

const queryText = (value: unknown) => {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first : ''
}

const queryNumber = (value: unknown) => {
  const text = queryText(value)
  if (!text) return null

  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

const applyRouteFilters = (routeQuery: Record<string, unknown>) => {
  const transactionType = queryText(routeQuery.transactionType).toUpperCase()
  const status = queryText(routeQuery.status).toUpperCase()
  const attachment = queryText(routeQuery.attachment)

  filters.search = queryText(routeQuery.search)
  filters.transactionType = transactionTypeValues.includes(transactionType as FinanceTransactionType)
    ? (transactionType as FinanceTransactionType)
    : ''
  filters.status = statusValues.includes(status as FinanceLifecycleStatus)
    ? (status as FinanceLifecycleStatus)
    : ''
  filters.categoryId = queryText(routeQuery.categoryId)
  filters.bankAccountId = queryText(routeQuery.bankAccountId)
  filters.billingPeriodId = queryText(routeQuery.billingPeriodId)
  filters.dateFrom = queryText(routeQuery.dateFrom)
  filters.dateTo = queryText(routeQuery.dateTo)
  filters.minAmount = queryNumber(routeQuery.minAmount)
  filters.maxAmount = queryNumber(routeQuery.maxAmount)
  filters.counterparty = queryText(routeQuery.counterparty)
  filters.attachment =
    attachment === 'present' || attachment === 'missing' ? attachment : ''
  filters.mode = queryText(routeQuery.mode)
  filters.voucherNumber = queryText(routeQuery.voucherNumber)
  filters.highValueOnly = queryText(routeQuery.highValueOnly) === 'true'

  const routePageSize = queryNumber(routeQuery.pageSize)
  if (routePageSize && routePageSize > 0) {
    pageSize.value = Math.min(routePageSize, 2000)
  }
}

applyRouteFilters(route.query)

const [
  categoriesAsyncData,
  bankAccountsAsyncData,
  periodsAsyncData,
  societyAsyncData,
] = await Promise.all([
  useAsyncData(
    'finance-transactions-categories',
    () => api<CategoriesResponse>('/api/categories', { query: { isActive: 'true' } }),
  ),
  useAsyncData(
    'finance-transactions-bank-accounts',
    () =>
      api<BankAccountsResponse>('/api/admin/finance/bank-accounts', {
        query: { isActive: 'true' },
      }),
  ),
  useAsyncData(
    'finance-transactions-periods',
    () => api<PeriodsResponse>('/api/admin/billing/periods', { query: { pageSize: 200 } }),
  ),
  useAsyncData(
    'finance-transactions-society',
    () => api<SocietyResponse>('/api/admin/society/profile'),
  ),
])

const { data: categoriesData } = categoriesAsyncData
const { data: bankAccountsData } = bankAccountsAsyncData
const { data: periodsData } = periodsAsyncData
const { data: societyData } = societyAsyncData

const categories = computed(() => categoriesData.value?.data.items ?? [])
const bankAccounts = computed(() => bankAccountsData.value?.data.items ?? [])
const periods = computed(() => periodsData.value?.data.items ?? [])
const policy = computed(() => societyData.value?.data.settings)
const highValueThreshold = computed(() => policy.value?.highValueThreshold ?? 0)

const loadTransactions = () =>
  api<TransactionsResponse>('/api/admin/finance/transactions', {
    query: {
      ...query.value,
      page: page.value,
      pageSize: pageSize.value,
      sortBy: sortBy.value,
      sortDirection: sortDirection.value,
      highValueThreshold: highValueThreshold.value,
    },
  })

const transactionsListKey = computed(() =>
  [
    'finance-transactions-list',
    query.value,
    page.value,
    pageSize.value,
    sortBy.value,
    sortDirection.value,
    highValueThreshold.value,
  ]
    .map((item) => JSON.stringify(item))
    .join(':'),
)

const {
  data: transactionsData,
  pending,
} = await useAsyncData(transactionsListKey, loadTransactions, {
  watch: [transactionsListKey],
})

const transactions = computed(() => transactionsData.value?.data.items ?? [])
const totalRecords = computed(() => transactionsData.value?.data.total ?? 0)
const summary = computed(() => transactionsData.value?.data.summary ?? null)
const hasSummary = computed(() => summary.value !== null)
const reportRouteMatchesFilters = () => {
  const transactionType = queryText(route.query.transactionType).toUpperCase()
  const status = queryText(route.query.status).toUpperCase()

  return filters.transactionType === transactionType &&
    filters.status === status &&
    filters.categoryId === queryText(route.query.categoryId) &&
    filters.dateFrom === queryText(route.query.dateFrom) &&
    filters.dateTo === queryText(route.query.dateTo) &&
    filters.search === queryText(route.query.search) &&
    filters.bankAccountId === queryText(route.query.bankAccountId) &&
    filters.billingPeriodId === queryText(route.query.billingPeriodId) &&
    filters.minAmount === queryNumber(route.query.minAmount) &&
    filters.maxAmount === queryNumber(route.query.maxAmount) &&
    filters.counterparty === queryText(route.query.counterparty) &&
    filters.attachment === queryText(route.query.attachment) &&
    filters.mode === queryText(route.query.mode) &&
    filters.voucherNumber === queryText(route.query.voucherNumber) &&
    filters.highValueOnly === (queryText(route.query.highValueOnly) === 'true')
}

const reportDrilldown = computed(() => {
  if (queryText(route.query.source) !== 'report') return null
  if (!reportRouteMatchesFilters()) return null

  const amount = queryNumber(route.query.reportAmount)
  const dateText = filters.dateFrom && filters.dateTo
    ? `${formatDate(filters.dateFrom)} to ${formatDate(filters.dateTo)}`
    : ''

  return {
    label: queryText(route.query.reportDrilldown) || 'Report selection',
    amount,
    dateText,
  }
})

const kpis = computed(() => ({
  income: summary.value?.income
    ?? transactions.value
      .filter((item) => item.transactionType === 'INCOME')
      .reduce((sum, item) => sum + item.amount, 0),
  expense: summary.value?.expense
    ?? transactions.value
      .filter((item) => item.transactionType === 'EXPENSE')
      .reduce((sum, item) => sum + item.amount, 0),
  entryCount: summary.value ? totalRecords.value : transactions.value.length,
  missingAttachments: summary.value?.missingAttachments
    ?? transactions.value.filter((item) => !item.hasAttachments).length,
}))

const exportUrl = (format: 'pdf' | 'xlsx') => {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query.value)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }

  params.set('format', format)
  params.set('sortBy', sortBy.value)
  params.set('sortDirection', sortDirection.value)
  params.set('highValueThreshold', String(highValueThreshold.value))

  return `/api/admin/finance/transactions/export?${params.toString()}`
}

watch(query, () => {
  page.value = 1
})

watch(
  () => route.query,
  (routeQuery) => {
    applyRouteFilters(routeQuery)
    page.value = 1
  },
)

const onPage = (event: { page: number; rows: number }) => {
  page.value = event.page + 1
  pageSize.value = event.rows
}

const onSort = (event: { sortField?: string; sortOrder?: number }) => {
  if (event.sortField) {
    sortBy.value = event.sortField
  }
  sortDirection.value = event.sortOrder === 1 ? 'asc' : 'desc'
}

</script>

<template>
  <div class="landing-page">
    <div class="surface-grid">
      <section class="surface-card">
        <p class="eyebrow">Income</p>
        <h3>{{ formatMoney(kpis.income) }}</h3>
        <p>{{ hasSummary ? 'Total income in the current filter.' : 'Visible income in the current result set.' }}</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Expense</p>
        <h3>{{ formatMoney(kpis.expense) }}</h3>
        <p>{{ hasSummary ? 'Total expenses in the current filter.' : 'Visible expenses in the current result set.' }}</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Entries</p>
        <h3>{{ kpis.entryCount }}</h3>
        <p>{{ hasSummary ? 'Entries in the current filter.' : 'Visible entries in the current result set.' }}</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Missing files</p>
        <h3>{{ kpis.missingAttachments }}</h3>
        <p>{{ hasSummary ? 'Attachments not yet uploaded in the current filter.' : 'Attachments not yet uploaded.' }}</p>
      </section>
    </div>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Finance transactions</h1>
          <p>Review income, expenses, attachments, and audit trail.</p>
        </div>
        <div class="list-page__exports">
          <Button
            as="router-link"
            to="/admin/finance/transactions/new?type=expense"
            label="Add expense"
            icon="pi pi-minus-circle"
          />
          <Button
            as="router-link"
            to="/admin/finance/transactions/new?type=income"
            label="Add income"
            icon="pi pi-plus-circle"
            severity="secondary"
            outlined
          />
          <AppDocumentLink
            :href="exportUrl('pdf')"
            viewer-title="Finance transactions PDF"
            label="PDF"
            icon="pi pi-file-pdf"
            severity="secondary"
            outlined
          />
          <Button
            as="a"
            :href="exportUrl('xlsx')"
            label="Excel"
            icon="pi pi-file-excel"
            severity="secondary"
            outlined
            target="_blank"
          />
        </div>
      </header>

      <div v-if="reportDrilldown" class="report-drilldown-context">
        <div>
          <p class="eyebrow">Report drill-down</p>
          <h2>{{ reportDrilldown.label }}</h2>
          <p>{{ reportDrilldown.dateText }} · {{ totalRecords }} entries</p>
        </div>
        <strong v-if="reportDrilldown.amount !== null">{{ formatMoney(reportDrilldown.amount) }}</strong>
      </div>

      <FinanceFilterToolbar
        v-model:filters="filters"
        :categories="categories"
        :accounts="bankAccounts"
        :periods="periods"
        :high-value-threshold="highValueThreshold"
        @quick="applyQuickFilter($event, highValueThreshold)"
        @reset="resetFilters"
      />

      <TransactionDataTable
        :transactions="transactions"
        :loading="pending"
        :rows="pageSize"
        :total-records="totalRecords"
        @page="onPage"
        @sort="onSort"
      />
    </section>
  </div>
</template>
