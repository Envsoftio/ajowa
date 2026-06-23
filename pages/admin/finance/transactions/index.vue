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
const { formatMoney } = useFinanceFormatters()

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
}

applyRouteFilters(route.query)

const { data: categoriesData } = await useAsyncData(
  'finance-transactions-categories',
  () => api<CategoriesResponse>('/api/categories', { query: { isActive: 'true' } }),
)
const { data: bankAccountsData } = await useAsyncData(
  'finance-transactions-bank-accounts',
  () =>
    api<BankAccountsResponse>('/api/admin/finance/bank-accounts', {
      query: { isActive: 'true' },
    }),
)
const { data: periodsData } = await useAsyncData(
  'finance-transactions-periods',
  () => api<PeriodsResponse>('/api/admin/billing/periods', { query: { pageSize: 200 } }),
)
const { data: societyData } = await useAsyncData(
  'finance-transactions-society',
  () => api<SocietyResponse>('/api/admin/society/profile'),
)

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

const {
  data: transactionsData,
  pending,
} = await useAsyncData('finance-transactions-list', loadTransactions, {
  watch: [query, page, pageSize, sortBy, sortDirection, highValueThreshold],
})

const transactions = computed(() => transactionsData.value?.data.items ?? [])
const totalRecords = computed(() => transactionsData.value?.data.total ?? 0)

const kpis = computed(() => ({
  income: transactions.value
    .filter((item) => item.transactionType === 'INCOME')
    .reduce((sum, item) => sum + item.amount, 0),
  expense: transactions.value
    .filter((item) => item.transactionType === 'EXPENSE')
    .reduce((sum, item) => sum + item.amount, 0),
  entryCount: transactions.value.length,
  missingAttachments: transactions.value.filter(
    (item) => item.attachmentRequired && !item.hasAttachments,
  ).length,
}))

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
        <p>Visible income in the current result set.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Expense</p>
        <h3>{{ formatMoney(kpis.expense) }}</h3>
        <p>Visible expenses in the current result set.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Entries</p>
        <h3>{{ kpis.entryCount }}</h3>
        <p>Visible entries in the current result set.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Missing files</p>
        <h3>{{ kpis.missingAttachments }}</h3>
        <p>Required attachments not yet uploaded.</p>
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
        </div>
      </header>

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
