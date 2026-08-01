<script setup lang="ts">
import type { DataTablePageEvent, DataTableSortEvent } from 'primevue/datatable'
import type {
  BankAccount,
  DgAdvanceCredit,
  FlatDetail,
  FlatResidentRelationship,
  FlatSummary,
} from '~/types/domain'
import type { StaffPermission } from '~/shared/permissions'
import { getDgAdvanceAllocationFields } from '~/shared/dg-advance'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'DG Advance',
})

type PaginatedResponse<T> = {
  ok: true
  data: {
    items: T[]
    total: number
    page: number
    pageSize: number
  }
}

type CreditsResponse = PaginatedResponse<DgAdvanceCredit>
type FlatsResponse = PaginatedResponse<FlatSummary>
type FlatDetailResponse = { ok: true; data: FlatDetail }
type BankAccountsResponse = { ok: true; data: { items: BankAccount[] } }
type PaymentCreateResponse = {
  ok: true
  data: { id: string; receiptNumber: string }
}

const api = useApi()
const toast = useToast()
const authStore = useAuthStore()

const hasPermission = (permission: StaffPermission) =>
  authStore.me?.user.permissions.includes(permission) ?? false

const canManageBilling = computed(() => hasPermission('billing.manage'))

const todayDate = () => {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

const formatMoney = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0))

const formatDate = (value: string | null | undefined) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
        dateStyle: 'medium',
      })
    : '-'

const formatMode = (value: string | null) =>
  value
    ? value
        .replaceAll('_', ' ')
        .toLowerCase()
        .replace(/^./, (letter) => letter.toUpperCase())
    : '-'

const query = reactive({
  page: 1,
  pageSize: 50,
  search: '',
  state: 'active',
  sortBy: 'createdAt',
  sortDirection: 'desc',
})

usePersistentReactiveState('admin-billing-dg-advance-filters', query, {
  omit: ['page'],
})

const buildCreditQuery = () => ({
  page: query.page,
  pageSize: query.pageSize,
  search: query.search || undefined,
  state: query.state || undefined,
  sortBy: query.sortBy,
  sortDirection: query.sortDirection,
})

const form = reactive({
  flatId: '',
  payerUserId: '',
  amount: null as number | null,
  paymentDate: todayDate(),
  mode: 'UPI',
  transferKind: '',
  utrReference: '',
  bankReference: '',
  chequeNumber: '',
  chequeDate: todayDate(),
  bankName: '',
  account: '',
  notes: '',
  idempotencyKey: '',
})

const [
  creditsAsyncData,
  flatsAsyncData,
  flatDetailAsyncData,
  bankAccountsAsyncData,
] = await Promise.all([
  useAsyncData(
    'admin-dg-advance-credits',
    () =>
      api<CreditsResponse>('/api/admin/billing/dg-advances', {
        query: buildCreditQuery(),
      }),
    { watch: [query] },
  ),
  useAsyncData('dg-advance-flat-options', () =>
    api<FlatsResponse>('/api/admin/flats', {
      query: {
        page: 1,
        pageSize: 2000,
        sortBy: 'flatNumber',
        sortDirection: 'asc',
        isActive: 'true',
      },
    }),
  ),
  useAsyncData(
    'dg-advance-selected-flat',
    () =>
      form.flatId
        ? api<FlatDetailResponse>(`/api/admin/flats/${form.flatId}`)
        : Promise.resolve(null),
    { watch: [() => form.flatId] },
  ),
  useAsyncData('dg-advance-bank-accounts', () =>
    api<BankAccountsResponse>('/api/admin/finance/bank-accounts', {
      query: { isActive: 'true' },
    }),
  ),
])

const { data, pending, refresh } = creditsAsyncData
const { data: flatsData } = flatsAsyncData
const { data: flatDetailData, pending: payerPending } = flatDetailAsyncData
const { data: bankAccountsData } = bankAccountsAsyncData

