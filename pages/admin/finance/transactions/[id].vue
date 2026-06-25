<script setup lang="ts">
import type {
  BankAccount,
  BillingPeriod,
  FinanceCategory,
  FinanceTransactionDetail,
  SocietyProfile,
} from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Finance Transaction Detail',
})

type DetailResponse = { ok: true; data: FinanceTransactionDetail }
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
const toast = useToast()
const { formatMoney, formatDate, formatDateTime } = useFinanceFormatters()
const { buildTransactionCreateLink } = useFinanceSharedReportLinks()
const editing = ref(false)

const {
  data,
  pending,
  refresh: refreshDetail,
} = await useAsyncData(`finance-transaction-${route.params.id}`, () =>
  api<DetailResponse>(`/api/admin/finance/transactions/${route.params.id}`),
)
const {
  data: categoriesData,
  pending: categoriesPending,
  error: categoriesError,
} = await useAsyncData(`finance-transaction-${route.params.id}-categories`, () =>
  api<CategoriesResponse>('/api/categories', { query: { isActive: 'true' } }),
)
const {
  data: bankAccountsData,
  pending: bankAccountsPending,
  error: bankAccountsError,
} = await useAsyncData(`finance-transaction-${route.params.id}-accounts`, () =>
  api<BankAccountsResponse>('/api/admin/finance/bank-accounts', {
    query: { isActive: 'true' },
  }),
)
const {
  data: periodsData,
  pending: periodsPending,
  error: periodsError,
} = await useAsyncData(`finance-transaction-${route.params.id}-periods`, () =>
  api<PeriodsResponse>('/api/admin/billing/periods', { query: { pageSize: 200 } }),
)
const {
  data: societyData,
  pending: societyPending,
  error: societyError,
} = await useAsyncData(`finance-transaction-${route.params.id}-society`, () =>
  api<SocietyResponse>('/api/admin/society/profile'),
)

const detail = computed(() => data.value?.data ?? null)
const transaction = computed(() => detail.value?.transaction ?? null)
const activeAttachment = computed(
  () => detail.value?.attachments.find((attachment) => !attachment.replacedAt) ?? null,
)
const categories = computed(() => categoriesData.value?.data.items ?? [])
const bankAccounts = computed(() => bankAccountsData.value?.data.items ?? [])
const periods = computed(() => periodsData.value?.data.items ?? [])
const policy = computed(() => societyData.value?.data.settings ?? DEFAULT_POLICY)
const setupPending = computed(
  () =>
    categoriesPending.value ||
    bankAccountsPending.value ||
    periodsPending.value ||
    societyPending.value,
)
const setupError = computed(
  () =>
    categoriesError.value ||
    bankAccountsError.value ||
    periodsError.value ||
    societyError.value,
)

const onUpdated = async (payload: { attachmentUploaded: boolean }) => {
  toast.add({
    severity: 'success',
    summary: 'Entry updated',
    detail: payload.attachmentUploaded ? 'Saved with the new attachment.' : 'Saved changes.',
    life: 5000,
  })
  editing.value = false
  await refreshDetail()
}
</script>

