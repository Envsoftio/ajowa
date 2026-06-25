<script setup lang="ts">
import type {
  AccountHead,
  BankAccount,
  BillingPeriod,
  FinanceCategory,
  FinanceTransaction,
  FinanceTransactionType,
} from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Finance Journals',
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
type CategoryCreateResponse = { ok: true; data: { id: string } }
type AccountsResponse = { ok: true; data: { items: AccountHead[] } }
type BankAccountsResponse = { ok: true; data: { items: BankAccount[] } }
type BillingPeriodsResponse = { ok: true; data: { items: BillingPeriod[] } }

const api = useApi()
const toast = useToast()
const confirmAction = useAppConfirm()
const { reasonDialog, requestReason, acceptReason, cancelReason } = useAppReasonDialog()

const search = ref('')
const statusFilter = ref('')
const typeFilter = ref('')
const dialog = ref(false)
const saving = ref(false)
const categoryDialog = ref(false)
const categorySaving = ref(false)
const page = ref(1)
const pageSize = ref(20)

const form = reactive<{
  transactionType: FinanceTransactionType
  categoryId: string
  bankAccountId: string
  billingPeriodId: string | null
  title: string
  description: string
  counterpartyName: string
  voucherNumber: string
  transactionDate: string
  amount: number
  submitForPosting: boolean
}>({
  transactionType: 'EXPENSE',
  categoryId: '',
  bankAccountId: '',
  billingPeriodId: null,
  title: '',
  description: '',
  counterpartyName: '',
  voucherNumber: '',
  transactionDate: new Date().toISOString().slice(0, 10),
  amount: 0,
  submitForPosting: true,
})

const categoryForm = reactive<{
  code: string
  name: string
  transactionType: FinanceTransactionType
  categoryGroup: string
  accountHeadId: string
  requiresAttachment: boolean
  isActive: boolean
}>({
  code: '',
  name: '',
  transactionType: 'EXPENSE',
  categoryGroup: '',
  accountHeadId: '',
  requiresAttachment: false,
  isActive: true,
})

const loadTransactions = () =>
  api<TransactionsResponse>('/api/admin/finance/transactions', {
    query: {
      search: search.value,
      status: statusFilter.value,
      transactionType: typeFilter.value,
      page: page.value,
      pageSize: pageSize.value,
    },
  })

const [
  transactionsAsyncData,
  categoriesAsyncData,
  accountsAsyncData,
  bankAccountsAsyncData,
  periodsAsyncData,
] = await Promise.all([
  useAsyncData('admin-finance-transactions', loadTransactions, {
    watch: [search, statusFilter, typeFilter, page, pageSize],
  }),
  useAsyncData(
    'admin-finance-transaction-categories',
    () =>
      api<CategoriesResponse>('/api/categories', { query: { isActive: 'true' } }),
  ),
  useAsyncData(
    'admin-finance-transaction-accounts',
    () =>
      api<AccountsResponse>('/api/admin/finance/accounts', {
        query: { isActive: 'true' },
      }),
  ),
  useAsyncData(
    'admin-finance-transaction-bank-accounts',
    () =>
      api<BankAccountsResponse>('/api/admin/finance/bank-accounts', {
        query: { isActive: 'true' },
      }),
  ),
  useAsyncData(
    'admin-finance-transaction-periods',
    () => api<BillingPeriodsResponse>('/api/admin/billing/periods'),
  ),
])

const {
  data: transactionsData,
  pending,
  refresh,
} = transactionsAsyncData
const { data: categoriesData, refresh: refreshCategories } = categoriesAsyncData
const { data: accountsData } = accountsAsyncData
const { data: bankAccountsData } = bankAccountsAsyncData
const { data: periodsData } = periodsAsyncData

const transactions = computed(() => transactionsData.value?.data.items ?? [])
const totalRecords = computed(() => transactionsData.value?.data.total ?? 0)
const categories = computed(() => categoriesData.value?.data.items ?? [])
const accounts = computed(() => accountsData.value?.data.items ?? [])
const bankAccounts = computed(() => bankAccountsData.value?.data.items ?? [])
const periods = computed(() => periodsData.value?.data.items ?? [])