const credits = computed(() => data.value?.data.items ?? [])
const totalRecords = computed(() => data.value?.data.total ?? 0)
const tableFirst = computed(() => (query.page - 1) * query.pageSize)
const tableSortOrder = computed(() => (query.sortDirection === 'asc' ? 1 : -1))
const flatOptions = computed(() =>
  (flatsData.value?.data.items ?? []).map((flat) => ({
    label: `${flat.blockName} ${flat.flatNumber} - ${flat.unitType}`,
    value: flat.id,
  })),
)

const payerRelationships = computed(() =>
  (flatDetailData.value?.data.relationships ?? []).filter(
    (relationship) => relationship.isActive,
  ),
)

const getPayerLabel = (relationship: FlatResidentRelationship) => {
  const role = relationship.isBillingContact
    ? 'Billing contact'
    : relationship.isPrimaryContact
      ? 'Primary contact'
      : relationship.relationshipType
  const contact =
    relationship.residentMobileNumber ?? relationship.residentEmail
  return [relationship.residentName, role, contact].filter(Boolean).join(' · ')
}

const payerOptions = computed(() =>
  payerRelationships.value.map((relationship) => ({
    label: getPayerLabel(relationship),
    value: relationship.userId,
  })),
)

const defaultPayerUserId = computed(
  () =>
    payerRelationships.value.find(
      (relationship) => relationship.isBillingContact,
    )?.userId ??
    payerRelationships.value.find(
      (relationship) => relationship.isPrimaryContact,
    )?.userId ??
    payerRelationships.value[0]?.userId ??
    '',
)

const accountOptions = computed(() =>
  (bankAccountsData.value?.data.items ?? []).map((account) => ({
    label: `${account.accountName} · ${account.bankName} · ${account.accountNumberMasked}`,
    value: account.id,
  })),
)

const defaultAccountId = computed(() => {
  const accounts = bankAccountsData.value?.data.items ?? []
  if (accounts.length === 1) return accounts[0]?.id ?? ''
  return accounts.find((account) => account.isDefault)?.id ?? ''
})

watch(
  () => [form.flatId, defaultPayerUserId.value, payerOptions.value.length],
  () => {
    if (!form.flatId) {
      form.payerUserId = ''
      return
    }
    if (
      !payerOptions.value.some((option) => option.value === form.payerUserId)
    ) {
      form.payerUserId = defaultPayerUserId.value
    }
  },
  { immediate: true },
)

watch(
  defaultAccountId,
  (accountId) => {
    if (!form.account) form.account = accountId
  },
  { immediate: true },
)

watch(
  () => form.mode,
  () => {
    if (form.mode !== 'BANK_TRANSFER') form.transferKind = ''
    if (form.mode !== 'CHEQUE') {
      form.chequeNumber = ''
      form.bankName = ''
    }
  },
)

watch(
  () => [query.search, query.state],
  () => {
    if (query.page !== 1) query.page = 1
  },
)

const stateOptions = [
  { label: 'Available balance', value: 'active' },
  { label: 'Fully consumed', value: 'consumed' },
  { label: 'Adjusted / inactive', value: 'inactive' },
  { label: 'All records', value: '' },
]

const paymentModes = [
  { label: 'UPI', value: 'UPI' },
  { label: 'Bank transfer', value: 'BANK_TRANSFER' },
  { label: 'Cash', value: 'CASH' },
  { label: 'Cheque', value: 'CHEQUE' },
]

const transferKinds = [
  { label: 'NEFT', value: 'NEFT' },
  { label: 'IMPS', value: 'IMPS' },
  { label: 'RTGS', value: 'RTGS' },
  { label: 'Bank transfer', value: 'BANK_TRANSFER' },
]

const dialogVisible = ref(false)
const saving = ref(false)

const resetForm = () => {
  form.flatId = ''
  form.payerUserId = ''
  form.amount = null
  form.paymentDate = todayDate()
  form.mode = 'UPI'
  form.transferKind = ''
  form.utrReference = ''
  form.bankReference = ''
  form.chequeNumber = ''
  form.chequeDate = todayDate()
  form.bankName = ''
  form.account = defaultAccountId.value
  form.notes = ''
  form.idempotencyKey = crypto.randomUUID()
}

const openCreateDialog = () => {
  resetForm()
  dialogVisible.value = true
}

