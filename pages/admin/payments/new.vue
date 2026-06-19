<script setup lang="ts">
import type { BankAccount, FlatSummary, MaintenanceDue, ResidentSummary } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Record Payment',
})

type Paginated<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

type AllocationPreviewLine = {
  dueId: string
  billingPeriodId: string
  billingPeriodLabel: string
  dueAmount: number
  lateFeeComponent: number
  allocatedAmount: number
  remainingBalance: number
  allocationOrder: number
}

type AllocationPreview = {
  lines: AllocationPreviewLine[]
  totalDue: number
  allocatedAmount: number
  advanceAmount: number
  policy: string
}

type PaymentCreateResponse = { ok: true; data: { id: string; receiptNumber: string } }
type PreviewResponse = { ok: true; data: AllocationPreview }
type DuplicateResponse = {
  ok: true
  data: {
    duplicate: boolean
    matches: Array<{
      id: string
      payment_date: string
      amount: string
      mode: string
      status: string
      utr_reference: string | null
      bank_reference: string | null
      receipt_number: string | null
      flat_number: string | null
    }>
  }
}
type FlatsResponse = { ok: true; data: Paginated<FlatSummary> }
type ResidentsResponse = { ok: true; data: Paginated<ResidentSummary> }
type DuesResponse = { ok: true; data: Paginated<MaintenanceDue> }
type BankAccountsResponse = { ok: true; data: { items: BankAccount[] } }
type LocalPaymentProof = {
  file: File
  fileName: string
  mimeType: string
  sizeBytes: number
}

const api = useApi()
const toast = useToast()

const todayDate = () => {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

const formatContact = (value: string | null | undefined) => value || 'No contact'

const form = reactive({
  flatId: '',
  payerUserId: '',
  amount: '',
  paymentDate: todayDate(),
  mode: 'UPI',
  transferKind: '',
  allocationMode: 'OLDEST_UNPAID_FIRST',
  selectedDueIds: [] as string[],
  tenureMonths: '3',
  utrReference: '',
  bankReference: '',
  chequeNumber: '',
  chequeDate: '',
  bankName: '',
  account: '',
  notes: '',
  allowDuplicateUtr: false,
  overrideReason: '',
})

const paymentModes = [
  { label: 'Cash', value: 'CASH' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Bank transfer', value: 'BANK_TRANSFER' },
  { label: 'Cheque', value: 'CHEQUE' },
]

const transferKinds = [
  { label: 'NEFT', value: 'NEFT' },
  { label: 'IMPS', value: 'IMPS' },
  { label: 'RTGS', value: 'RTGS' },
  { label: 'Bank transfer', value: 'BANK_TRANSFER' },
]

const allocationModes = [
  { label: 'Oldest unpaid first', value: 'OLDEST_UNPAID_FIRST' },
  { label: 'Selected periods', value: 'SELECTED_PERIODS' },
  { label: 'Tenure pack', value: 'TENURE_PACK' },
]

const formatMoney = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0))

const formatDate = (value: string | null | undefined) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '-'