const categoryOptions = computed(() =>
  categories.value
    .filter(
      (category) =>
        category.transactionType === form.transactionType && category.isActive,
    )
    .map((category) => ({
      label: `${category.categoryGroup} - ${category.name}`,
      value: category.id,
    })),
)

const bankOptions = computed(() =>
  bankAccounts.value
    .filter((account) => account.isActive)
    .map((account) => ({
      label: `${account.accountName} (${account.accountNumberMasked})`,
      value: account.id,
    })),
)

const categoryAccountOptions = computed(() =>
  accounts.value
    .filter(
      (account) =>
        account.headType === categoryForm.transactionType &&
        account.isActive &&
        account.allowsManualEntries,
    )
    .map((account) => ({
      label: `${account.code} - ${account.name}`,
      value: account.id,
    })),
)

const periodOptions = computed(() => [
  { label: 'No billing period', value: null },
  ...periods.value.map((period) => ({ label: period.label, value: period.id })),
])

const statusSeverity = (status: string) => {
  if (status === 'POSTED') return 'success'
  if (status === 'PENDING_REVIEW') return 'warn'
  if (status === 'REJECTED' || status === 'REVERSED') return 'danger'
  return 'secondary'
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    value,
  )

const summary = computed(() => {
  const rows = transactions.value

  return {
    visibleAmount: rows.reduce((sum, row) => sum + row.amount, 0),
    posted: rows.filter((row) => row.status === 'POSTED').length,
    needsReview: rows.filter((row) =>
      ['DRAFT', 'PENDING_REVIEW', 'RETURNED'].includes(row.status),
    ).length,
  }
})

watch(
  () => form.transactionType,
  () => {
    if (
      !categoryOptions.value.some((option) => option.value === form.categoryId)
    ) {
      form.categoryId = categoryOptions.value[0]?.value ?? ''
    }
  },
)

watch(
  () => categoryForm.transactionType,
  () => {
    if (
      !categoryAccountOptions.value.some(
        (option) => option.value === categoryForm.accountHeadId,
      )
    ) {
      categoryForm.accountHeadId = categoryAccountOptions.value[0]?.value ?? ''
    }
  },
)

const resetForm = () => {
  form.transactionType = 'EXPENSE'
  form.categoryId = categoryOptions.value[0]?.value ?? ''
  form.bankAccountId = bankOptions.value[0]?.value ?? ''
  form.billingPeriodId = null
  form.title = ''
  form.description = ''
  form.counterpartyName = ''
  form.voucherNumber = ''
  form.transactionDate = new Date().toISOString().slice(0, 10)
  form.amount = 0
  form.submitForPosting = true
}

const openCreate = async () => {
  await refreshCategories()
  resetForm()
  dialog.value = true
}

const openCategoryCreate = () => {
  categoryForm.code = ''
  categoryForm.name = ''
  categoryForm.transactionType = form.transactionType
  categoryForm.categoryGroup = ''
  categoryForm.accountHeadId = categoryAccountOptions.value[0]?.value ?? ''
  categoryForm.requiresAttachment = form.transactionType === 'EXPENSE'
  categoryForm.isActive = true
  categoryDialog.value = true
}

const submitCategory = async () => {
  categorySaving.value = true
  try {
    const response = await api<CategoryCreateResponse>(
      '/api/admin/finance/categories',
      {
        method: 'POST',
        body: { ...categoryForm },
      },
    )
    await refreshCategories()
    form.transactionType = categoryForm.transactionType
    form.categoryId = response.data.id
    categoryDialog.value = false
    toast.add({
      severity: 'success',
      summary: 'Category added',
      detail: 'New category is selected for this transaction.',
      life: 10000,
    })
  } finally {
    categorySaving.value = false
  }
}

const submitTransaction = async () => {
  saving.value = true
  try {
    await api('/api/admin/finance/transactions', {
      method: 'POST',
      body: {
        ...form,
        billingPeriodId: form.billingPeriodId || null,
        description: form.description || null,
        counterpartyName: form.counterpartyName || null,
        voucherNumber: form.voucherNumber || null,
      },
    })
    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: 'Finance transaction saved.',
      life: 10000,
    })
    dialog.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

