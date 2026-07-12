<script setup lang="ts">
import type {
  BankAccount,
  FlatDetail,
  FlatResidentRelationship,
  FlatSummary,
  MaintenanceDue,
} from '~/types/domain'

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
type FlatDetailResponse = { ok: true; data: FlatDetail }
type DuesResponse = { ok: true; data: Paginated<MaintenanceDue> }
type BankAccountsResponse = { ok: true; data: { items: BankAccount[] } }
type LocalPaymentProof = {
  file: File
  fileName: string
  mimeType: string
  sizeBytes: number
}

const api = useApi()
const route = useRoute()
const toast = useToast()

const todayDate = () => {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

const formatContact = (value: string | null | undefined) => value || 'No contact'

const getQueryText = (value: unknown) => {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

const getQueryAmount = (value: unknown) => {
  const amount = Number(getQueryText(value))
  return Number.isFinite(amount) && amount > 0 ? String(amount) : ''
}

const initialFlatId = getQueryText(route.query.flatId)
const initialDueId = getQueryText(route.query.dueId)
const initialBillingPeriodId = getQueryText(route.query.billingPeriodId)

const form = reactive({
  flatId: initialFlatId,
  payerUserId: '',
  amount: getQueryAmount(route.query.amount),
  paymentDate: todayDate(),
  mode: 'UPI',
  transferKind: '',
  allocationMode: initialDueId || initialBillingPeriodId ? 'SELECTED_PERIODS' : 'OLDEST_UNPAID_FIRST',
  selectedDueIds: initialDueId ? [initialDueId] : [] as string[],
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

const [
  flatsAsyncData,
  selectedFlatDetailAsyncData,
  bankAccountsAsyncData,
  duesAsyncData,
] = await Promise.all([
  useAsyncData('manual-payment-flats', () =>
    api<FlatsResponse>('/api/admin/flats', {
      query: { page: 1, pageSize: 2000, sortBy: 'flatNumber', sortDirection: 'asc', isActive: 'true' },
    }),
  ),
  useAsyncData(
    'manual-payment-selected-flat',
    () =>
      form.flatId
        ? api<FlatDetailResponse>(`/api/admin/flats/${form.flatId}`)
        : Promise.resolve(null),
    { watch: [() => form.flatId] },
  ),
  useAsyncData('manual-payment-bank-accounts', () =>
    api<BankAccountsResponse>('/api/admin/finance/bank-accounts', { query: { isActive: 'true' } }),
  ),
  useAsyncData(
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
  ),
])

const { data: flatsData } = flatsAsyncData
const {
  data: selectedFlatDetailData,
  pending: payerPending,
} = selectedFlatDetailAsyncData
const { data: bankAccountsData } = bankAccountsAsyncData
const {
  data: duesData,
  pending: duesPending,
  refresh: refreshDues,
} = duesAsyncData

const flatOptions = computed(() =>
  (flatsData.value?.data.items ?? []).map((flat) => ({
    label: `${flat.blockName} ${flat.flatNumber}`,
    value: flat.id,
  })),
)

const payerRelationships = computed(() =>
  (selectedFlatDetailData.value?.data.relationships ?? []).filter(
    (relationship) => relationship.isActive,
  ),
)

const getPayerOptionTag = (relationship: FlatResidentRelationship) => {
  if (relationship.isBillingContact) return 'Billing contact'
  if (relationship.isPrimaryContact) return 'Primary contact'
  return relationship.relationshipType
}

const residentOptions = computed(() =>
  payerRelationships.value.map((relationship) => ({
    label: [
      relationship.residentName,
      getPayerOptionTag(relationship),
      formatContact(relationship.residentMobileNumber ?? relationship.residentEmail),
    ].filter(Boolean).join(' · '),
    value: relationship.userId,
  })),
)

const defaultPayerUserId = computed(
  () =>
    payerRelationships.value.find((relationship) => relationship.isBillingContact)?.userId ??
    payerRelationships.value.find((relationship) => relationship.isPrimaryContact)?.userId ??
    payerRelationships.value[0]?.userId ??
    '',
)

const payerPlaceholder = computed(() => {
  if (!form.flatId) return 'Select flat first'
  if (payerPending.value) return 'Loading payer'
  return residentOptions.value.length > 0 ? 'Select payer' : 'No active payer found'
})

const accountOptions = computed(() =>
  (bankAccountsData.value?.data.items ?? []).map((account) => ({
    label: `${account.accountName} · ${account.bankName} · ${account.accountNumberMasked}`,
    value: account.id,
  })),
)

const autoDepositAccountId = computed(() => {
  const accounts = bankAccountsData.value?.data.items ?? []
  if (accounts.length === 1) return accounts[0]?.id ?? ''
  return accounts.find((account) => account.isDefault)?.id ?? ''
})

const openDues = computed(() => duesData.value?.data.items ?? [])
const dueOptions = computed(() =>
  openDues.value.map((due) => ({
    label: `${due.billingPeriodLabel} · ${formatMoney(due.balanceAmount)} balance`,
    value: due.id,
  })),
)

const routeDuePrefillApplied = ref(false)

const applyRouteDuePrefill = () => {
  if (routeDuePrefillApplied.value) return
  if (!form.flatId || (!initialDueId && !initialBillingPeriodId)) return

  const matchingDue = openDues.value.find((due) =>
    initialDueId
      ? due.id === initialDueId
      : due.billingPeriodId === initialBillingPeriodId,
  )

  if (!matchingDue) return

  form.allocationMode = 'SELECTED_PERIODS'
  form.selectedDueIds = [matchingDue.id]
  if (!form.amount) {
    form.amount = String(matchingDue.balanceAmount)
  }
  routeDuePrefillApplied.value = true
}

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
const formSubmitted = ref(false)
const fieldErrors = reactive<Record<string, string>>({})

const fieldError = (field: string) => fieldErrors[field] ?? ''

const setFieldError = (field: string, message: string) => {
  if (!fieldErrors[field]) {
    fieldErrors[field] = message
  }
}

const clearFieldErrors = () => {
  for (const key of Object.keys(fieldErrors)) {
    fieldErrors[key] = ''
  }
}

const requireField = (field: string, value: unknown, message: string) => {
  if (
    value == null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  ) {
    setFieldError(field, message)
  }
}

const validatePaymentForm = (showToast = false) => {
  clearFieldErrors()

  requireField('flatId', form.flatId, 'Select a flat.')
  requireField('payerUserId', form.payerUserId, 'Select a payer.')
  if (amountNumber.value <= 0) {
    setFieldError('amount', 'Enter a payment amount greater than zero.')
  }
  requireField('paymentDate', form.paymentDate, 'Select a payment date.')
  requireField('account', form.account, 'Select the deposit account.')
  requireField('mode', form.mode, 'Select the payment mode.')

  if (form.mode === 'BANK_TRANSFER') {
    requireField('transferKind', form.transferKind, 'Select NEFT, IMPS, RTGS, or bank transfer.')
  }

  if (needsReference.value && !referenceValue.value) {
    setFieldError('reference', 'Enter UTR or bank reference.')
  }

  if (needsCheque.value) {
    requireField('chequeNumber', form.chequeNumber, 'Enter the cheque number.')
    requireField('chequeDate', form.chequeDate, 'Select the cheque date.')
    requireField('bankName', form.bankName, 'Enter the cheque bank.')
  }

  if (form.allocationMode === 'SELECTED_PERIODS') {
    requireField('selectedDueIds', form.selectedDueIds, 'Select at least one due row.')
  }

  if (form.allocationMode === 'TENURE_PACK') {
    const months = Number(form.tenureMonths)
    if (!Number.isInteger(months) || months <= 0) {
      setFieldError('tenureMonths', 'Enter a valid tenure in months.')
    }
  }

  if (form.allowDuplicateUtr) {
    requireField('overrideReason', form.overrideReason, 'Enter the duplicate reference approval reason.')
  }

  const messages = Object.values(fieldErrors).filter(Boolean)
  if (showToast && messages.length > 0) {
    toast.add({
      severity: 'warn',
      summary: 'Complete required fields',
      detail: messages[0],
      life: 8000,
    })
  }

  return messages.length === 0
}

watch(
  () => [form.flatId, form.amount, form.allocationMode, form.selectedDueIds.join(','), form.tenureMonths],
  () => {
    preview.value = null
  },
)

watch(autoDepositAccountId, (accountId) => {
  if (!form.account && accountId) {
    form.account = accountId
  }
}, { immediate: true })

watch(
  () => [
    form.flatId,
    form.payerUserId,
    form.amount,
    form.paymentDate,
    form.account,
    form.mode,
    form.transferKind,
    form.utrReference,
    form.bankReference,
    form.chequeNumber,
    form.chequeDate,
    form.bankName,
    form.allocationMode,
    form.selectedDueIds.join(','),
    form.tenureMonths,
    form.allowDuplicateUtr,
    form.overrideReason,
  ],
  () => {
    if (formSubmitted.value) {
      validatePaymentForm(false)
    }
  },
)

watch(openDues, applyRouteDuePrefill, { immediate: true })

watch(
  () => [form.flatId, defaultPayerUserId.value, residentOptions.value.map((option) => option.value).join(',')],
  () => {
    if (!form.flatId) {
      form.payerUserId = ''
      return
    }

    const selectedPayerStillValid = residentOptions.value.some(
      (option) => option.value === form.payerUserId,
    )
    if (selectedPayerStillValid) return

    form.payerUserId = defaultPayerUserId.value
  },
  { immediate: true },
)

watch(
  () => form.flatId,
  () => {
    form.selectedDueIds = []
    form.payerUserId = ''
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
  if (!form.flatId || amountNumber.value <= 0) {
    formSubmitted.value = true
    validatePaymentForm(true)
    return
  }
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
  formSubmitted.value = true
  if (!validatePaymentForm(true)) {
    return
  }

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
  form.account = autoDepositAccountId.value
  form.notes = ''
  form.allowDuplicateUtr = false
  form.overrideReason = ''
  clearProofFile()
  formSubmitted.value = false
  clearFieldErrors()
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
        <AppDocumentLink :href="`/api/payments/${success.id}/receipt`" viewer-title="Receipt PDF" label="Download receipt" icon="pi pi-download" severity="secondary" outlined />
        <Button label="Add another" icon="pi pi-plus" severity="secondary" outlined @click="resetForm" />
      </div>
    </section>

    <section v-else class="admin-two-column admin-two-column--wide">
      <form class="surface-card admin-form-layout" novalidate @submit.prevent="submitPayment">
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
              <span class="field-label">Flat <span class="required-marker">*</span></span>
              <Select v-model="form.flatId" :options="flatOptions" option-label="label" option-value="value" filter required placeholder="Select flat" :invalid="Boolean(fieldError('flatId'))" />
              <small v-if="fieldError('flatId')" class="field-error">{{ fieldError('flatId') }}</small>
            </label>
            <label>
              <span class="field-label">Payer <span class="required-marker">*</span></span>
              <Select
                v-model="form.payerUserId"
                :options="residentOptions"
                option-label="label"
                option-value="value"
                filter
                required
                :loading="payerPending"
                :disabled="!form.flatId || payerPending || residentOptions.length === 0"
                :placeholder="payerPlaceholder"
                :invalid="Boolean(fieldError('payerUserId'))"
              />
              <small v-if="fieldError('payerUserId')" class="field-error">{{ fieldError('payerUserId') }}</small>
            </label>
            <label>
              <span class="field-label">Amount <span class="required-marker">*</span></span>
              <InputText v-model="form.amount" inputmode="decimal" required placeholder="0.00" :invalid="Boolean(fieldError('amount'))" />
              <small v-if="fieldError('amount')" class="field-error">{{ fieldError('amount') }}</small>
            </label>
            <label>
              <span class="field-label">Payment date <span class="required-marker">*</span></span>
              <InputText v-model="form.paymentDate" type="date" required :invalid="Boolean(fieldError('paymentDate'))" />
              <small v-if="fieldError('paymentDate')" class="field-error">{{ fieldError('paymentDate') }}</small>
            </label>
            <label class="admin-form-grid__full">
              <span class="field-label">Deposit account <span class="required-marker">*</span></span>
              <Select v-model="form.account" :options="accountOptions" option-label="label" option-value="value" filter required placeholder="Select deposit account" :invalid="Boolean(fieldError('account'))" />
              <small v-if="fieldError('account')" class="field-error">{{ fieldError('account') }}</small>
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
              <span class="field-label">Mode <span class="required-marker">*</span></span>
              <Select v-model="form.mode" :options="paymentModes" option-label="label" option-value="value" required :invalid="Boolean(fieldError('mode'))" />
              <small v-if="fieldError('mode')" class="field-error">{{ fieldError('mode') }}</small>
            </label>
            <label v-if="form.mode === 'BANK_TRANSFER'">
              <span class="field-label">Transfer kind <span class="required-marker">*</span></span>
              <Select v-model="form.transferKind" :options="transferKinds" option-label="label" option-value="value" required placeholder="NEFT / IMPS / RTGS" :invalid="Boolean(fieldError('transferKind'))" />
              <small v-if="fieldError('transferKind')" class="field-error">{{ fieldError('transferKind') }}</small>
            </label>
            <label v-if="needsReference">
              <span class="field-label">UTR / reference <span class="required-marker">*</span></span>
              <InputText v-model="form.utrReference" placeholder="UPI or bank UTR" :invalid="Boolean(fieldError('reference'))" />
            </label>
            <label v-if="needsReference">
              <span class="field-label">Bank reference</span>
              <InputText v-model="form.bankReference" placeholder="Optional bank reference" :invalid="Boolean(fieldError('reference'))" />
              <small v-if="fieldError('reference')" class="field-error">{{ fieldError('reference') }}</small>
            </label>
            <label v-if="needsCheque">
              <span class="field-label">Cheque number <span class="required-marker">*</span></span>
              <InputText v-model="form.chequeNumber" required :invalid="Boolean(fieldError('chequeNumber'))" />
              <small v-if="fieldError('chequeNumber')" class="field-error">{{ fieldError('chequeNumber') }}</small>
            </label>
            <label v-if="needsCheque">
              <span class="field-label">Cheque date <span class="required-marker">*</span></span>
              <InputText v-model="form.chequeDate" type="date" required :invalid="Boolean(fieldError('chequeDate'))" />
              <small v-if="fieldError('chequeDate')" class="field-error">{{ fieldError('chequeDate') }}</small>
            </label>
            <label v-if="needsCheque" class="admin-form-grid__full">
              <span class="field-label">Cheque bank <span class="required-marker">*</span></span>
              <InputText v-model="form.bankName" required :invalid="Boolean(fieldError('bankName'))" />
              <small v-if="fieldError('bankName')" class="field-error">{{ fieldError('bankName') }}</small>
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
              <span class="field-label">Override reason <span class="required-marker">*</span></span>
              <Textarea v-model="form.overrideReason" rows="2" auto-resize :required="form.allowDuplicateUtr" :invalid="Boolean(fieldError('overrideReason'))" />
              <small v-if="fieldError('overrideReason')" class="field-error">{{ fieldError('overrideReason') }}</small>
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
              <span class="field-label">Allocation mode <span class="required-marker">*</span></span>
              <Select v-model="form.allocationMode" :options="allocationModes" option-label="label" option-value="value" />
            </label>
            <label v-if="form.allocationMode === 'TENURE_PACK'">
              <span class="field-label">Tenure months <span class="required-marker">*</span></span>
              <InputText v-model="form.tenureMonths" inputmode="numeric" :invalid="Boolean(fieldError('tenureMonths'))" />
              <small v-if="fieldError('tenureMonths')" class="field-error">{{ fieldError('tenureMonths') }}</small>
            </label>
            <label v-if="form.allocationMode === 'SELECTED_PERIODS'" class="admin-form-grid__full">
              <span class="field-label">Selected periods <span class="required-marker">*</span></span>
              <MultiSelect v-model="form.selectedDueIds" :options="dueOptions" option-label="label" option-value="value" display="chip" placeholder="Choose due rows" :invalid="Boolean(fieldError('selectedDueIds'))" />
              <small v-if="fieldError('selectedDueIds')" class="field-error">{{ fieldError('selectedDueIds') }}</small>
            </label>
            <label class="admin-form-grid__full">
              <span class="field-label">Notes</span>
              <Textarea v-model="form.notes" rows="3" auto-resize />
            </label>
          </div>
        </section>

        <div class="admin-inline-actions dialog-actions">
          <Button type="button" label="Preview" icon="pi pi-calculator" severity="secondary" outlined :loading="previewPending" :disabled="!form.flatId || amountNumber <= 0" @click="previewAllocation" />
          <Button type="submit" label="Record payment" icon="pi pi-check" :loading="saving" :disabled="saving" />
        </div>
      </form>

      <aside class="surface-card admin-form-layout">
        <section>
          <p class="eyebrow">Current flat</p>
          <h2>{{ selectedFlat }}</h2>
          <p>{{ openDues.length }} open due rows available for allocation.</p>
        </section>

        <AppDataTable :value="openDues" :loading="duesPending" responsive-layout="scroll" class="list-page__table">
          <Column field="billingPeriodLabel" header="Period" />
          <Column field="balanceAmount" header="Balance">
            <template #body="{ data: row }">{{ formatMoney(row.balanceAmount) }}</template>
          </Column>
          <Column field="dueDate" header="Due">
            <template #body="{ data: row }">{{ formatDate(row.dueDate) }}</template>
          </Column>
        </AppDataTable>

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
            <AppDataTable :value="preview.lines" responsive-layout="scroll">
              <Column field="billingPeriodLabel" header="Period" />
              <Column field="allocatedAmount" header="Allocated">
                <template #body="{ data: row }">{{ formatMoney(row.allocatedAmount) }}</template>
              </Column>
              <Column field="remainingBalance" header="Balance">
                <template #body="{ data: row }">{{ formatMoney(row.remainingBalance) }}</template>
              </Column>
            </AppDataTable>
          </template>
          <AppState v-else variant="empty" title="No preview yet" message="Select a flat and amount, then preview allocation before saving." />
        </section>
      </aside>
    </section>
  </div>
</template>
