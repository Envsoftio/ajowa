<script setup lang="ts">
import type { DataTablePageEvent } from 'primevue/datatable'
import type { BillingPeriod, FlatSummary, ResidentSummary } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Payments',
})

type Paginated<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

type PaymentSummary = {
  id: string
  paymentDate: string
  amount: string
  mode: string
  transferKind: string | null
  status: string
  payerUserId: string
  flatId: string
  utrReference: string | null
  bankReference: string | null
  proofFilePath: string | null
  receiptNumber: string | null
  receiptFilePath: string | null
  createdAt: string
  flatNumber: string | null
  blockName: string | null
  payerName: string | null
}

type PaymentAllocation = {
  id: string
  billingPeriodLabel: string
  dueAmount: string
  lateFeeComponent: string
  allocatedAmount: string
  remainingBalance: string
  allocationOrder: number
}

type PaymentDetail = {
  id: string
  payment_date: string
  amount: string
  mode: string
  transfer_kind: string | null
  status: string
  utr_reference: string | null
  bank_reference: string | null
  receipt_number: string | null
  proof_file_path: string | null
  flat_number: string | null
  block_name: string | null
  payer_name: string | null
  allocations: PaymentAllocation[]
}

type PaymentsResponse = { ok: true; data: Paginated<PaymentSummary> }
type DetailResponse = { ok: true; data: PaymentDetail }
type AmountUpdateResponse = {
  ok: true
  data: {
    previousAmount: number
    amount: number
    allocatedAmount: number | null
    advanceAmount: number | null
    receiptInvalidated: boolean
    changed: boolean
  }
}
type FlatsResponse = { ok: true; data: Paginated<FlatSummary> }
type ResidentsResponse = { ok: true; data: Paginated<ResidentSummary> }
type PeriodsResponse = { ok: true; data: Paginated<BillingPeriod> }

const api = useApi()
const toast = useToast()
const authStore = useAuthStore()

const query = reactive({
  page: 1,
  pageSize: 25,
  search: '',
  fromDate: '',
  toDate: '',
  flatId: '',
  payerUserId: '',
  billingPeriodId: '',
  mode: '',
  status: '',
  receipt: '',
  proof: '',
  minAmount: '',
  maxAmount: '',
})

const paymentModes = [
  { label: 'All modes', value: '' },
  { label: 'Cash', value: 'CASH' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Bank transfer', value: 'BANK_TRANSFER' },
  { label: 'Cheque', value: 'CHEQUE' },
  { label: 'Online gateway', value: 'ONLINE_GATEWAY' },
  { label: 'Advance credit', value: 'ADVANCE_CREDIT' },
]

const statusOptions = [
  { label: 'All statuses', value: '' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Verified', value: 'VERIFIED' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Cancelled', value: 'CANCELLED' },
]

const stateOptions = [
  { label: 'Any', value: '' },
  { label: 'Available', value: 'with' },
  { label: 'Missing', value: 'missing' },
]

const formatMoney = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0))

const formatDate = (value: string | null | undefined) =>
  value
    ? new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString('en-IN', {
        dateStyle: 'medium',
      })
    : '-'

const flatLabel = (payment: Pick<PaymentSummary, 'blockName' | 'flatNumber'>) =>
  [payment.blockName, payment.flatNumber].filter(Boolean).join(' ') || '-'

const referenceLabel = (payment: Pick<PaymentSummary, 'utrReference' | 'bankReference'>) =>
  payment.utrReference || payment.bankReference || '-'

const loadPayments = () =>
  api<PaymentsResponse>('/api/payments', {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search || undefined,
      fromDate: query.fromDate || undefined,
      toDate: query.toDate || undefined,
      flatId: query.flatId || undefined,
      payerUserId: query.payerUserId || undefined,
      billingPeriodId: query.billingPeriodId || undefined,
      mode: query.mode || undefined,
      status: query.status || undefined,
      receipt: query.receipt || undefined,
      proof: query.proof || undefined,
      minAmount: query.minAmount || undefined,
      maxAmount: query.maxAmount || undefined,
    },
  })