const approve = async (transaction: FinanceTransaction) => {
  const confirmed = await confirmAction({
    header: 'Approve transaction?',
    message: `Approve and post ${transaction.title}? This will create journal entries.`,
    icon: 'pi pi-check-circle',
    acceptLabel: 'Approve',
    acceptSeverity: 'success',
  })

  if (!confirmed) {
    return
  }

  await api(`/api/admin/finance/transactions/${transaction.id}/approve`, {
    method: 'POST',
  })
  toast.add({
    severity: 'success',
    summary: 'Posted',
    detail: 'Transaction approved and journal posted.',
    life: 10000,
  })
  await refresh()
}

const reject = async (
  transaction: FinanceTransaction,
  returnForCorrection = false,
) => {
  const reason = await requestReason({
    header: returnForCorrection ? 'Return transaction?' : 'Reject transaction?',
    message: returnForCorrection
      ? `Add a reason for returning ${transaction.title}.`
      : `Add a reason for rejecting ${transaction.title}.`,
    acceptLabel: returnForCorrection ? 'Return' : 'Reject',
    acceptSeverity: returnForCorrection ? 'warn' : 'danger',
  })

  if (!reason) return
  await api(`/api/admin/finance/transactions/${transaction.id}/reject`, {
    method: 'POST',
    body: { reason, returnForCorrection },
  })
  toast.add({
    severity: 'success',
    summary: 'Updated',
    detail: returnForCorrection
      ? 'Transaction returned.'
      : 'Transaction rejected.',
    life: 10000,
  })
  await refresh()
}

const reverse = async (transaction: FinanceTransaction) => {
  const reason = await requestReason({
    header: 'Reverse transaction?',
    message: `Add a reason for reversing ${transaction.title}. A counter-entry journal will be posted.`,
    acceptLabel: 'Reverse',
    acceptSeverity: 'danger',
  })

  if (!reason) return
  await api(`/api/admin/finance/transactions/${transaction.id}/reverse`, {
    method: 'POST',
    body: { reason },
  })
  toast.add({
    severity: 'success',
    summary: 'Reversed',
    detail: 'Counter-entry journal posted.',
    life: 10000,
  })
  await refresh()
}

const onPage = (event: { page: number; rows: number }) => {
  page.value = event.page + 1
  pageSize.value = event.rows
}
</script>