const formatBytes = (value: number | null | undefined) => {
  const bytes = Number(value ?? 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const emptyDuesResponse = (): DuesResponse => ({
  ok: true,
  data: { items: [], total: 0, page: 1, pageSize: 100 },
})

const { data: flatsData } = await useAsyncData('manual-payment-flats', () =>
  api<FlatsResponse>('/api/admin/flats', {
    query: { page: 1, pageSize: 2000, sortBy: 'flatNumber', sortDirection: 'asc', isActive: 'true' },
  }),
)
const { data: residentsData } = await useAsyncData('manual-payment-residents', () =>
  api<ResidentsResponse>('/api/admin/residents', {
    query: { page: 1, pageSize: 2000, sortBy: 'fullName', sortDirection: 'asc', isActive: 'true' },
  }),
)
const { data: bankAccountsData } = await useAsyncData('manual-payment-bank-accounts', () =>
  api<BankAccountsResponse>('/api/admin/finance/bank-accounts', { query: { isActive: 'true' } }),
)
const {
  data: duesData,
  pending: duesPending,
  refresh: refreshDues,
} = await useAsyncData(
  'manual-payment-dues',
  () =>
    form.flatId
      ? api<DuesResponse>('/api/admin/billing/dues', {
          query: {
            page: 1,
            pageSize: 100,
            flatId: form.flatId,
            balance: 'outstanding',
            sortBy: 'dueDate',
            sortDirection: 'asc',
          },
        })
      : Promise.resolve(emptyDuesResponse()),
  { watch: [() => form.flatId] },
)

const flatOptions = computed(() =>
  (flatsData.value?.data.items ?? []).map((flat) => ({
    label: `${flat.blockName} ${flat.flatNumber}`,
    value: flat.id,
  })),
)

const residentOptions = computed(() =>
  [
    { label: 'Use billing contact', value: '' },
    ...(residentsData.value?.data.items ?? []).map((resident) => ({
      label: `${resident.fullName} · ${formatContact(resident.mobileNumber)}`,
      value: resident.id,
    })),
  ],
)

const accountOptions = computed(() =>
  (bankAccountsData.value?.data.items ?? []).map((account) => ({
    label: `${account.accountName} · ${account.bankName} · ${account.accountNumberMasked}`,
    value: account.id,
  })),
)

const openDues = computed(() => duesData.value?.data.items ?? [])
const dueOptions = computed(() =>
  openDues.value.map((due) => ({
    label: `${due.billingPeriodLabel} · ${formatMoney(due.balanceAmount)} balance`,
    value: due.id,
  })),
)

const selectedFlat = computed(() => flatOptions.value.find((flat) => flat.value === form.flatId)?.label ?? '-')
const amountNumber = computed(() => Number(form.amount || 0))
const needsReference = computed(() => ['UPI', 'BANK_TRANSFER'].includes(form.mode))
const needsCheque = computed(() => form.mode === 'CHEQUE')
const referenceValue = computed(() => form.utrReference.trim() || form.bankReference.trim())

const preview = ref<AllocationPreview | null>(null)
const previewPending = ref(false)
const duplicate = ref<DuplicateResponse['data'] | null>(null)
const duplicatePending = ref(false)
const saving = ref(false)
const success = ref<{ id: string; receiptNumber: string } | null>(null)
const proofInput = ref<HTMLInputElement | null>(null)
const proofFile = ref<LocalPaymentProof | null>(null)
const proofAccept = 'application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,image/webp'
const proofAllowedMimeTypes = proofAccept.split(',')
const proofMaxSizeBytes = 10 * 1024 * 1024

watch(
  () => [form.flatId, form.amount, form.allocationMode, form.selectedDueIds.join(','), form.tenureMonths],
  () => {
    preview.value = null
  },
)

watch(
  () => form.flatId,
  () => {
    form.selectedDueIds = []
    preview.value = null
  },
)

watch(
  () => form.mode,
  () => {
    if (form.mode !== 'BANK_TRANSFER') form.transferKind = ''
    if (form.mode !== 'CHEQUE') {
      form.chequeNumber = ''
      form.chequeDate = ''
      form.bankName = ''
    }
  },
)

const previewAllocation = async () => {
  if (!form.flatId || amountNumber.value <= 0) return
  previewPending.value = true

  try {
    const response = await api<PreviewResponse>('/api/payments/preview', {
      method: 'POST',
      body: {
        flatId: form.flatId,
        amount: amountNumber.value,
        allocationMode: form.allocationMode,
        selectedDueIds: form.allocationMode === 'SELECTED_PERIODS' ? form.selectedDueIds : [],
        tenureMonths: form.allocationMode === 'TENURE_PACK' ? Number(form.tenureMonths) : undefined,
      },
    })
    preview.value = response.data
  } finally {
    previewPending.value = false
  }
}

const checkDuplicateReference = async () => {
  if (!referenceValue.value) return
  duplicatePending.value = true

  try {
    const response = await api<DuplicateResponse>('/api/payments/reconciliation', {
      query: { reference: referenceValue.value },
    })
    duplicate.value = response.data
    form.allowDuplicateUtr = response.data.duplicate ? form.allowDuplicateUtr : false
  } finally {
    duplicatePending.value = false
  }
}

const pickProofFile = () => {
  proofInput.value?.click()
}

const clearProofFile = () => {
  proofFile.value = null
}

const onProofFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''

  if (!file) {
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

  proofFile.value = {
    file,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  }
}

const uploadProofFile = async (paymentId: string) => {
  if (!proofFile.value) {
    return
  }

  const formData = new FormData()
  formData.append('file', proofFile.value.file)
  await api(`/api/payments/${paymentId}/proof`, {
    method: 'POST',
    body: formData,
  })
}

const submitPayment = async () => {
  saving.value = true

  try {
    const response = await api<PaymentCreateResponse>('/api/payments', {
      method: 'POST',
      body: {
        flatId: form.flatId,
        payerUserId: form.payerUserId || undefined,
        amount: amountNumber.value,
        paymentDate: form.paymentDate,
        mode: form.mode,
        transferKind: form.mode === 'BANK_TRANSFER' ? form.transferKind : undefined,
        allocationMode: form.allocationMode,
        selectedDueIds: form.allocationMode === 'SELECTED_PERIODS' ? form.selectedDueIds : [],
        tenureMonths: form.allocationMode === 'TENURE_PACK' ? Number(form.tenureMonths) : undefined,
        utrReference: form.utrReference || undefined,
        bankReference: form.bankReference || undefined,
        chequeNumber: form.mode === 'CHEQUE' ? form.chequeNumber : undefined,
        chequeDate: form.mode === 'CHEQUE' ? form.chequeDate : undefined,
        bankName: form.mode === 'CHEQUE' ? form.bankName : undefined,
        account: form.account || undefined,
        notes: form.notes || undefined,
        allowDuplicateUtr: form.allowDuplicateUtr,
        overrideReason: form.allowDuplicateUtr ? form.overrideReason : undefined,
        idempotencyKey: crypto.randomUUID(),
      },
    })
    await uploadProofFile(response.data.id)
    success.value = response.data
    toast.add({ severity: 'success', summary: 'Payment recorded', detail: response.data.receiptNumber, life: 10000 })
    await refreshDues()
  } finally {
    saving.value = false
  }
}

const resetForm = () => {
  form.flatId = ''
  form.payerUserId = ''
  form.amount = ''
  form.paymentDate = todayDate()
  form.mode = 'UPI'
  form.transferKind = ''
  form.allocationMode = 'OLDEST_UNPAID_FIRST'
  form.selectedDueIds = []
  form.tenureMonths = '3'
  form.utrReference = ''
  form.bankReference = ''
  form.chequeNumber = ''
  form.chequeDate = ''
  form.bankName = ''
  form.account = ''
  form.notes = ''
  form.allowDuplicateUtr = false
  form.overrideReason = ''
  clearProofFile()
  preview.value = null
  duplicate.value = null
  success.value = null
}
</script>

<template>
  <div class="landing-page">
    <section v-if="success" class="surface-card finance-success">
      <p class="eyebrow">Recorded</p>
      <h1>Payment receipt generated</h1>
      <dl>
        <div>
          <dt>Payment</dt>
          <dd>{{ success.id }}</dd>
        </div>
        <div>
          <dt>Receipt</dt>
          <dd>{{ success.receiptNumber }}</dd>
        </div>
      </dl>
      <div class="admin-inline-actions">
        <Button as="router-link" to="/admin/payments" label="View payments" icon="pi pi-list" />
        <Button as="a" :href="`/api/payments/${success.id}/receipt`" target="_blank" label="Download receipt" icon="pi pi-download" severity="secondary" outlined />
        <Button label="Add another" icon="pi pi-plus" severity="secondary" outlined @click="resetForm" />
      </div>
    </section>

    <section v-else class="admin-two-column admin-two-column--wide">
      <form class="surface-card admin-form-layout" @submit.prevent="submitPayment">
        <header class="list-page__header">
          <div>
            <h1>Record payment</h1>
            <p>Capture offline maintenance payments with allocation preview, duplicate-reference checks, receipt generation, and journal posting.</p>
          </div>
          <Button as="router-link" to="/admin/payments" label="All payments" icon="pi pi-list" severity="secondary" outlined />
        </header>

        <section class="admin-form-section">
          <div class="admin-form-section__header">
            <div>
              <p class="eyebrow">Payment target</p>
              <h2>Flat and payer</h2>
            </div>
          </div>
          <div class="admin-form-grid">
            <label>
              <span class="field-label">Flat</span>
              <Select v-model="form.flatId" :options="flatOptions" option-label="label" option-value="value" filter required placeholder="Select flat" />
            </label>
            <label>
              <span class="field-label">Payer</span>
              <Select v-model="form.payerUserId" :options="residentOptions" option-label="label" option-value="value" filter placeholder="Billing contact" />
            </label>
            <label>
              <span class="field-label">Amount</span>
              <InputText v-model="form.amount" inputmode="decimal" required placeholder="0.00" />
            </label>
            <label>
              <span class="field-label">Payment date</span>
              <InputText v-model="form.paymentDate" type="date" required />
            </label>
            <label class="admin-form-grid__full">
              <span class="field-label">Deposit account</span>
              <Select v-model="form.account" :options="accountOptions" option-label="label" option-value="value" filter placeholder="Default account" />
            </label>
          </div>
        </section>

        <section class="admin-form-section">
          <div class="admin-form-section__header">
            <div>
              <p class="eyebrow">Mode and reference</p>
              <h2>Payment details</h2>
            </div>
            <Button type="button" label="Check reference" icon="pi pi-search" severity="secondary" outlined :loading="duplicatePending" :disabled="!referenceValue" @click="checkDuplicateReference" />
          </div>
          <div class="admin-form-grid">
            <label>
              <span class="field-label">Mode</span>
              <Select v-model="form.mode" :options="paymentModes" option-label="label" option-value="value" required />
            </label>
            <label v-if="form.mode === 'BANK_TRANSFER'">
              <span class="field-label">Transfer kind</span>
              <Select v-model="form.transferKind" :options="transferKinds" option-label="label" option-value="value" required placeholder="NEFT / IMPS / RTGS" />
            </label>
            <label v-if="needsReference">
              <span class="field-label">UTR</span>
              <InputText v-model="form.utrReference" placeholder="UPI or bank UTR" />
            </label>
            <label v-if="needsReference">
              <span class="field-label">Bank reference</span>
              <InputText v-model="form.bankReference" placeholder="Optional bank reference" />
            </label>
            <label v-if="needsCheque">
              <span class="field-label">Cheque number</span>
              <InputText v-model="form.chequeNumber" required />
            </label>
            <label v-if="needsCheque">
              <span class="field-label">Cheque date</span>
              <InputText v-model="form.chequeDate" type="date" required />
            </label>
            <label v-if="needsCheque" class="admin-form-grid__full">
              <span class="field-label">Cheque bank</span>
              <InputText v-model="form.bankName" required />
            </label>
          </div>

          <Message v-if="duplicate?.duplicate" severity="warn" :closable="false">
            This reference already appears on {{ duplicate.matches.length }} payment record(s). Enable duplicate override only for approved corrections.
          </Message>
          <div v-if="duplicate?.duplicate" class="admin-form-grid">
            <label class="admin-toggle-card">
              <span>Allow duplicate reference</span>
              <Checkbox v-model="form.allowDuplicateUtr" binary />
            </label>
            <label>
              <span class="field-label">Override reason</span>
              <Textarea v-model="form.overrideReason" rows="2" auto-resize :required="form.allowDuplicateUtr" />
            </label>
          </div>
        </section>

        <section class="admin-form-section">
          <div class="admin-form-section__header">
            <div>
              <p class="eyebrow">Proof</p>
              <h2>Payment file</h2>
            </div>
            <Button
              type="button"
              :label="proofFile ? 'Replace' : 'Upload'"
              icon="pi pi-upload"
              severity="secondary"
              outlined
              @click="pickProofFile"
            />
          </div>
          <input
            ref="proofInput"
            type="file"
            :accept="proofAccept"
            class="finance-upload-card__input"
            @change="onProofFileChange"
          >
          <div class="resident-file-upload">
            <div class="resident-file-upload__body">
              <div class="resident-file-upload__header">
                <strong>{{ proofFile?.fileName || 'No proof selected' }}</strong>
                <span class="muted-line">
                  {{ proofFile ? `${proofFile.mimeType} · ${formatBytes(proofFile.sizeBytes)}` : 'PDF, Excel, PNG, JPG, JPEG, or WebP' }}
                </span>
              </div>
              <Button
                v-if="proofFile"
                type="button"
                icon="pi pi-times"
                label="Remove"
                severity="danger"
                text
                @click="clearProofFile"
              />
            </div>
          </div>
        </section>

        <section class="admin-form-section">
          <div class="admin-form-section__header">
            <div>
              <p class="eyebrow">Allocation</p>
              <h2>Period handling</h2>
            </div>
            <Button type="button" label="Preview allocation" icon="pi pi-calculator" severity="secondary" outlined :loading="previewPending" :disabled="!form.flatId || amountNumber <= 0" @click="previewAllocation" />
          </div>
          <div class="admin-form-grid">
            <label>
              <span class="field-label">Allocation mode</span>
              <Select v-model="form.allocationMode" :options="allocationModes" option-label="label" option-value="value" />
            </label>
            <label v-if="form.allocationMode === 'TENURE_PACK'">
              <span class="field-label">Tenure months</span>
              <InputText v-model="form.tenureMonths" inputmode="numeric" />
            </label>
            <label v-if="form.allocationMode === 'SELECTED_PERIODS'" class="admin-form-grid__full">
              <span class="field-label">Selected periods</span>
              <MultiSelect v-model="form.selectedDueIds" :options="dueOptions" option-label="label" option-value="value" display="chip" placeholder="Choose due rows" />
            </label>
            <label class="admin-form-grid__full">
              <span class="field-label">Notes</span>
              <Textarea v-model="form.notes" rows="3" auto-resize />
            </label>
          </div>
        </section>

        <div class="admin-inline-actions dialog-actions">
          <Button type="button" label="Preview" icon="pi pi-calculator" severity="secondary" outlined :loading="previewPending" :disabled="!form.flatId || amountNumber <= 0" @click="previewAllocation" />
          <Button type="submit" label="Record payment" icon="pi pi-check" :loading="saving" :disabled="!form.flatId || amountNumber <= 0" />
        </div>
      </form>

      <aside class="surface-card admin-form-layout">
        <section>
          <p class="eyebrow">Current flat</p>
          <h2>{{ selectedFlat }}</h2>
          <p>{{ openDues.length }} open due rows available for allocation.</p>
        </section>

        <DataTable :value="openDues" :loading="duesPending" responsive-layout="scroll" class="list-page__table">
          <Column field="billingPeriodLabel" header="Period" />
          <Column field="balanceAmount" header="Balance">
            <template #body="{ data: row }">{{ formatMoney(row.balanceAmount) }}</template>
          </Column>
          <Column field="dueDate" header="Due">
            <template #body="{ data: row }">{{ formatDate(row.dueDate) }}</template>
          </Column>
        </DataTable>

        <section class="finance-summary-card">
          <p class="eyebrow">Preview</p>
          <template v-if="preview">
            <dl>
              <div>
                <dt>Total due</dt>
                <dd>{{ formatMoney(preview.totalDue) }}</dd>
              </div>
              <div>
                <dt>Allocated</dt>
                <dd>{{ formatMoney(preview.allocatedAmount) }}</dd>
              </div>
              <div>
                <dt>Advance</dt>
                <dd>{{ formatMoney(preview.advanceAmount) }}</dd>
              </div>
            </dl>
            <DataTable :value="preview.lines" responsive-layout="scroll">
              <Column field="billingPeriodLabel" header="Period" />
              <Column field="allocatedAmount" header="Allocated">
                <template #body="{ data: row }">{{ formatMoney(row.allocatedAmount) }}</template>
              </Column>
              <Column field="remainingBalance" header="Balance">
                <template #body="{ data: row }">{{ formatMoney(row.remainingBalance) }}</template>
              </Column>
            </DataTable>
          </template>
          <AppState v-else variant="empty" title="No preview yet" message="Select a flat and amount, then preview allocation before saving." />
        </section>
      </aside>
    </section>
  </div>
</template>