const [
  paymentsAsyncData,
  flatsAsyncData,
  residentsAsyncData,
  periodsAsyncData,
] = await Promise.all([
  useAsyncData('admin-payments', loadPayments, {
    watch: [query],
  }),
  useAsyncData('payment-flat-options', () =>
    api<FlatsResponse>('/api/admin/flats', {
      query: { page: 1, pageSize: 2000, sortBy: 'flatNumber', sortDirection: 'asc' },
    }),
  ),
  useAsyncData('payment-resident-options', () =>
    api<ResidentsResponse>('/api/admin/residents', {
      query: { page: 1, pageSize: 2000, sortBy: 'fullName', sortDirection: 'asc' },
    }),
  ),
  useAsyncData('payment-period-options', () =>
    api<PeriodsResponse>('/api/admin/billing/periods', {
      query: { page: 1, pageSize: 2000, sortBy: 'startDate', sortDirection: 'desc' },
    }),
  ),
])

const { data, pending, refresh } = paymentsAsyncData
const { data: flatsData } = flatsAsyncData
const { data: residentsData } = residentsAsyncData
const { data: periodsData } = periodsAsyncData

const payments = computed(() => data.value?.data.items ?? [])
const totalRecords = computed(() => data.value?.data.total ?? 0)

const flatOptions = computed(() => [
  { label: 'All flats', value: '' },
  ...(flatsData.value?.data.items ?? []).map((flat) => ({
    label: `${flat.blockName} ${flat.flatNumber}`,
    value: flat.id,
  })),
])

const residentOptions = computed(() => [
  { label: 'All residents', value: '' },
  ...(residentsData.value?.data.items ?? []).map((resident) => ({
    label: resident.fullName,
    value: resident.id,
  })),
])

const periodOptions = computed(() => [
  { label: 'All periods', value: '' },
  ...(periodsData.value?.data.items ?? []).map((period) => ({
    label: period.label,
    value: period.id,
  })),
])

const kpis = computed(() => ({
  totalAmount: payments.value.reduce((sum, payment) => sum + Number(payment.amount), 0),
  verified: payments.value.filter((payment) => payment.status === 'VERIFIED').length,
  missingReceipts: payments.value.filter((payment) => !payment.receiptNumber).length,
  missingProof: payments.value.filter((payment) => !payment.proofFilePath).length,
}))

const hasActiveFilters = computed(() =>
  Object.entries(query).some(([key, value]) => !['page', 'pageSize'].includes(key) && Boolean(value)),
)
const canEditPaymentAmount = computed(() => authStore.me?.user.role === 'ADMIN')

watch(
  () => [
    query.search,
    query.fromDate,
    query.toDate,
    query.flatId,
    query.payerUserId,
    query.billingPeriodId,
    query.mode,
    query.status,
    query.receipt,
    query.proof,
    query.minAmount,
    query.maxAmount,
  ],
  () => {
    query.page = 1
  },
)

const selectedPayment = ref<PaymentDetail | null>(null)
const detailVisible = ref(false)
const detailPending = ref(false)
const proofInput = ref<HTMLInputElement | null>(null)
const proofTargetPaymentId = ref<string | null>(null)
const proofUploadingId = ref<string | null>(null)
const amountEditVisible = ref(false)
const amountEditPayment = ref<PaymentSummary | null>(null)
const amountEditValue = ref<number | null>(null)
const amountEditSaving = ref(false)
const proofAccept = 'application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,image/webp'
const proofAllowedMimeTypes = proofAccept.split(',')
const proofMaxSizeBytes = 10 * 1024 * 1024

