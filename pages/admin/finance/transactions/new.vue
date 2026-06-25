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

const DEFAULT_POLICY = {
  billingTenure: 'MONTHLY',
  excessPaymentHandling: 'KEEP_AS_ADVANCE',
  tenantPaymentsEnabled: true,
  familyAccessEnabled: true,
  notificationScope: 'CONFIGURABLE',
  financeApprovalRequired: true,
  attachmentsRequired: true,
  highValueThreshold: 10000,
  graceDays: 0,
  lateFeePerDay: 50,
} satisfies SocietyProfile['settings']

const route = useRoute()
const api = useApi()
const { buildTransactionDetailLink, buildTransactionCreateLink } =
  useFinanceSharedReportLinks()

const routeType = computed<FinanceTransactionType>(() =>
  String(route.query.type ?? '').toLowerCase() === 'income' ? 'INCOME' : 'EXPENSE',
)

const {
  data: categoriesData,
  pending: categoriesPending,
  error: categoriesError,
  refresh: refreshCategories,
} = await useAsyncData(
  'new-finance-categories',
  () => api<CategoriesResponse>('/api/categories', { query: { isActive: 'true' } }),
)
const {
  data: bankAccountsData,
  pending: bankAccountsPending,
  error: bankAccountsError,
  refresh: refreshBankAccounts,
} = await useAsyncData(
  'new-finance-bank-accounts',
  () =>
    api<BankAccountsResponse>('/api/admin/finance/bank-accounts', {
      query: { isActive: 'true' },
    }),
)
const {
  data: periodsData,
  pending: periodsPending,
  error: periodsError,
  refresh: refreshPeriods,
} = await useAsyncData(
  'new-finance-periods',
  () => api<PeriodsResponse>('/api/admin/billing/periods', { query: { pageSize: 200 } }),
)
const {
  data: societyData,
  pending: societyPending,
  error: societyError,
  refresh: refreshSociety,
} = await useAsyncData('new-finance-society', () =>
  api<SocietyResponse>('/api/admin/society/profile'),
)

const success = ref<{
  id: string
  status: string
  attachmentUploaded: boolean
  attachmentError?: string
} | null>(null)

const categories = computed(() => categoriesData.value?.data.items ?? [])
const bankAccounts = computed(() => bankAccountsData.value?.data.items ?? [])
const periods = computed(() => periodsData.value?.data.items ?? [])
const policy = computed(() => societyData.value?.data.settings ?? DEFAULT_POLICY)
const pending = computed(
  () =>
    categoriesPending.value ||
    bankAccountsPending.value ||
    periodsPending.value ||
    societyPending.value,
)
const loadError = computed(
  () =>
    categoriesError.value ||
    bankAccountsError.value ||
    periodsError.value ||
    societyError.value,
)

const refresh = async () => {
  await Promise.all([
    refreshCategories(),
    refreshBankAccounts(),
    refreshPeriods(),
    refreshSociety(),
  ])
}
</script>

<template>
  <div class="landing-page">
    <AppState
      v-if="pending"
      variant="loading"
      title="Loading finance form"
      message="Preparing categories, accounts, billing periods, and policies."
    />

    <AppState
      v-else-if="loadError"
      variant="error"
      title="Finance form unavailable"
      message="The setup data for this transaction could not be loaded."
      action-label="Retry"
      @retry="refresh"
    />

    <section v-else-if="success" class="surface-card finance-success">
      <p class="eyebrow">Saved</p>
      <h1>Entry saved</h1>
      <Message v-if="success.attachmentError" severity="error" :closable="false">
        Entry saved, but the attachment upload failed: {{ success.attachmentError }}
      </Message>
      <dl>
        <div>
          <dt>Entry</dt>
          <dd>{{ success.id }}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd><StatusTag :status="success.status" /></dd>
        </div>
        <div>
          <dt>Attachment</dt>
          <dd>
            {{
              success.attachmentError
                ? 'Upload failed'
                : success.attachmentUploaded
                  ? 'Uploaded'
                  : 'Not attached'
            }}
          </dd>
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

    <div v-else-if="!success" class="finance-entry-notices">
      <Message v-if="categories.length === 0" severity="warn" :closable="false">
        Add active finance categories before saving this transaction.
      </Message>
      <Message v-if="bankAccounts.length === 0" severity="warn" :closable="false">
        Add an active bank or cash account before saving this transaction.
      </Message>
    </div>

    <TransactionForm
      v-if="!pending && !loadError && !success"
      :initial-type="routeType"
      :categories="categories"
      :bank-accounts="bankAccounts"
      :periods="periods"
      :policy="policy"
      @created="success = $event"
    />
  </div>
</template>
