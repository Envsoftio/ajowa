<script setup lang="ts">
import type {
  BankAccount,
  BillingPeriod,
  FinanceCategory,
  FinanceTransactionType,
  SocietyProfile,
} from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'New Finance Transaction',
})

type CategoriesResponse = { ok: true; data: { items: FinanceCategory[] } }
type BankAccountsResponse = { ok: true; data: { items: BankAccount[] } }
type PeriodsResponse = { ok: true; data: { items: BillingPeriod[] } }
type SocietyResponse = { ok: true; data: SocietyProfile }

const route = useRoute()
const api = useApi()
const { buildTransactionDetailLink, buildTransactionCreateLink } =
  useFinanceSharedReportLinks()

const routeType = computed<FinanceTransactionType>(() =>
  String(route.query.type ?? '').toLowerCase() === 'income' ? 'INCOME' : 'EXPENSE',
)

const { data: categoriesData } = await useAsyncData(
  'new-finance-categories',
  () => api<CategoriesResponse>('/api/categories', { query: { isActive: 'true' } }),
)
const { data: bankAccountsData } = await useAsyncData(
  'new-finance-bank-accounts',
  () =>
    api<BankAccountsResponse>('/api/admin/finance/bank-accounts', {
      query: { isActive: 'true' },
    }),
)
const { data: periodsData } = await useAsyncData(
  'new-finance-periods',
  () => api<PeriodsResponse>('/api/admin/billing/periods', { query: { pageSize: 200 } }),
)
const { data: societyData } = await useAsyncData('new-finance-society', () =>
  api<SocietyResponse>('/api/admin/society/profile'),
)

const success = ref<{
  id: string
  status: string
  attachmentUploaded: boolean
} | null>(null)

const categories = computed(() => categoriesData.value?.data.items ?? [])
const bankAccounts = computed(() => bankAccountsData.value?.data.items ?? [])
const periods = computed(() => periodsData.value?.data.items ?? [])
const policy = computed(() => societyData.value?.data.settings)
</script>

<template>
  <div class="landing-page">
    <section v-if="success" class="surface-card finance-success">
      <p class="eyebrow">Saved</p>
      <h1>Transaction recorded</h1>
      <dl>
        <div>
          <dt>Transaction</dt>
          <dd>{{ success.id }}</dd>
        </div>
        <div>
          <dt>Journal status</dt>
          <dd><StatusTag :status="success.status" /></dd>
        </div>
        <div>
          <dt>Attachment</dt>
          <dd>{{ success.attachmentUploaded ? 'Uploaded' : 'Not attached' }}</dd>
        </div>
      </dl>
      <div class="admin-inline-actions">
        <Button
          as="router-link"
          :to="buildTransactionDetailLink(success.id)"
          label="View"
          icon="pi pi-eye"
        />
        <Button
          as="router-link"
          :to="buildTransactionCreateLink(routeType === 'EXPENSE' ? 'expense' : 'income')"
          label="Add another"
          icon="pi pi-plus"
          severity="secondary"
          outlined
          @click="success = null"
        />
      </div>
    </section>

    <TransactionForm
      v-if="policy && !success"
      :initial-type="routeType"
      :categories="categories"
      :bank-accounts="bankAccounts"
      :periods="periods"
      :policy="policy"
      @created="success = $event"
    />
  </div>
</template>