const validateForm = () => {
  const reference = form.utrReference.trim() || form.bankReference.trim()
  let message = ''
  if (!form.flatId) message = 'Select the flat that owns this DG advance.'
  else if (!form.payerUserId)
    message = 'Select the resident who made the payment.'
  else if (!form.amount || form.amount <= 0)
    message = 'Enter an advance amount greater than zero.'
  else if (!form.account)
    message = 'Select the account where the payment was deposited.'
  else if (['UPI', 'BANK_TRANSFER'].includes(form.mode) && !reference) {
    message = 'Enter the UTR or bank reference.'
  } else if (form.mode === 'BANK_TRANSFER' && !form.transferKind) {
    message = 'Select NEFT, IMPS, RTGS, or bank transfer.'
  } else if (
    form.mode === 'CHEQUE' &&
    (!form.chequeNumber || !form.chequeDate || !form.bankName)
  ) {
    message = 'Enter the cheque number, date, and bank.'
  }

  if (message) {
    toast.add({
      severity: 'warn',
      summary: 'Complete required fields',
      detail: message,
      life: 8000,
    })
    return false
  }
  return true
}

const saveAdvance = async () => {
  if (!canManageBilling.value || !validateForm()) return
  saving.value = true
  try {
    const response = await api<PaymentCreateResponse>(
      '/api/admin/billing/dg-advances',
      {
        method: 'POST',
        body: {
          flatId: form.flatId,
          payerUserId: form.payerUserId,
          amount: form.amount,
          paymentDate: form.paymentDate,
          mode: form.mode,
          transferKind:
            form.mode === 'BANK_TRANSFER' ? form.transferKind : undefined,
          ...getDgAdvanceAllocationFields(),
          utrReference: form.utrReference || undefined,
          bankReference: form.bankReference || undefined,
          chequeNumber: form.mode === 'CHEQUE' ? form.chequeNumber : undefined,
          chequeDate: form.mode === 'CHEQUE' ? form.chequeDate : undefined,
          bankName: form.mode === 'CHEQUE' ? form.bankName : undefined,
          account: form.account,
          notes: form.notes || undefined,
          idempotencyKey: form.idempotencyKey,
        },
      },
    )

    toast.add({
      severity: 'success',
      summary: 'DG advance recorded',
      detail: `${formatMoney(form.amount)} was reserved for this flat's DG Set bills. Receipt ${response.data.receiptNumber}. If this cycle's DG due already exists, rerun DG due generation for the flat.`,
      life: 10000,
    })
    dialogVisible.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

const resetFilters = () => {
  query.page = 1
  query.search = ''
  query.state = 'active'
}

const handlePage = (event: DataTablePageEvent) => {
  query.page = Math.floor(event.first / event.rows) + 1
  query.pageSize = event.rows
}

const handleSort = (event: DataTableSortEvent) => {
  query.page = 1
  query.sortBy =
    typeof event.sortField === 'string' ? event.sortField : 'createdAt'
  query.sortDirection = event.sortOrder === 1 ? 'asc' : 'desc'
}

const summary = computed(() => ({
  availableAmount: credits.value.reduce(
    (sum, credit) => sum + credit.currentBalance,
    0,
  ),
  originalAmount: credits.value.reduce(
    (sum, credit) => sum + credit.originalAmount,
    0,
  ),
  activeCount: credits.value.filter(
    (credit) => credit.status === 'ACTIVE' && credit.currentBalance > 0,
  ).length,
}))

const statusSeverity = (status: DgAdvanceCredit['status']) => {
  if (status === 'ACTIVE') return 'success'
  if (status === 'CONSUMED') return 'secondary'
  if (status === 'REVERSED') return 'danger'
  return 'warn'
}
</script>

<template>
  <div class="landing-page">
    <section class="billing-command-panel">
      <header class="billing-command-header">
        <div>
          <p class="eyebrow">DG billing</p>
          <h1>DG advance</h1>
          <p>
            Record and track money held for a specific flat's future DG Set
            bills. Available balances are automatically applied when DG dues are
            generated or regenerated.
          </p>
        </div>
        <div class="billing-command-actions">
          <Button
            label="Add DG advance"
            icon="pi pi-plus-circle"
            :disabled="!canManageBilling"
            @click="openCreateDialog"
          />
        </div>
      </header>

      <div class="billing-cycle-guide">
        <div>
          <span>Visible records</span>
          <strong>{{ totalRecords }}</strong>
          <p>{{ summary.activeCount }} available on this page</p>
        </div>
        <div>
          <span>Available DG advance</span>
          <strong>{{ formatMoney(summary.availableAmount) }}</strong>
          <p>Current balances on this page</p>
        </div>
        <div>
          <span>Originally received</span>
          <strong>{{ formatMoney(summary.originalAmount) }}</strong>
          <p>Before DG bill adjustments</p>
        </div>
      </div>

      <div class="admin-page-guide">
        <h2>How this page works</h2>
        <ol>
          <li>Select the flat and resident that paid the advance.</li>
          <li>
            Record the receipt details; the full amount is reserved for DG Set
            bills only.
          </li>
          <li>
            During DG due generation or a generation retry, the available
            balance is deducted automatically for the same flat.
          </li>
        </ol>
        <p>
          This is an amount-based credit register. It does not use or change CAM
          advance coverage dates.
        </p>
      </div>
    </section>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>DG advance register</h1>
          <p>Each row is linked to its source payment and receipt.</p>
        </div>
        <div class="list-page__exports">
          <Button
            label="Refresh"
            icon="pi pi-refresh"
            severity="secondary"
            outlined
            @click="() => refresh()"
          />
          <Button
            label="Clear filters"
            icon="pi pi-filter-slash"
            severity="secondary"
            outlined
            :disabled="!query.search && query.state === 'active'"
            @click="resetFilters"
          />
        </div>
      </header>

      <div class="list-page__toolbar">
        <label class="list-page__search">
          <span class="field-label">Search</span>
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText
              v-model="query.search"
              placeholder="Flat, resident, receipt, or reference"
            />
          </IconField>
        </label>
        <div class="list-page__filters">
          <label>
            <span class="field-label">State</span>
            <Select
              v-model="query.state"
              :options="stateOptions"
              option-label="label"
              option-value="value"
            />
          </label>
        </div>
      </div>

      <AppDataTable
        :value="credits"
        :loading="pending"
        paginator
        :first="tableFirst"
        :rows="query.pageSize"
        :total-records="totalRecords"
        :lazy="true"
        responsive-layout="scroll"
        class="list-page__table"
        data-key="id"
        :sort-field="query.sortBy"
        :sort-order="tableSortOrder"
        @page="handlePage"
        @sort="handleSort"
      >
        <Column field="flatNumber" header="Flat" sortable>
          <template #body="{ data: row }">
            <strong>{{ row.blockName }} {{ row.flatNumber }}</strong>
            <p class="table-muted">{{ row.unitType }}</p>
          </template>
        </Column>
        <Column field="payerName" header="Paid by">
          <template #body="{ data: row }">{{ row.payerName || '-' }}</template>
        </Column>
        <Column field="paymentDate" header="Received" sortable>
          <template #body="{ data: row }">
            {{ formatDate(row.paymentDate) }}
            <p class="table-muted">{{ formatMode(row.paymentMode) }}</p>
          </template>
        </Column>
        <Column field="originalAmount" header="Original amount" sortable>
          <template #body="{ data: row }">{{
            formatMoney(row.originalAmount)
          }}</template>
        </Column>
        <Column field="currentBalance" header="Available balance" sortable>
          <template #body="{ data: row }"
            ><strong>{{ formatMoney(row.currentBalance) }}</strong></template
          >
        </Column>
        <Column field="reference" header="Receipt / reference">
          <template #body="{ data: row }">
            <strong>{{ row.receiptNumber || '-' }}</strong>
            <p class="table-muted">{{ row.reference || '-' }}</p>
          </template>
        </Column>
        <Column field="status" header="State" sortable>
          <template #body="{ data: row }">
            <Tag
              :value="row.status"
              :severity="statusSeverity(row.status)"
              rounded
            />
          </template>
        </Column>
      </AppDataTable>
    </section>

    <Dialog
      v-model:visible="dialogVisible"
      header="Add DG advance"
      modal
      :style="{ width: '720px' }"
    >
      <form class="admin-form-layout" @submit.prevent="saveAdvance">
        <div class="billing-dialog-intro">
          <div>
            <p class="eyebrow">Flat-level DG credit</p>
            <h2>Record money received in advance</h2>
            <p>
              This creates a verified receipt and reserves the entire amount for
              future DG Set bills for the selected flat.
            </p>
          </div>
        </div>

        <div class="admin-form-grid">
          <label class="admin-form-grid__full">
            <span class="field-label"
              >Flat <span class="required-marker">*</span></span
            >
            <Select
              v-model="form.flatId"
              :options="flatOptions"
              option-label="label"
              option-value="value"
              filter
              required
            />
          </label>
          <label class="admin-form-grid__full">
            <span class="field-label"
              >Paid by <span class="required-marker">*</span></span
            >
            <Select
              v-model="form.payerUserId"
              :options="payerOptions"
              option-label="label"
              option-value="value"
              :loading="payerPending"
              :disabled="!form.flatId || payerPending"
              :placeholder="
                form.flatId ? 'Select resident' : 'Select flat first'
              "
              required
            />
          </label>
          <label>
            <span class="field-label"
              >Advance amount <span class="required-marker">*</span></span
            >
            <InputNumber
              v-model="form.amount"
              :min="0.01"
              :max-fraction-digits="2"
              mode="currency"
              currency="INR"
              locale="en-IN"
              fluid
              required
            />
          </label>
          <label>
            <span class="field-label"
              >Payment date <span class="required-marker">*</span></span
            >
            <InputText v-model="form.paymentDate" type="date" required />
          </label>
          <label>
            <span class="field-label"
              >Payment mode <span class="required-marker">*</span></span
            >
            <Select
              v-model="form.mode"
              :options="paymentModes"
              option-label="label"
              option-value="value"
            />
          </label>
          <label v-if="form.mode === 'BANK_TRANSFER'">
            <span class="field-label"
              >Transfer type <span class="required-marker">*</span></span
            >
            <Select
              v-model="form.transferKind"
              :options="transferKinds"
              option-label="label"
              option-value="value"
            />
          </label>
          <label class="admin-form-grid__full">
            <span class="field-label"
              >Deposit account <span class="required-marker">*</span></span
            >
            <Select
              v-model="form.account"
              :options="accountOptions"
              option-label="label"
              option-value="value"
              filter
              required
            />
          </label>
          <label
            v-if="['UPI', 'BANK_TRANSFER'].includes(form.mode)"
            class="admin-form-grid__full"
          >
            <span class="field-label"
              >UTR / transaction reference
              <span class="required-marker">*</span></span
            >
            <InputText
              v-model="form.utrReference"
              placeholder="Enter unique payment reference"
            />
          </label>
          <template v-if="form.mode === 'CHEQUE'">
            <label>
              <span class="field-label"
                >Cheque number <span class="required-marker">*</span></span
              >
              <InputText v-model="form.chequeNumber" />
            </label>
            <label>
              <span class="field-label"
                >Cheque date <span class="required-marker">*</span></span
              >
              <InputText v-model="form.chequeDate" type="date" />
            </label>
            <label class="admin-form-grid__full">
              <span class="field-label"
                >Cheque bank <span class="required-marker">*</span></span
              >
              <InputText v-model="form.bankName" />
            </label>
          </template>
          <label class="admin-form-grid__full">
            <span class="field-label">Notes</span>
            <Textarea
              v-model="form.notes"
              rows="3"
              auto-resize
              placeholder="Reason or supporting details"
            />
          </label>
        </div>

        <Message severity="info" :closable="false">
          Scope is fixed to DG Set bills only. This entry does not create or
          modify CAM advance coverage.
        </Message>

        <div class="admin-inline-actions dialog-actions">
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            outlined
            @click="dialogVisible = false"
          />
          <Button
            type="submit"
            label="Record DG advance"
            icon="pi pi-check"
            :loading="saving"
            :disabled="saving"
          />
        </div>
      </form>
    </Dialog>
  </div>
</template>