<template>
  <div class="landing-page">
    <AppState
      v-if="pending"
      variant="loading"
      title="Loading transaction"
      message="Preparing the finance entry details."
    />
    <EmptyFinanceState
      v-else-if="!detail || !transaction"
      title="Transaction not found"
      message="The requested finance entry could not be loaded."
    />
    <template v-else>
      <section class="surface-card list-page">
        <header class="list-page__header">
          <div>
            <p class="eyebrow">{{ transaction.transactionType }}</p>
            <h1>{{ transaction.title }}</h1>
            <p>{{ transaction.counterpartyName || 'No vendor/source recorded' }}</p>
          </div>
          <div class="list-page__exports">
            <Button
              v-if="!editing"
              label="Edit"
              icon="pi pi-pencil"
              @click="editing = true"
            />
            <Button
              v-else
              label="Cancel"
              icon="pi pi-times"
              severity="secondary"
              outlined
              @click="editing = false"
            />
            <Button
              as="router-link"
              :to="buildTransactionCreateLink('expense')"
              label="Add expense"
              icon="pi pi-minus-circle"
              severity="secondary"
              outlined
            />
            <Button
              as="router-link"
              :to="buildTransactionCreateLink('income')"
              label="Add income"
              icon="pi pi-plus-circle"
              severity="secondary"
              outlined
            />
          </div>
        </header>
      </section>

      <AppState
        v-if="editing && setupPending"
        variant="loading"
        title="Loading edit form"
        message="Preparing categories, accounts, and policies."
      />
      <AppState
        v-else-if="editing && setupError"
        variant="error"
        title="Edit form unavailable"
        message="The setup data for this entry could not be loaded."
      />
      <TransactionForm
        v-else-if="editing"
        :initial-type="transaction.transactionType"
        :transaction="transaction"
        :categories="categories"
        :bank-accounts="bankAccounts"
        :periods="periods"
        :policy="policy"
        :replaces-attachment-id="activeAttachment?.id ?? null"
        @updated="onUpdated"
      />

      <template v-else>
        <div class="surface-grid">
          <section class="surface-card">
            <p class="eyebrow">Amount</p>
            <h3>{{ formatMoney(transaction.amount) }}</h3>
            <p>{{ formatDate(transaction.transactionDate) }}</p>
          </section>
          <section class="surface-card">
            <p class="eyebrow">Status</p>
            <h3><StatusTag :status="transaction.status" /></h3>
            <p>{{ transaction.postedAt ? `Recorded ${formatDateTime(transaction.postedAt)}` : 'Draft entry' }}</p>
          </section>
          <section class="surface-card">
            <p class="eyebrow">Attachment</p>
            <h3>{{ detail.attachments.length }}</h3>
            <p v-if="transaction.attachmentRequired && !transaction.hasAttachments">
              Required document missing.
            </p>
            <p v-else>Attachment history retained.</p>
          </section>
        </div>

        <div class="admin-two-column admin-two-column--wide">
          <section class="surface-card admin-form-section">
            <div class="admin-form-section__header">
              <div>
                <p class="eyebrow">Details</p>
                <h2>Entry details</h2>
              </div>
            </div>
            <dl class="finance-detail-grid">
              <div>
                <dt>Category</dt>
                <dd>{{ transaction.categoryGroup }} - {{ transaction.categoryName }}</dd>
              </div>
              <div>
                <dt>Bank/cash account</dt>
                <dd>{{ transaction.bankAccountName || '-' }}</dd>
              </div>
              <div>
                <dt>Billing period</dt>
                <dd>{{ transaction.billingPeriodLabel || 'Not allocated' }}</dd>
              </div>
              <div>
                <dt>Reference</dt>
                <dd>{{ transaction.voucherNumber || '-' }}</dd>
              </div>
              <div>
                <dt>Created by</dt>
                <dd>{{ transaction.createdByName || '-' }}</dd>
              </div>
              <div>
                <dt>Recorded at</dt>
                <dd>{{ formatDateTime(transaction.postedAt) }}</dd>
              </div>
            </dl>
          </section>

          <aside class="admin-form-layout">
            <section class="surface-card admin-form-section">
              <div class="admin-form-section__header">
                <div>
                  <p class="eyebrow">Documents</p>
                  <h2>Attachment preview</h2>
                </div>
              </div>
              <Message
                v-if="transaction.attachmentRequired && !detail.attachments.length"
                severity="error"
                :closable="false"
              >
                Required attachment missing.
              </Message>
              <AttachmentPreview
                v-for="attachment in detail.attachments"
                :key="attachment.id"
                :attachment="attachment"
                :transaction-id="transaction.id"
              />
              <EmptyFinanceState
                v-if="detail.attachments.length === 0"
                title="No attachments"
                message="No finance document is linked to this transaction."
              />
            </section>

            <section class="surface-card admin-form-section">
              <div class="admin-form-section__header">
                <div>
                  <p class="eyebrow">Audit</p>
                  <h2>Timeline</h2>
                </div>
              </div>
              <FinanceAuditTimeline :events="detail.auditEvents" />
            </section>
          </aside>
        </div>
      </template>
    </template>

  </div>
</template>