const openDetail = async (payment: Pick<PaymentSummary, 'id'>) => {
  detailPending.value = true
  detailVisible.value = true

  try {
    const response = await api<DetailResponse>(`/api/payments/${payment.id}`)
    selectedPayment.value = response.data
  } finally {
    detailPending.value = false
  }
}

const resetFilters = () => {
  query.search = ''
  query.fromDate = ''
  query.toDate = ''
  query.flatId = ''
  query.payerUserId = ''
  query.billingPeriodId = ''
  query.mode = ''
  query.status = ''
  query.receipt = ''
  query.proof = ''
  query.minAmount = ''
  query.maxAmount = ''
}

const copyReceipt = async (payment: PaymentSummary) => {
  if (!payment.receiptNumber) return
  await navigator.clipboard.writeText(payment.receiptNumber)
  toast.add({ severity: 'success', summary: 'Receipt copied', life: 10000 })
}

const openAmountEdit = (payment: PaymentSummary) => {
  amountEditPayment.value = payment
  amountEditValue.value = Number(payment.amount)
  amountEditVisible.value = true
}

const amountEditChanged = computed(() => {
  const payment = amountEditPayment.value
  if (!payment || amountEditValue.value == null) return false

  return Math.round(amountEditValue.value * 100) !== Math.round(Number(payment.amount) * 100)
})

const saveAmountEdit = async () => {
  const payment = amountEditPayment.value
  const amount = amountEditValue.value

  if (!payment || amount == null || amount <= 0 || !amountEditChanged.value) {
    return
  }

  amountEditSaving.value = true
  try {
    const response = await api<AmountUpdateResponse>(`/api/payments/${payment.id}`, {
      method: 'PATCH',
      body: { amount },
    })
    toast.add({
      severity: 'success',
      summary: 'Amount updated',
      detail: response.data.advanceAmount && response.data.advanceAmount > 0
        ? `${formatMoney(response.data.advanceAmount)} kept as advance.`
        : undefined,
      life: 10000,
    })
    amountEditVisible.value = false
    await refresh()
    if (detailVisible.value && selectedPayment.value?.id === payment.id) {
      await openDetail({ id: payment.id })
    }
  } finally {
    amountEditSaving.value = false
  }
}

const pickProofFile = (payment: PaymentSummary) => {
  proofTargetPaymentId.value = payment.id
  proofInput.value?.click()
}

const onProofFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  const paymentId = proofTargetPaymentId.value
  proofTargetPaymentId.value = null

  if (!file || !paymentId) {
    return
  }

  if (!proofAllowedMimeTypes.includes(file.type)) {
    toast.add({
      severity: 'warn',
      summary: 'Unsupported file',
      detail: 'Upload a PDF, Excel, JPG, PNG, or WebP proof file.',
      life: 10000,
    })
    return
  }

  if (file.size <= 0 || file.size > proofMaxSizeBytes) {
    toast.add({
      severity: 'warn',
      summary: 'File too large',
      detail: 'Payment proof files must be 10 MB or smaller.',
      life: 10000,
    })
    return
  }

  proofUploadingId.value = paymentId
  try {
    const formData = new FormData()
    formData.append('file', file)
    await api(`/api/payments/${paymentId}/proof`, {
      method: 'POST',
      body: formData,
    })
    toast.add({ severity: 'success', summary: 'Proof uploaded', life: 10000 })
    await refresh()
    if (selectedPayment.value?.id === paymentId) {
      await openDetail({ id: paymentId })
    }
  } finally {
    proofUploadingId.value = null
  }
}
</script>

