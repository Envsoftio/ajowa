<script setup lang="ts">
import { getApiErrorMessage } from '~/composables/useApi'
import type {
  BankAccount,
  BillingPeriod,
  FinanceCategory,
  FinancePaymentMode,
  FinanceTransactionDetail,
  SocietyProfile,
} from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Finance Transaction Detail',
})

type DetailResponse = { ok: true; data: FinanceTransactionDetail }
type ExpensePaymentResponse = { ok: true; data: { id: string; amount: number; journalVoucherNumber: string | null } }
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
const paymentDialogVisible = ref(false)
const recordingPayment = ref(false)

const paymentModes: Array<{ label: string; value: FinancePaymentMode }> = [
  { label: 'Cash', value: 'CASH' },
  { label: 'Bank transfer', value: 'BANK_TRANSFER' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Cheque', value: 'CHEQUE' },
  { label: 'Card', value: 'CARD' },
  { label: 'Other', value: 'OTHER' },
]

const paymentForm = reactive({
  paymentDate: '',
  mode: 'BANK_TRANSFER' as FinancePaymentMode,
  referenceNumber: '',
  notes: '',
})

const [
  detailAsyncData,
  categoriesAsyncData,
  bankAccountsAsyncData,
  periodsAsyncData,
  societyAsyncData,
] = await Promise.all([
  useAsyncData(`finance-transaction-${route.params.id}`, () =>
    api<DetailResponse>(`/api/admin/finance/transactions/${route.params.id}`),
  ),
  useAsyncData(`finance-transaction-${route.params.id}-categories`, () =>
    api<CategoriesResponse>('/api/categories', { query: { isActive: 'true' } }),
  ),
  useAsyncData(`finance-transaction-${route.params.id}-accounts`, () =>
    api<BankAccountsResponse>('/api/admin/finance/bank-accounts', {
      query: { isActive: 'true' },
    }),
  ),
  useAsyncData(`finance-transaction-${route.params.id}-periods`, () =>
    api<PeriodsResponse>('/api/admin/billing/periods', { query: { pageSize: 200 } }),
  ),
  useAsyncData(`finance-transaction-${route.params.id}-society`, () =>
    api<SocietyResponse>('/api/admin/society/profile'),
  ),
])

const {
  data,
  pending,
  refresh: refreshDetail,
} = detailAsyncData
const {
  data: categoriesData,
  pending: categoriesPending,
  error: categoriesError,
} = categoriesAsyncData
const {
  data: bankAccountsData,
  pending: bankAccountsPending,
  error: bankAccountsError,
} = bankAccountsAsyncData
const {
  data: periodsData,
  pending: periodsPending,
  error: periodsError,
} = periodsAsyncData
const {
  data: societyData,
  pending: societyPending,
  error: societyError,
} = societyAsyncData

const detail = computed(() => data.value?.data ?? null)
const transaction = computed(() => detail.value?.transaction ?? null)
const expensePayments = computed(() => detail.value?.expensePayments ?? [])
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
const canRecordExpensePayment = computed(
  () =>
    transaction.value?.transactionType === 'EXPENSE' &&
    transaction.value.status === 'POSTED' &&
    expensePayments.value.length === 0,
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

const resetPaymentForm = () => {
  paymentForm.paymentDate = transaction.value?.transactionDate ?? new Date().toISOString().slice(0, 10)
  paymentForm.mode = 'BANK_TRANSFER'
  paymentForm.referenceNumber = transaction.value?.voucherNumber ?? ''
  paymentForm.notes = ''
}

const openPaymentDialog = () => {
  resetPaymentForm()
  paymentDialogVisible.value = true
}

const recordExpensePayment = async () => {
  if (!transaction.value?.bankAccountId) {
    toast.add({
      severity: 'warn',
      summary: 'Paid-from account missing',
      detail: 'Edit the expense and select the posted paid-from account first.',
      life: 10000,
    })
    return
  }
  if (!paymentForm.paymentDate) {
    toast.add({ severity: 'warn', summary: 'Payment date required', life: 10000 })
    return
  }

  recordingPayment.value = true
  try {
    await api<ExpensePaymentResponse>(
      `/api/admin/finance/transactions/${transaction.value.id}/payments`,
      {
        method: 'POST',
        body: {
          bankAccountId: transaction.value.bankAccountId,
          paymentDate: paymentForm.paymentDate,
          mode: paymentForm.mode,
          referenceNumber: paymentForm.referenceNumber || null,
          notes: paymentForm.notes || null,
        },
      },
    )
    toast.add({
      severity: 'success',
      summary: 'Payment recorded',
      detail: 'The expense now has a linked payment record.',
      life: 5000,
    })
    paymentDialogVisible.value = false
    await refreshDetail()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Payment not recorded',
      detail: getApiErrorMessage(error, 'The payment record could not be saved.'),
      life: 12000,
    })
  } finally {
    recordingPayment.value = false
  }
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
              v-if="!editing && canRecordExpensePayment"
              label="Record payment"
              icon="pi pi-wallet"
              severity="secondary"
              outlined
              @click="openPaymentDialog"
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
          <section v-if="transaction.transactionType === 'EXPENSE'" class="surface-card">
            <p class="eyebrow">Payment</p>
            <h3>{{ expensePayments.length ? 'Recorded' : 'Pending' }}</h3>
            <p>
              {{
                expensePayments[0]
                  ? `${formatMoney(expensePayments[0].amount)} on ${formatDate(expensePayments[0].paymentDate)}`
                  : 'No payment record is linked yet.'
              }}
            </p>
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
            <section v-if="transaction.transactionType === 'EXPENSE'" class="surface-card admin-form-section">
              <div class="admin-form-section__header">
                <div>
                  <p class="eyebrow">Payment</p>
                  <h2>Expense payment</h2>
                </div>
                <Button
                  v-if="canRecordExpensePayment"
                  label="Record"
                  icon="pi pi-wallet"
                  size="small"
                  @click="openPaymentDialog"
                />
              </div>
              <dl v-if="expensePayments[0]" class="finance-detail-grid">
                <div>
                  <dt>Amount</dt>
                  <dd>{{ formatMoney(expensePayments[0].amount) }}</dd>
                </div>
                <div>
                  <dt>Payment date</dt>
                  <dd>{{ formatDate(expensePayments[0].paymentDate) }}</dd>
                </div>
                <div>
                  <dt>Paid from</dt>
                  <dd>{{ expensePayments[0].bankAccountName || '-' }}</dd>
                </div>
                <div>
                  <dt>Mode</dt>
                  <dd>{{ expensePayments[0].mode }}</dd>
                </div>
                <div>
                  <dt>Reference</dt>
                  <dd>{{ expensePayments[0].referenceNumber || '-' }}</dd>
                </div>
                <div>
                  <dt>Journal</dt>
                  <dd>{{ expensePayments[0].journalVoucherNumber || '-' }}</dd>
                </div>
                <div>
                  <dt>Recorded by</dt>
                  <dd>{{ expensePayments[0].createdByName || '-' }}</dd>
                </div>
                <div>
                  <dt>Recorded at</dt>
                  <dd>{{ formatDateTime(expensePayments[0].createdAt) }}</dd>
                </div>
              </dl>
              <Message v-else severity="warn" :closable="false">
                This posted expense does not have a linked payment record yet.
              </Message>
            </section>

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

    <Dialog
      v-model:visible="paymentDialogVisible"
      header="Record expense payment"
      modal
      :style="{ width: '640px', maxWidth: '95vw' }"
    >
      <form class="admin-form-layout" @submit.prevent="recordExpensePayment">
        <Message severity="info" :closable="false">
          This creates a payment record for the already-posted expense amount of
          {{ formatMoney(transaction?.amount ?? 0) }}.
        </Message>
        <div class="admin-form-grid">
          <label>
            <span class="field-label">Paid-from account</span>
            <InputText :model-value="transaction?.bankAccountName || '-'" disabled />
          </label>
          <label>
            <span class="field-label">Payment date</span>
            <InputText v-model="paymentForm.paymentDate" type="date" required />
          </label>
          <label>
            <span class="field-label">Mode</span>
            <Select
              v-model="paymentForm.mode"
              :options="paymentModes"
              option-label="label"
              option-value="value"
            />
          </label>
          <label>
            <span class="field-label">Reference</span>
            <InputText v-model="paymentForm.referenceNumber" placeholder="UTR, cheque, or voucher" />
          </label>
          <label class="admin-form-grid__full">
            <span class="field-label">Notes</span>
            <Textarea v-model="paymentForm.notes" rows="3" auto-resize />
          </label>
        </div>
        <div class="admin-inline-actions">
          <Button
            type="button"
            label="Cancel"
            icon="pi pi-times"
            severity="secondary"
            outlined
            @click="paymentDialogVisible = false"
          />
          <Button
            type="submit"
            label="Record payment"
            icon="pi pi-wallet"
            :loading="recordingPayment"
          />
        </div>
      </form>
    </Dialog>
  </div>
</template>