<template>
  <div class="landing-page">
    <div class="surface-grid">
      <section class="surface-card">
        <p class="eyebrow">Visible value</p>
        <h3>{{ formatMoney(summary.visibleAmount) }}</h3>
        <p>Total amount across the current journal rows.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Posted</p>
        <h3>{{ summary.posted }}</h3>
        <p>Transactions already posted to the ledger.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Needs review</p>
        <h3>{{ summary.needsReview }}</h3>
        <p>Draft, pending, or returned transactions awaiting action.</p>
      </section>
    </div>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Finance journals</h1>
          <p>
            Create income and expense records, review approvals, and reverse
            posted entries through counter-journals.
          </p>
        </div>
        <Button label="New transaction" icon="pi pi-plus" @click="openCreate" />
      </header>

      <div class="admin-page-guide">
        <h2>How to use this page</h2>
        <p>
          Use this page to enter finance transactions and control when they
          become posted journal entries.
        </p>
        <ol>
          <li>
            Create a transaction as income or expense, then choose the category
            and bank account.
          </li>
          <li>
            Submit for posting when it is ready for ledger impact, or keep it as
            a draft for review.
          </li>
          <li>
            Use return, reject, or reverse actions to keep corrections audited
            instead of editing posted balances directly.
          </li>
        </ol>
      </div>

      <div class="list-page__toolbar">
        <label class="list-page__search">
          <span class="field-label">
            Search
            <i
              class="pi pi-info-circle"
              title="Find transactions by title, vendor or source, voucher number, or category."
              aria-label="Find transactions by title, vendor or source, voucher number, or category."
            />
          </span>
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText
              v-model="search"
              placeholder="Search title, vendor, voucher, category"
            />
          </IconField>
        </label>
        <div class="list-page__filters">
          <label>
            <span class="field-label">
              Type
              <i
                class="pi pi-info-circle"
                title="Filter by income transactions, expense transactions, or both."
                aria-label="Filter by income transactions, expense transactions, or both."
              />
            </span>
            <Select
              v-model="typeFilter"
              :options="[
                { label: 'All types', value: '' },
                { label: 'Income', value: 'INCOME' },
                { label: 'Expense', value: 'EXPENSE' },
              ]"
              option-label="label"
              option-value="value"
            />
          </label>
          <label>
            <span class="field-label">
              Status
              <i
                class="pi pi-info-circle"
                title="Filter by review and posting state, such as draft, posted, rejected, or reversed."
                aria-label="Filter by review and posting state, such as draft, posted, rejected, or reversed."
              />
            </span>
            <Select
              v-model="statusFilter"
              :options="[
                { label: 'All statuses', value: '' },
                { label: 'Draft', value: 'DRAFT' },
                { label: 'Pending review', value: 'PENDING_REVIEW' },
                { label: 'Posted', value: 'POSTED' },
                { label: 'Returned', value: 'RETURNED' },
                { label: 'Rejected', value: 'REJECTED' },
                { label: 'Reversed', value: 'REVERSED' },
              ]"
              option-label="label"
              option-value="value"
            />
          </label>
        </div>
      </div>

      <AppDataTable
        :value="transactions"
        :loading="pending"
        :paginator="true"
        :rows="pageSize"
        :total-records="totalRecords"
        lazy
        responsive-layout="scroll"
        class="list-page__table"
        @page="onPage"
      >
        <Column field="transactionDate" header="Date" />
        <Column field="title" header="Transaction" />
        <Column field="transactionType" header="Type" />
        <Column field="categoryName" header="Category" />
        <Column field="counterpartyName" header="Vendor/source" />
        <Column field="bankAccountName" header="Account" />
        <Column field="amount" header="Amount">
          <template #body="{ data: row }">
            {{ formatMoney(row.amount) }}
          </template>
        </Column>
        <Column field="status" header="Status">
          <template #body="{ data: row }">
            <Tag
              :value="row.status"
              :severity="statusSeverity(row.status)"
              rounded
            />
          </template>
        </Column>
        <Column field="journalVoucherNumber" header="Journal" />
        <Column header="Actions" style="width: 190px">
          <template #body="{ data: row }">
            <div class="admin-inline-actions" style="gap: 0.15rem">
              <Button
                v-if="
                  ['DRAFT', 'PENDING_REVIEW', 'RETURNED'].includes(row.status)
                "
                icon="pi pi-check"
                severity="success"
                text
                rounded
                :aria-label="`Approve and post ${row.title}`"
                :title="`Approve and post ${row.title}`"
                @click="approve(row)"
              />
              <Button
                v-if="
                  ['DRAFT', 'PENDING_REVIEW', 'RETURNED'].includes(row.status)
                "
                icon="pi pi-replay"
                severity="secondary"
                text
                rounded
                :aria-label="`Return ${row.title} for correction`"
                :title="`Return ${row.title} for correction`"
                @click="reject(row, true)"
              />
              <Button
                v-if="
                  ['DRAFT', 'PENDING_REVIEW', 'RETURNED'].includes(row.status)
                "
                icon="pi pi-times"
                severity="danger"
                text
                rounded
                :aria-label="`Reject ${row.title}`"
                :title="`Reject ${row.title}`"
                @click="reject(row)"
              />
              <Button
                v-if="row.status === 'POSTED'"
                icon="pi pi-undo"
                severity="danger"
                text
                rounded
                :aria-label="`Reverse ${row.title}`"
                :title="`Reverse ${row.title}`"
                @click="reverse(row)"
              />
            </div>
          </template>
        </Column>
      </AppDataTable>
    </section>

    <Dialog
      v-model:visible="dialog"
      header="New finance transaction"
      modal
      class="p-dialog-custom"
      :style="{ width: '720px' }"
    >
      <form
        class="admin-form-layout"
        style="padding: 1.5rem 0 0"
        @submit.prevent="submitTransaction"
      >
        <div class="admin-page-guide">
          <h2>Transaction form</h2>
          <p>
            Enter the source record first. If submitted for posting, the ledger
            journal is created from the category and bank account mapping.
          </p>
        </div>
        <div class="admin-form-grid">
          <label>
            <span class="field-label">
              Type
              <i
                class="pi pi-info-circle"
                title="Choose Expense for money going out or Income for money coming in."
                aria-label="Choose Expense for money going out or Income for money coming in."
              />
            </span>
            <Select
              v-model="form.transactionType"
              :options="[
                { label: 'Expense', value: 'EXPENSE' },
                { label: 'Income', value: 'INCOME' },
              ]"
              option-label="label"
              option-value="value"
            />
          </label>
          <label>
            <span class="field-label">
              Category
              <i
                class="pi pi-info-circle"
                title="Transaction purpose. The selected category decides the income or expense posting account."
                aria-label="Transaction purpose. The selected category decides the income or expense posting account."
              />
            </span>
            <div class="admin-inline-actions" style="gap: 0.5rem">
              <Select
                v-model="form.categoryId"
                :options="categoryOptions"
                option-label="label"
                option-value="value"
                required
                style="flex: 1"
              />
              <Button
                type="button"
                icon="pi pi-plus"
                severity="secondary"
                outlined
                aria-label="Add category"
                title="Add category"
                @click="openCategoryCreate"
              />
            </div>
          </label>
          <label>
            <span class="field-label">
              Paid/received account
              <i
                class="pi pi-info-circle"
                title="Bank or cash account where money was paid from or received into."
                aria-label="Bank or cash account where money was paid from or received into."
              />
            </span>
            <Select
              v-model="form.bankAccountId"
              :options="bankOptions"
              option-label="label"
              option-value="value"
              required
            />
          </label>
          <label>
            <span class="field-label">
              Billing period
              <i
                class="pi pi-info-circle"
                title="Optional billing period link when this transaction belongs to a maintenance cycle."
                aria-label="Optional billing period link when this transaction belongs to a maintenance cycle."
              />
            </span>
            <Select
              v-model="form.billingPeriodId"
              :options="periodOptions"
              option-label="label"
              option-value="value"
            />
          </label>
          <label>
            <span class="field-label">
              Title
              <i
                class="pi pi-info-circle"
                title="Short transaction title shown in finance lists and audit views."
                aria-label="Short transaction title shown in finance lists and audit views."
              />
            </span>
            <InputText v-model="form.title" required />
          </label>
          <label>
            <span class="field-label">
              Vendor/source
              <i
                class="pi pi-info-circle"
                title="Vendor for expenses or source/payer for income."
                aria-label="Vendor for expenses or source/payer for income."
              />
            </span>
            <InputText v-model="form.counterpartyName" />
          </label>
          <label>
            <span class="field-label">
              Date
              <i
                class="pi pi-info-circle"
                title="Transaction date used for reports and period-close checks."
                aria-label="Transaction date used for reports and period-close checks."
              />
            </span>
            <InputText v-model="form.transactionDate" type="date" required />
          </label>
          <label>
            <span class="field-label">
              Amount
              <i
                class="pi pi-info-circle"
                title="Total transaction amount in INR."
                aria-label="Total transaction amount in INR."
              />
            </span>
            <InputNumber
              v-model="form.amount"
              mode="currency"
              currency="INR"
              locale="en-IN"
              :min="0"
              required
            />
          </label>
          <label>
            <span class="field-label">
              Reference
              <i
                class="pi pi-info-circle"
                title="Optional voucher, invoice, receipt, or bank reference number."
                aria-label="Optional voucher, invoice, receipt, or bank reference number."
              />
            </span>
            <InputText v-model="form.voucherNumber" />
          </label>
          <label class="admin-toggle-card">
            <span class="field-label">
              Submit for posting
              <i
                class="pi pi-info-circle"
                title="Turn on to send the transaction for ledger posting immediately; turn off to keep it as draft."
                aria-label="Turn on to send the transaction for ledger posting immediately; turn off to keep it as draft."
              />
            </span>
            <ToggleSwitch v-model="form.submitForPosting" />
          </label>
          <label style="grid-column: 1 / -1">
            <span class="field-label">
              Description
              <i
                class="pi pi-info-circle"
                title="Optional note with extra context for reviewers and auditors."
                aria-label="Optional note with extra context for reviewers and auditors."
              />
            </span>
            <Textarea v-model="form.description" rows="3" auto-resize />
          </label>
        </div>
        <div
          class="admin-inline-actions"
          style="justify-content: flex-end; margin-top: 2rem; gap: 0.75rem"
        >
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            outlined
            @click="dialog = false"
          />
          <Button type="submit" label="Save transaction" :loading="saving" />
        </div>
      </form>
    </Dialog>

    <Dialog
      v-model:visible="categoryDialog"
      header="Add category"
      modal
      class="p-dialog-custom"
      :style="{ width: '560px' }"
    >
      <form
        class="admin-form-layout"
        style="padding: 1.5rem 0 0"
        @submit.prevent="submitCategory"
      >
        <div class="admin-page-guide">
          <h2>Quick category</h2>
          <p>
            Add a missing category without leaving the transaction form. It will
            be selected automatically after saving.
          </p>
        </div>
        <div class="admin-form-grid">
          <label>
            <span class="field-label">
              Code
              <i
                class="pi pi-info-circle"
                title="Short unique code for this category."
                aria-label="Short unique code for this category."
              />
            </span>
            <InputText v-model="categoryForm.code" required />
          </label>
          <label>
            <span class="field-label">
              Name
              <i
                class="pi pi-info-circle"
                title="Readable category name shown to admins."
                aria-label="Readable category name shown to admins."
              />
            </span>
            <InputText v-model="categoryForm.name" required />
          </label>
          <label>
            <span class="field-label">
              Type
              <i
                class="pi pi-info-circle"
                title="Choose whether this category is for expenses or income."
                aria-label="Choose whether this category is for expenses or income."
              />
            </span>
            <Select
              v-model="categoryForm.transactionType"
              :options="[
                { label: 'Expense', value: 'EXPENSE' },
                { label: 'Income', value: 'INCOME' },
              ]"
              option-label="label"
              option-value="value"
            />
          </label>
          <label>
            <span class="field-label">
              Group
              <i
                class="pi pi-info-circle"
                title="Higher-level category group for reporting and filtering."
                aria-label="Higher-level category group for reporting and filtering."
              />
            </span>
            <InputText v-model="categoryForm.categoryGroup" required />
          </label>
          <label>
            <span class="field-label">
              Posting account
              <i
                class="pi pi-info-circle"
                title="Ledger account used when this category is posted."
                aria-label="Ledger account used when this category is posted."
              />
            </span>
            <Select
              v-model="categoryForm.accountHeadId"
              :options="categoryAccountOptions"
              option-label="label"
              option-value="value"
              required
            />
          </label>
          <label class="admin-toggle-card">
            <span class="field-label">
              Attachment required
              <i
                class="pi pi-info-circle"
                title="Require supporting documents for transactions in this category."
                aria-label="Require supporting documents for transactions in this category."
              />
            </span>
            <ToggleSwitch v-model="categoryForm.requiresAttachment" />
          </label>
        </div>
        <div
          class="admin-inline-actions"
          style="justify-content: flex-end; margin-top: 2rem; gap: 0.75rem"
        >
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            outlined
            @click="categoryDialog = false"
          />
          <Button
            type="submit"
            label="Add and select"
            :loading="categorySaving"
          />
        </div>
      </form>
    </Dialog>

    <AppReasonDialog
      v-model:visible="reasonDialog.visible"
      v-model:reason="reasonDialog.reason"
      :header="reasonDialog.header"
      :message="reasonDialog.message"
      :accept-label="reasonDialog.acceptLabel"
      :accept-severity="reasonDialog.acceptSeverity"
      :placeholder="reasonDialog.placeholder"
      @accept="acceptReason"
      @cancel="cancelReason"
    />
  </div>
</template>