<template>
  <div class="landing-page">
    <input
      ref="proofInput"
      type="file"
      :accept="proofAccept"
      class="finance-upload-card__input"
      @change="onProofFileChange"
    >

    <div class="surface-grid">
      <section class="surface-card">
        <p class="eyebrow">Visible collected</p>
        <h3>{{ formatMoney(kpis.totalAmount) }}</h3>
        <p>{{ totalRecords }} payment records match the current filters.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Verified</p>
        <h3>{{ kpis.verified }}</h3>
        <p>Payments on this page ready for allocation or already allocated.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Exceptions</p>
        <h3>{{ kpis.missingReceipts + kpis.missingProof }}</h3>
        <p>{{ kpis.missingReceipts }} missing receipts, {{ kpis.missingProof }} missing proof files.</p>
      </section>
    </div>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Payments</h1>
          <p>Review maintenance collections, references, receipts, proof files, and period allocations.</p>
        </div>
        <div class="list-page__exports">
          <Button as="router-link" to="/admin/payments/new" label="Record payment" icon="pi pi-plus" />
          <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined :loading="pending" @click="() => refresh()" />
          <Button label="Clear filters" icon="pi pi-filter-slash" severity="secondary" outlined :disabled="!hasActiveFilters" @click="resetFilters" />
        </div>
      </header>

      <div class="list-page__toolbar">
        <label class="list-page__search">
          <span class="field-label">Search</span>
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="query.search" placeholder="Receipt, UTR, payer, flat" />
          </IconField>
        </label>
        <div class="list-page__filters">
          <label>
            <span class="field-label">From</span>
            <InputText v-model="query.fromDate" type="date" />
          </label>
          <label>
            <span class="field-label">To</span>
            <InputText v-model="query.toDate" type="date" />
          </label>
          <label>
            <span class="field-label">Flat</span>
            <Select v-model="query.flatId" :options="flatOptions" option-label="label" option-value="value" />
          </label>
          <label>
            <span class="field-label">Resident</span>
            <Select v-model="query.payerUserId" :options="residentOptions" option-label="label" option-value="value" filter />
          </label>
          <label>
            <span class="field-label">Period</span>
            <Select v-model="query.billingPeriodId" :options="periodOptions" option-label="label" option-value="value" />
          </label>
          <label>
            <span class="field-label">Mode</span>
            <Select v-model="query.mode" :options="paymentModes" option-label="label" option-value="value" />
          </label>
          <label>
            <span class="field-label">Status</span>
            <Select v-model="query.status" :options="statusOptions" option-label="label" option-value="value" />
          </label>
          <label>
            <span class="field-label">Receipt</span>
            <Select v-model="query.receipt" :options="stateOptions" option-label="label" option-value="value" />
          </label>
          <label>
            <span class="field-label">Proof</span>
            <Select v-model="query.proof" :options="stateOptions" option-label="label" option-value="value" />
          </label>
          <label>
            <span class="field-label">Min amount</span>
            <InputText v-model="query.minAmount" inputmode="decimal" />
          </label>
          <label>
            <span class="field-label">Max amount</span>
            <InputText v-model="query.maxAmount" inputmode="decimal" />
          </label>
        </div>
      </div>

      <AppDataTable
        :value="payments"
        :loading="pending"
        paginator
        :rows="query.pageSize"
        :total-records="totalRecords"
        :lazy="true"
        responsive-layout="scroll"
        class="list-page__table"
        data-key="id"
        @page="
          (event: DataTablePageEvent) => {
            query.page = Math.floor(event.first / event.rows) + 1
            query.pageSize = event.rows
          }
        "
      >
        <Column field="paymentDate" header="Date">
          <template #body="{ data: row }">
            {{ formatDate(row.paymentDate) }}
          </template>
        </Column>
        <Column field="flatNumber" header="Flat">
          <template #body="{ data: row }">
            <strong>{{ flatLabel(row) }}</strong>
            <p class="table-muted">{{ row.payerName || '-' }}</p>
          </template>
        </Column>
        <Column field="amount" header="Amount">
          <template #body="{ data: row }">
            <strong>{{ formatMoney(row.amount) }}</strong>
          </template>
        </Column>
        <Column field="mode" header="Mode">
          <template #body="{ data: row }">
            <span>{{ row.transferKind || row.mode }}</span>
            <p class="table-muted">{{ referenceLabel(row) }}</p>
          </template>
        </Column>
        <Column field="status" header="Status">
          <template #body="{ data: row }">
            <AppStatusBadge :status="row.status" />
          </template>
        </Column>
        <Column field="receiptNumber" header="Receipt">
          <template #body="{ data: row }">
            <button v-if="row.receiptNumber" class="text-button" type="button" @click="copyReceipt(row)">
              {{ row.receiptNumber }}
            </button>
            <span v-else>-</span>
          </template>
        </Column>
        <Column header="Files">
          <template #body="{ data: row }">
            <div class="admin-inline-actions">
              <Tag :severity="row.proofFilePath ? 'success' : 'warn'" :value="row.proofFilePath ? 'Proof' : 'No proof'" rounded />
              <Tag :severity="row.receiptNumber ? 'success' : 'warn'" :value="row.receiptNumber ? 'Receipt' : 'No receipt'" rounded />
              <Button
                v-if="row.proofFilePath"
                as="a"
                :href="`/api/payments/${row.id}/proof`"
                target="_blank"
                icon="pi pi-paperclip"
                severity="secondary"
                text
                rounded
                aria-label="Open proof"
                title="Open proof"
              />
              <Button
                type="button"
                icon="pi pi-upload"
                severity="secondary"
                text
                rounded
                :loading="proofUploadingId === row.id"
                :aria-label="row.proofFilePath ? 'Replace proof' : 'Upload proof'"
                :title="row.proofFilePath ? 'Replace proof' : 'Upload proof'"
                @click="pickProofFile(row)"
              />
            </div>
          </template>
        </Column>
        <Column header="Actions" style="width: 150px">
          <template #body="{ data: row }">
            <div class="admin-inline-actions">
              <Button icon="pi pi-eye" severity="secondary" text rounded aria-label="View payment" title="View payment" @click="openDetail(row)" />
              <Button
                v-if="canEditPaymentAmount"
                icon="pi pi-pencil"
                severity="secondary"
                text
                rounded
                aria-label="Edit amount"
                title="Edit amount"
                @click="openAmountEdit(row)"
              />
              <AppDocumentLink
                :href="`/api/payments/${row.id}/receipt`"
                viewer-title="Receipt PDF"
                icon="pi pi-download"
                severity="secondary"
                text
                rounded
                aria-label="Download receipt"
                title="Download receipt"
                :disabled="!row.receiptNumber"
              />
            </div>
          </template>
        </Column>
      </AppDataTable>

      <div class="list-page__cards">
        <article v-for="payment in payments" :key="payment.id" class="list-card">
          <div class="list-card__header">
            <div>
              <h3>{{ formatMoney(payment.amount) }}</h3>
              <p>{{ flatLabel(payment) }} · {{ formatDate(payment.paymentDate) }}</p>
            </div>
            <AppStatusBadge :status="payment.status" />
          </div>
          <div class="list-card__row">
            <span>Payer</span>
            <strong>{{ payment.payerName || '-' }}</strong>
          </div>
          <div class="list-card__row">
            <span>Reference</span>
            <strong>{{ referenceLabel(payment) }}</strong>
          </div>
          <div class="list-card__row">
            <span>Receipt</span>
            <strong>{{ payment.receiptNumber || '-' }}</strong>
          </div>
          <div class="admin-inline-actions">
            <Button label="View" icon="pi pi-eye" size="small" severity="secondary" outlined @click="openDetail(payment)" />
            <Button
              v-if="canEditPaymentAmount"
              label="Edit amount"
              icon="pi pi-pencil"
              size="small"
              severity="secondary"
              outlined
              @click="openAmountEdit(payment)"
            />
            <Button
              v-if="payment.proofFilePath"
              as="a"
              :href="`/api/payments/${payment.id}/proof`"
              target="_blank"
              label="Proof"
              icon="pi pi-paperclip"
              size="small"
              severity="secondary"
              outlined
            />
            <Button
              type="button"
              :label="payment.proofFilePath ? 'Replace proof' : 'Upload proof'"
              icon="pi pi-upload"
              size="small"
              severity="secondary"
              outlined
              :loading="proofUploadingId === payment.id"
              @click="pickProofFile(payment)"
            />
            <AppDocumentLink
              :href="`/api/payments/${payment.id}/receipt`"
              viewer-title="Receipt PDF"
              label="Receipt"
              icon="pi pi-download"
              size="small"
              severity="secondary"
              outlined
              :disabled="!payment.receiptNumber"
            />
          </div>
        </article>
      </div>
    </section>

    <Dialog v-model:visible="detailVisible" header="Payment detail" modal :style="{ width: '720px' }">
      <AppSkeletonState v-if="detailPending" />
      <div v-else-if="selectedPayment" class="admin-form-layout">
        <div class="surface-grid">
          <section class="surface-card">
            <p class="eyebrow">Amount</p>
            <h3>{{ formatMoney(selectedPayment.amount) }}</h3>
            <p>{{ selectedPayment.transfer_kind || selectedPayment.mode }} · {{ referenceLabel({ utrReference: selectedPayment.utr_reference, bankReference: selectedPayment.bank_reference }) }}</p>
          </section>
          <section class="surface-card">
            <p class="eyebrow">Receipt</p>
            <h3>{{ selectedPayment.receipt_number || '-' }}</h3>
            <p>{{ formatDate(selectedPayment.payment_date) }}</p>
            <Button
              v-if="selectedPayment.proof_file_path"
              as="a"
              :href="`/api/payments/${selectedPayment.id}/proof`"
              target="_blank"
              icon="pi pi-paperclip"
              label="Open proof"
              severity="secondary"
              outlined
            />
          </section>
        </div>
        <AppDataTable :value="selectedPayment.allocations" responsive-layout="scroll">
          <Column field="billingPeriodLabel" header="Period" />
          <Column field="dueAmount" header="Due">
            <template #body="{ data: row }">{{ formatMoney(row.dueAmount) }}</template>
          </Column>
          <Column field="lateFeeComponent" header="Late fee">
            <template #body="{ data: row }">{{ formatMoney(row.lateFeeComponent) }}</template>
          </Column>
          <Column field="allocatedAmount" header="Allocated">
            <template #body="{ data: row }">{{ formatMoney(row.allocatedAmount) }}</template>
          </Column>
          <Column field="remainingBalance" header="Balance">
            <template #body="{ data: row }">{{ formatMoney(row.remainingBalance) }}</template>
          </Column>
        </AppDataTable>
      </div>
    </Dialog>

    <Dialog v-model:visible="amountEditVisible" header="Edit amount" modal :style="{ width: '420px' }">
      <form v-if="amountEditPayment" class="admin-form-layout" @submit.prevent="saveAmountEdit">
        <div class="surface-card">
          <p class="eyebrow">{{ flatLabel(amountEditPayment) }}</p>
          <h3>{{ formatMoney(amountEditPayment.amount) }}</h3>
          <p>{{ amountEditPayment.payerName || '-' }}</p>
        </div>
        <label>
          <span class="field-label">Amount</span>
          <InputNumber
            v-model="amountEditValue"
            mode="currency"
            currency="INR"
            locale="en-IN"
            :min="1"
            :max-fraction-digits="2"
            fluid
            autofocus
          />
        </label>
        <div class="admin-form-actions">
          <Button type="button" label="Cancel" severity="secondary" outlined @click="amountEditVisible = false" />
          <Button type="submit" label="Save" icon="pi pi-check" :loading="amountEditSaving" :disabled="!amountEditChanged" />
        </div>
      </form>
    </Dialog>
  </div>
</template>
