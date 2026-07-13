<script setup lang="ts">
import type { DataTablePageEvent } from 'primevue/datatable'
import type {
  BankAccount,
  BillingPeriod,
  FlatDetail,
  FlatResidentRelationship,
  FlatSummary,
  MaintenanceDue,
  ResidentSummary,
} from '~/types/domain'

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
  recordType?: 'PAYMENT' | 'CAM_ADVANCE'
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
  camAdvanceCoverageId?: string | null
  coveredFrom?: string | null
  coveredUntil?: string | null
}

type PaymentCamAdvanceMatch = {
  id: string
  flatId: string
  flatNumber: string
  blockName: string
  primaryResidentName: string | null
  coveredFrom: string
  coveredUntil: string
  amount: string | null
  source: string
  reference: string | null
  notes: string | null
}

type PaymentAllocation = {
  id: string
  dueId: string
  billingPeriodId: string
  billingPeriodLabel: string
  dueAmount: string
  lateFeeComponent: string
  allocatedAmount: string
  remainingBalance: string
  allocationOrder: number
}

type PaymentSnapshot = {
  selectedDueIds?: string[]
  tenureMonths?: number
  cheque?: {
    chequeNumber?: string
    chequeDate?: string
    bankName?: string
  }
  account?: string
  overrideReason?: string
}

type PaymentDetail = {
  id: string
  payment_date: string
  amount: string
  mode: string
  transfer_kind: string | null
  status: string
  payer_user_id: string
  received_for_flat_id: string
  allocation_mode: string
  allocation_snapshot: PaymentSnapshot | null
  utr_reference: string | null
  bank_reference: string | null
  receipt_number: string | null
  proof_file_path: string | null
  notes: string | null
  flat_number: string | null
  block_name: string | null
  payer_name: string | null
  allocations: PaymentAllocation[]
}

type PaymentsResponse = {
  ok: true
  data: Paginated<PaymentSummary> & {
    camAdvanceMatches?: PaymentCamAdvanceMatch[]
  }
}
type DetailResponse = { ok: true; data: PaymentDetail }
type PaymentUpdateResponse = {
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
type ProofUploadResponse = {
  ok: true
  data: {
    filePath: string
    downloadUrl: string
  }
}
type FlatsResponse = { ok: true; data: Paginated<FlatSummary> }
type ResidentsResponse = { ok: true; data: Paginated<ResidentSummary> }
type PeriodsResponse = { ok: true; data: Paginated<BillingPeriod> }
type BankAccountsResponse = { ok: true; data: { items: BankAccount[] } }
type FlatDetailResponse = { ok: true; data: FlatDetail }
type DuesResponse = { ok: true; data: Paginated<MaintenanceDue> }

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

const editablePaymentModes = [
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

const formatContact = (value: string | null | undefined) => value || 'No contact'

const flatLabel = (payment: Pick<PaymentSummary, 'blockName' | 'flatNumber'>) =>
  [payment.blockName, payment.flatNumber].filter(Boolean).join(' ') || '-'

const referenceLabel = (payment: Pick<PaymentSummary, 'utrReference' | 'bankReference'>) =>
  payment.utrReference || payment.bankReference || '-'

const isCamAdvancePayment = (payment: Pick<PaymentSummary, 'recordType' | 'id' | 'mode'>) =>
  payment.recordType === 'CAM_ADVANCE' ||
  payment.mode === 'CAM_ADVANCE' ||
  payment.id.startsWith('cam-advance:')

const paymentModeLabel = (payment: Pick<PaymentSummary, 'mode' | 'transferKind'>) =>
  payment.mode === 'CAM_ADVANCE'
    ? [payment.transferKind, 'CAM advance'].filter(Boolean).join(' · ')
    : payment.transferKind || payment.mode

const paymentDateLabel = (payment: PaymentSummary) =>
  isCamAdvancePayment(payment) && payment.coveredFrom && payment.coveredUntil
    ? `${formatDate(payment.coveredFrom)} - ${formatDate(payment.coveredUntil)}`
    : formatDate(payment.paymentDate)

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
  bankAccountsAsyncData,
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
  useAsyncData('payment-bank-account-options', () =>
    api<BankAccountsResponse>('/api/admin/finance/bank-accounts', {
      query: { isActive: 'true' },
    }),
  ),
])

const { data, pending, refresh } = paymentsAsyncData
const { data: flatsData } = flatsAsyncData
const { data: residentsData } = residentsAsyncData
const { data: periodsData } = periodsAsyncData
const { data: bankAccountsData } = bankAccountsAsyncData

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

const kpis = computed(() => ({
  totalAmount: payments.value.reduce((sum, payment) => sum + Number(payment.amount), 0),
  verified: payments.value.filter((payment) => payment.status === 'VERIFIED').length,
  missingReceipts: payments.value.filter((payment) => !payment.receiptNumber).length,
  missingProof: payments.value.filter((payment) => !payment.proofFilePath).length,
}))

const hasActiveFilters = computed(() =>
  Object.entries(query).some(([key, value]) => !['page', 'pageSize'].includes(key) && Boolean(value)),
)
const canEditPayment = computed(() => ['ADMIN', 'MANAGER'].includes(authStore.me?.user.role ?? ''))

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
const paymentEditVisible = ref(false)
const paymentEditLoading = ref(false)
const paymentEditSaving = ref(false)
const paymentEditPayment = ref<PaymentDetail | null>(null)
const paymentEditFlat = ref<FlatDetail | null>(null)
const paymentEditDues = ref<MaintenanceDue[]>([])
const paymentEditForm = reactive({
  flatId: '',
  payerUserId: '',
  amount: null as number | null,
  paymentDate: '',
  account: '',
  mode: 'UPI',
  transferKind: '',
  utrReference: '',
  bankReference: '',
  chequeNumber: '',
  chequeDate: '',
  bankName: '',
  allocationMode: 'OLDEST_UNPAID_FIRST',
  selectedDueIds: [] as string[],
  tenureMonths: '3',
  notes: '',
  allowDuplicateUtr: false,
  overrideReason: '',
})
const proofAccept = 'application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,image/webp'
const proofAllowedMimeTypes = proofAccept.split(',')
const proofMaxSizeBytes = 10 * 1024 * 1024
const paymentEditSubmitted = ref(false)
const paymentEditFieldErrors = reactive<Record<string, string>>({})

const paymentEditFieldError = (field: string) => paymentEditFieldErrors[field] ?? ''

const setPaymentEditFieldError = (field: string, message: string) => {
  if (!paymentEditFieldErrors[field]) {
    paymentEditFieldErrors[field] = message
  }
}

const clearPaymentEditFieldErrors = () => {
  for (const key of Object.keys(paymentEditFieldErrors)) {
    paymentEditFieldErrors[key] = ''
  }
}

const requirePaymentEditField = (field: string, value: unknown, message: string) => {
  if (
    value == null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  ) {
    setPaymentEditFieldError(field, message)
  }
}

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
  if (isCamAdvancePayment(payment) || !payment.receiptNumber) return
  await navigator.clipboard.writeText(payment.receiptNumber)
  toast.add({ severity: 'success', summary: 'Receipt copied', life: 10000 })
}

const getPayerOptionTag = (relationship: FlatResidentRelationship) => {
  if (relationship.isBillingContact) return 'Billing contact'
  if (relationship.isPrimaryContact) return 'Primary contact'
  return relationship.relationshipType
}

const paymentEditPayerRelationships = computed(() =>
  (paymentEditFlat.value?.relationships ?? []).filter(
    (relationship) => relationship.isActive,
  ),
)

const paymentEditPayerOptions = computed(() =>
  paymentEditPayerRelationships.value.map((relationship) => ({
    label: [
      relationship.residentName,
      getPayerOptionTag(relationship),
      formatContact(relationship.residentMobileNumber ?? relationship.residentEmail),
    ].filter(Boolean).join(' · '),
    value: relationship.userId,
  })),
)

const paymentEditDefaultPayerUserId = computed(
  () =>
    paymentEditPayerRelationships.value.find((relationship) => relationship.isBillingContact)?.userId ??
    paymentEditPayerRelationships.value.find((relationship) => relationship.isPrimaryContact)?.userId ??
    paymentEditPayerRelationships.value[0]?.userId ??
    '',
)

const paymentEditDueOptions = computed(() => {
  const options = new Map<string, string>()

  for (const due of paymentEditDues.value) {
    if (due.isAdvanceCoverageRow || due.isCamAdvanceCovered) continue
    options.set(
      due.id,
      `${due.billingPeriodLabel} · ${formatMoney(due.balanceAmount)} balance`,
    )
  }

  for (const allocation of paymentEditPayment.value?.allocations ?? []) {
    if (options.has(allocation.dueId)) continue
    options.set(
      allocation.dueId,
      `${allocation.billingPeriodLabel} · current allocation`,
    )
  }

  return Array.from(options, ([value, label]) => ({ value, label }))
})

const paymentEditAmount = computed(() => Number(paymentEditForm.amount ?? 0))
const paymentEditNeedsReference = computed(() =>
  ['UPI', 'BANK_TRANSFER'].includes(paymentEditForm.mode),
)
const paymentEditNeedsCheque = computed(() => paymentEditForm.mode === 'CHEQUE')
const paymentEditReferenceValue = computed(() =>
  paymentEditForm.utrReference.trim() || paymentEditForm.bankReference.trim(),
)

const validatePaymentEditForm = (showToast = false) => {
  clearPaymentEditFieldErrors()

  requirePaymentEditField('flatId', paymentEditForm.flatId, 'Select a flat.')
  requirePaymentEditField('payerUserId', paymentEditForm.payerUserId, 'Select a payer.')
  if (paymentEditAmount.value <= 0) {
    setPaymentEditFieldError('amount', 'Enter a payment amount greater than zero.')
  }
  requirePaymentEditField('paymentDate', paymentEditForm.paymentDate, 'Select a payment date.')
  requirePaymentEditField('account', paymentEditForm.account, 'Select the deposit account.')
  requirePaymentEditField('mode', paymentEditForm.mode, 'Select the payment mode.')

  if (paymentEditForm.mode === 'BANK_TRANSFER') {
    requirePaymentEditField('transferKind', paymentEditForm.transferKind, 'Select NEFT, IMPS, RTGS, or bank transfer.')
  }

  if (paymentEditNeedsReference.value && !paymentEditReferenceValue.value) {
    setPaymentEditFieldError('reference', 'Enter UTR or bank reference.')
  }

  if (paymentEditNeedsCheque.value) {
    requirePaymentEditField('chequeNumber', paymentEditForm.chequeNumber, 'Enter the cheque number.')
    requirePaymentEditField('chequeDate', paymentEditForm.chequeDate, 'Select the cheque date.')
    requirePaymentEditField('bankName', paymentEditForm.bankName, 'Enter the cheque bank.')
  }

  if (paymentEditForm.allocationMode === 'SELECTED_PERIODS') {
    requirePaymentEditField('selectedDueIds', paymentEditForm.selectedDueIds, 'Select at least one due row.')
  }

  if (paymentEditForm.allocationMode === 'TENURE_PACK') {
    const months = Number(paymentEditForm.tenureMonths)
    if (!Number.isInteger(months) || months <= 0) {
      setPaymentEditFieldError('tenureMonths', 'Enter a valid tenure in months.')
    }
  }

  if (paymentEditForm.allowDuplicateUtr) {
    requirePaymentEditField('overrideReason', paymentEditForm.overrideReason, 'Enter the duplicate reference approval reason.')
  }

  const messages = Object.values(paymentEditFieldErrors).filter(Boolean)
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

const loadPaymentEditFlatContext = async (flatId: string) => {
  const [flatResponse, duesResponse] = await Promise.all([
    api<FlatDetailResponse>(`/api/admin/flats/${flatId}`),
    api<DuesResponse>('/api/admin/billing/dues', {
      query: {
        page: 1,
        pageSize: 500,
        flatId,
        sortBy: 'dueDate',
        sortDirection: 'asc',
      },
    }),
  ])

  paymentEditFlat.value = flatResponse.data
  paymentEditDues.value = duesResponse.data.items
}

const applyPaymentDetailToEditForm = (payment: PaymentDetail) => {
  const snapshot = payment.allocation_snapshot ?? {}
  const cheque = snapshot.cheque ?? {}
  const selectedDueIds =
    Array.isArray(snapshot.selectedDueIds) && snapshot.selectedDueIds.length > 0
      ? snapshot.selectedDueIds
      : payment.allocations.map((allocation) => allocation.dueId)

  paymentEditForm.flatId = payment.received_for_flat_id
  paymentEditForm.payerUserId = payment.payer_user_id
  paymentEditForm.amount = Number(payment.amount)
  paymentEditForm.paymentDate = payment.payment_date
  paymentEditForm.account = snapshot.account ?? autoDepositAccountId.value
  paymentEditForm.mode = payment.mode
  paymentEditForm.transferKind = payment.transfer_kind ?? ''
  paymentEditForm.utrReference = payment.utr_reference ?? ''
  paymentEditForm.bankReference = payment.bank_reference ?? ''
  paymentEditForm.chequeNumber = cheque.chequeNumber ?? ''
  paymentEditForm.chequeDate = cheque.chequeDate ?? ''
  paymentEditForm.bankName = cheque.bankName ?? ''
  paymentEditForm.allocationMode = payment.allocation_mode || 'OLDEST_UNPAID_FIRST'
  paymentEditForm.selectedDueIds = selectedDueIds
  paymentEditForm.tenureMonths = String(snapshot.tenureMonths ?? '3')
  paymentEditForm.notes = payment.notes ?? ''
  paymentEditForm.allowDuplicateUtr = false
  paymentEditForm.overrideReason = ''
  paymentEditSubmitted.value = false
  clearPaymentEditFieldErrors()
}

const openPaymentEdit = async (payment: PaymentSummary) => {
  if (isCamAdvancePayment(payment)) return
  paymentEditVisible.value = true
  paymentEditLoading.value = true
  paymentEditPayment.value = null
  paymentEditFlat.value = null
  paymentEditDues.value = []
  paymentEditSubmitted.value = false
  clearPaymentEditFieldErrors()

  try {
    const response = await api<DetailResponse>(`/api/payments/${payment.id}`)
    paymentEditPayment.value = response.data
    applyPaymentDetailToEditForm(response.data)
    await loadPaymentEditFlatContext(response.data.received_for_flat_id)
  } finally {
    paymentEditLoading.value = false
  }
}

const onPaymentEditFlatChange = async () => {
  const flatId = paymentEditForm.flatId
  if (!flatId) return

  paymentEditLoading.value = true
  try {
    await loadPaymentEditFlatContext(flatId)
    if (!paymentEditPayerOptions.value.some((option) => option.value === paymentEditForm.payerUserId)) {
      paymentEditForm.payerUserId = paymentEditDefaultPayerUserId.value
    }
    if (!paymentEditForm.account && autoDepositAccountId.value) {
      paymentEditForm.account = autoDepositAccountId.value
    }
    paymentEditForm.selectedDueIds = []
  } finally {
    paymentEditLoading.value = false
  }
}

watch(
  () => paymentEditForm.mode,
  () => {
    if (paymentEditForm.mode !== 'BANK_TRANSFER') paymentEditForm.transferKind = ''
    if (paymentEditForm.mode !== 'CHEQUE') {
      paymentEditForm.chequeNumber = ''
      paymentEditForm.chequeDate = ''
      paymentEditForm.bankName = ''
    }
  },
)

watch(autoDepositAccountId, (accountId) => {
  if (!paymentEditForm.account && accountId) {
    paymentEditForm.account = accountId
  }
}, { immediate: true })

watch(
  () => [
    paymentEditForm.flatId,
    paymentEditForm.payerUserId,
    paymentEditForm.amount,
    paymentEditForm.paymentDate,
    paymentEditForm.account,
    paymentEditForm.mode,
    paymentEditForm.transferKind,
    paymentEditForm.utrReference,
    paymentEditForm.bankReference,
    paymentEditForm.chequeNumber,
    paymentEditForm.chequeDate,
    paymentEditForm.bankName,
    paymentEditForm.allocationMode,
    paymentEditForm.selectedDueIds.join(','),
    paymentEditForm.tenureMonths,
    paymentEditForm.allowDuplicateUtr,
    paymentEditForm.overrideReason,
  ],
  () => {
    if (paymentEditSubmitted.value) {
      validatePaymentEditForm(false)
    }
  },
)

const savePaymentEdit = async () => {
  const payment = paymentEditPayment.value
  if (!payment) return

  paymentEditSubmitted.value = true
  if (!validatePaymentEditForm(true)) {
    return
  }

  paymentEditSaving.value = true
  try {
    const response = await api<PaymentUpdateResponse>(`/api/payments/${payment.id}`, {
      method: 'PATCH',
      body: {
        flatId: paymentEditForm.flatId,
        payerUserId: paymentEditForm.payerUserId,
        amount: paymentEditAmount.value,
        paymentDate: paymentEditForm.paymentDate,
        account: paymentEditForm.account || null,
        mode: paymentEditForm.mode,
        transferKind: paymentEditForm.mode === 'BANK_TRANSFER'
          ? paymentEditForm.transferKind || null
          : null,
        utrReference: paymentEditNeedsReference.value ? paymentEditForm.utrReference || null : null,
        bankReference: paymentEditNeedsReference.value ? paymentEditForm.bankReference || null : null,
        chequeNumber: paymentEditNeedsCheque.value ? paymentEditForm.chequeNumber || null : null,
        chequeDate: paymentEditNeedsCheque.value ? paymentEditForm.chequeDate || null : null,
        bankName: paymentEditNeedsCheque.value ? paymentEditForm.bankName || null : null,
        allocationMode: paymentEditForm.allocationMode,
        selectedDueIds: paymentEditForm.allocationMode === 'SELECTED_PERIODS'
          ? paymentEditForm.selectedDueIds
          : [],
        tenureMonths: paymentEditForm.allocationMode === 'TENURE_PACK'
          ? Number(paymentEditForm.tenureMonths)
          : null,
        notes: paymentEditForm.notes || null,
        allowDuplicateUtr: paymentEditForm.allowDuplicateUtr,
        overrideReason: paymentEditForm.allowDuplicateUtr
          ? paymentEditForm.overrideReason || null
          : null,
      },
    })
    toast.add({
      severity: 'success',
      summary: 'Payment updated',
      detail: response.data.advanceAmount && response.data.advanceAmount > 0
        ? `${formatMoney(response.data.advanceAmount)} kept as advance.`
        : undefined,
      life: 10000,
    })
    paymentEditVisible.value = false
    await refresh()
    if (detailVisible.value && selectedPayment.value?.id === payment.id) {
      await openDetail({ id: payment.id })
    }
  } finally {
    paymentEditSaving.value = false
  }
}

const pickProofFileById = (paymentId: string) => {
  proofTargetPaymentId.value = paymentId
  proofInput.value?.click()
}

const pickProofFile = (payment: Pick<PaymentSummary, 'id'>) => {
  if (payment.id.startsWith('cam-advance:')) return
  pickProofFileById(payment.id)
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
    const response = await api<ProofUploadResponse>(`/api/payments/${paymentId}/proof`, {
      method: 'POST',
      body: formData,
    })
    toast.add({ severity: 'success', summary: 'Proof uploaded', life: 10000 })
    if (paymentEditPayment.value?.id === paymentId) {
      paymentEditPayment.value.proof_file_path = response.data.filePath
    }
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
            {{ paymentDateLabel(row) }}
          </template>
        </Column>
        <Column field="flatNumber" header="Flat">
          <template #body="{ data: row }">
            <strong>{{ flatLabel(row) }}</strong>
            <p class="table-muted">
              {{ row.payerName || '-' }}<template v-if="isCamAdvancePayment(row)"> · CAM advance</template>
            </p>
          </template>
        </Column>
        <Column field="amount" header="Amount">
          <template #body="{ data: row }">
            <strong>{{ formatMoney(row.amount) }}</strong>
          </template>
        </Column>
        <Column field="mode" header="Mode">
          <template #body="{ data: row }">
            <span>{{ paymentModeLabel(row) }}</span>
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
            <Tag v-if="isCamAdvancePayment(row)" value="Advance register" severity="info" rounded />
            <button v-else-if="row.receiptNumber" class="text-button" type="button" @click="copyReceipt(row)">
              {{ row.receiptNumber }}
            </button>
            <span v-else>-</span>
          </template>
        </Column>
        <Column header="Files">
          <template #body="{ data: row }">
            <div class="admin-inline-actions">
              <Tag
                v-if="isCamAdvancePayment(row)"
                severity="info"
                value="CAM advance"
                rounded
              />
              <template v-else>
                <Tag :severity="row.proofFilePath ? 'success' : 'warn'" :value="row.proofFilePath ? 'Proof' : 'No proof'" rounded />
                <Tag :severity="row.receiptNumber ? 'success' : 'warn'" :value="row.receiptNumber ? 'Receipt' : 'No receipt'" rounded />
              </template>
              <Button
                v-if="!isCamAdvancePayment(row) && row.proofFilePath"
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
                v-if="!isCamAdvancePayment(row)"
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
              <Button
                v-if="isCamAdvancePayment(row)"
                as="router-link"
                to="/admin/billing/cam-advance"
                icon="pi pi-calendar"
                severity="secondary"
                text
                rounded
                aria-label="Open CAM advance"
                title="Open CAM advance"
              />
              <Button v-else icon="pi pi-eye" severity="secondary" text rounded aria-label="View payment" title="View payment" @click="openDetail(row)" />
              <Button
                v-if="canEditPayment && !isCamAdvancePayment(row)"
                icon="pi pi-pencil"
                severity="secondary"
                text
                rounded
                aria-label="Edit payment"
                title="Edit payment"
                @click="openPaymentEdit(row)"
              />
              <AppDocumentLink
                v-if="!isCamAdvancePayment(row)"
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
              <p>{{ flatLabel(payment) }} · {{ paymentDateLabel(payment) }}</p>
            </div>
            <AppStatusBadge :status="payment.status" />
          </div>
          <div class="list-card__row">
            <span>Payer</span>
            <strong>{{ payment.payerName || '-' }}<template v-if="isCamAdvancePayment(payment)"> · CAM advance</template></strong>
          </div>
          <div class="list-card__row">
            <span>Reference</span>
            <strong>{{ referenceLabel(payment) }}</strong>
          </div>
          <div class="list-card__row">
            <span>Receipt</span>
            <strong>{{ isCamAdvancePayment(payment) ? 'Advance register' : payment.receiptNumber || '-' }}</strong>
          </div>
          <div class="admin-inline-actions">
            <Button
              v-if="isCamAdvancePayment(payment)"
              as="router-link"
              to="/admin/billing/cam-advance"
              label="Open advance"
              icon="pi pi-calendar"
              size="small"
              severity="secondary"
              outlined
            />
            <Button v-else label="View" icon="pi pi-eye" size="small" severity="secondary" outlined @click="openDetail(payment)" />
            <Button
              v-if="canEditPayment && !isCamAdvancePayment(payment)"
              label="Edit payment"
              icon="pi pi-pencil"
              size="small"
              severity="secondary"
              outlined
              @click="openPaymentEdit(payment)"
            />
            <Button
              v-if="!isCamAdvancePayment(payment) && payment.proofFilePath"
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
              v-if="!isCamAdvancePayment(payment)"
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
              v-if="!isCamAdvancePayment(payment)"
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

    <Dialog v-model:visible="paymentEditVisible" header="Edit payment" modal :style="{ width: '760px' }">
      <AppSkeletonState v-if="paymentEditLoading && !paymentEditPayment" />
      <form v-else-if="paymentEditPayment" class="admin-form-layout" novalidate @submit.prevent="savePaymentEdit">
        <section class="admin-form-section">
          <div class="admin-form-section__header">
            <div>
              <p class="eyebrow">Payment target</p>
              <h2>{{ formatMoney(paymentEditForm.amount) }}</h2>
            </div>
          </div>
          <div class="admin-form-grid">
            <label>
              <span class="field-label">Flat <span class="required-marker">*</span></span>
              <Select
                v-model="paymentEditForm.flatId"
                :options="flatOptions"
                option-label="label"
                option-value="value"
                filter
                required
                :disabled="paymentEditLoading"
                :invalid="Boolean(paymentEditFieldError('flatId'))"
                @change="onPaymentEditFlatChange"
              />
              <small v-if="paymentEditFieldError('flatId')" class="field-error">{{ paymentEditFieldError('flatId') }}</small>
            </label>
            <label>
              <span class="field-label">Payer <span class="required-marker">*</span></span>
              <Select
                v-model="paymentEditForm.payerUserId"
                :options="paymentEditPayerOptions"
                option-label="label"
                option-value="value"
                filter
                required
                :loading="paymentEditLoading"
                :disabled="paymentEditLoading || paymentEditPayerOptions.length === 0"
                :invalid="Boolean(paymentEditFieldError('payerUserId'))"
              />
              <small v-if="paymentEditFieldError('payerUserId')" class="field-error">{{ paymentEditFieldError('payerUserId') }}</small>
            </label>
            <label>
              <span class="field-label">Amount <span class="required-marker">*</span></span>
              <InputNumber
                v-model="paymentEditForm.amount"
                mode="currency"
                currency="INR"
                locale="en-IN"
                :min="1"
                :max-fraction-digits="2"
                fluid
                autofocus
                :invalid="Boolean(paymentEditFieldError('amount'))"
              />
              <small v-if="paymentEditFieldError('amount')" class="field-error">{{ paymentEditFieldError('amount') }}</small>
            </label>
            <label>
              <span class="field-label">Payment date <span class="required-marker">*</span></span>
              <InputText v-model="paymentEditForm.paymentDate" type="date" required :invalid="Boolean(paymentEditFieldError('paymentDate'))" />
              <small v-if="paymentEditFieldError('paymentDate')" class="field-error">{{ paymentEditFieldError('paymentDate') }}</small>
            </label>
            <label class="admin-form-grid__full">
              <span class="field-label">Deposit account <span class="required-marker">*</span></span>
              <Select
                v-model="paymentEditForm.account"
                :options="accountOptions"
                option-label="label"
                option-value="value"
                filter
                required
                :invalid="Boolean(paymentEditFieldError('account'))"
              />
              <small v-if="paymentEditFieldError('account')" class="field-error">{{ paymentEditFieldError('account') }}</small>
            </label>
          </div>
        </section>

        <section class="admin-form-section">
          <div class="admin-form-section__header">
            <div>
              <p class="eyebrow">Proof</p>
              <h2>{{ paymentEditPayment.proof_file_path ? 'Proof attached' : 'No proof attached' }}</h2>
            </div>
            <div class="admin-inline-actions">
              <Button
                v-if="paymentEditPayment.proof_file_path"
                as="a"
                :href="`/api/payments/${paymentEditPayment.id}/proof`"
                target="_blank"
                label="Open proof"
                icon="pi pi-paperclip"
                severity="secondary"
                outlined
              />
              <Button
                type="button"
                :label="paymentEditPayment.proof_file_path ? 'Replace proof' : 'Upload proof'"
                icon="pi pi-upload"
                severity="secondary"
                outlined
                :loading="proofUploadingId === paymentEditPayment.id"
                @click="pickProofFileById(paymentEditPayment.id)"
              />
            </div>
          </div>
          <div class="resident-file-upload">
            <div class="resident-file-upload__preview">
              <i class="pi pi-paperclip" aria-hidden="true" />
            </div>
            <div class="resident-file-upload__body">
              <div class="resident-file-upload__header">
                <strong>{{ paymentEditPayment.proof_file_path ? 'Payment proof uploaded' : 'Upload payment proof' }}</strong>
              </div>
              <span class="muted-line">
                PDF, Excel, PNG, JPG, JPEG, or WebP up to 10 MB. The proof file uploads immediately after selection.
              </span>
            </div>
          </div>
        </section>

        <section class="admin-form-section">
          <div class="admin-form-section__header">
            <div>
              <p class="eyebrow">Mode and reference</p>
              <h2>{{ paymentEditForm.mode }}</h2>
            </div>
          </div>
          <div class="admin-form-grid">
            <label>
              <span class="field-label">Mode <span class="required-marker">*</span></span>
              <Select
                v-model="paymentEditForm.mode"
                :options="editablePaymentModes"
                option-label="label"
                option-value="value"
                required
                :invalid="Boolean(paymentEditFieldError('mode'))"
              />
              <small v-if="paymentEditFieldError('mode')" class="field-error">{{ paymentEditFieldError('mode') }}</small>
            </label>
            <label v-if="paymentEditForm.mode === 'BANK_TRANSFER'">
              <span class="field-label">Transfer kind <span class="required-marker">*</span></span>
              <Select
                v-model="paymentEditForm.transferKind"
                :options="transferKinds"
                option-label="label"
                option-value="value"
                required
                :invalid="Boolean(paymentEditFieldError('transferKind'))"
              />
              <small v-if="paymentEditFieldError('transferKind')" class="field-error">{{ paymentEditFieldError('transferKind') }}</small>
            </label>
            <label v-if="paymentEditNeedsReference">
              <span class="field-label">UTR / reference <span class="required-marker">*</span></span>
              <InputText v-model="paymentEditForm.utrReference" :invalid="Boolean(paymentEditFieldError('reference'))" />
            </label>
            <label v-if="paymentEditNeedsReference">
              <span class="field-label">Bank reference</span>
              <InputText v-model="paymentEditForm.bankReference" :invalid="Boolean(paymentEditFieldError('reference'))" />
              <small v-if="paymentEditFieldError('reference')" class="field-error">{{ paymentEditFieldError('reference') }}</small>
            </label>
            <label v-if="paymentEditNeedsCheque">
              <span class="field-label">Cheque number <span class="required-marker">*</span></span>
              <InputText v-model="paymentEditForm.chequeNumber" required :invalid="Boolean(paymentEditFieldError('chequeNumber'))" />
              <small v-if="paymentEditFieldError('chequeNumber')" class="field-error">{{ paymentEditFieldError('chequeNumber') }}</small>
            </label>
            <label v-if="paymentEditNeedsCheque">
              <span class="field-label">Cheque date <span class="required-marker">*</span></span>
              <InputText v-model="paymentEditForm.chequeDate" type="date" required :invalid="Boolean(paymentEditFieldError('chequeDate'))" />
              <small v-if="paymentEditFieldError('chequeDate')" class="field-error">{{ paymentEditFieldError('chequeDate') }}</small>
            </label>
            <label v-if="paymentEditNeedsCheque" class="admin-form-grid__full">
              <span class="field-label">Cheque bank <span class="required-marker">*</span></span>
              <InputText v-model="paymentEditForm.bankName" required :invalid="Boolean(paymentEditFieldError('bankName'))" />
              <small v-if="paymentEditFieldError('bankName')" class="field-error">{{ paymentEditFieldError('bankName') }}</small>
            </label>
            <label v-if="paymentEditNeedsReference" class="admin-toggle-card">
              <span>Allow duplicate reference</span>
              <Checkbox v-model="paymentEditForm.allowDuplicateUtr" binary />
              <small class="field-help">
                Enable only when this UTR/reference is intentionally shared with another approved payment record, such as a correction or split entry. Leave it off to block accidental duplicates.
              </small>
            </label>
            <label v-if="paymentEditForm.allowDuplicateUtr" class="admin-form-grid__full">
              <span class="field-label">Override reason <span class="required-marker">*</span></span>
              <Textarea v-model="paymentEditForm.overrideReason" rows="2" auto-resize required :invalid="Boolean(paymentEditFieldError('overrideReason'))" />
              <small class="field-help">
                Required for audit history. Mention who approved the duplicate reference and why this payment should still be saved.
              </small>
              <small v-if="paymentEditFieldError('overrideReason')" class="field-error">{{ paymentEditFieldError('overrideReason') }}</small>
            </label>
          </div>
        </section>

        <section class="admin-form-section">
          <div class="admin-form-section__header">
            <div>
              <p class="eyebrow">Allocation</p>
              <h2>{{ paymentEditForm.allocationMode }}</h2>
            </div>
          </div>
          <div class="admin-form-grid">
            <label>
              <span class="field-label">Allocation mode <span class="required-marker">*</span></span>
              <Select
                v-model="paymentEditForm.allocationMode"
                :options="allocationModes"
                option-label="label"
                option-value="value"
              />
            </label>
            <label v-if="paymentEditForm.allocationMode === 'TENURE_PACK'">
              <span class="field-label">Tenure months <span class="required-marker">*</span></span>
              <InputText v-model="paymentEditForm.tenureMonths" inputmode="numeric" :invalid="Boolean(paymentEditFieldError('tenureMonths'))" />
              <small v-if="paymentEditFieldError('tenureMonths')" class="field-error">{{ paymentEditFieldError('tenureMonths') }}</small>
            </label>
            <label v-if="paymentEditForm.allocationMode === 'SELECTED_PERIODS'" class="admin-form-grid__full">
              <span class="field-label">Selected periods <span class="required-marker">*</span></span>
              <MultiSelect
                v-model="paymentEditForm.selectedDueIds"
                :options="paymentEditDueOptions"
                option-label="label"
                option-value="value"
                display="chip"
                filter
                :invalid="Boolean(paymentEditFieldError('selectedDueIds'))"
              />
              <small v-if="paymentEditFieldError('selectedDueIds')" class="field-error">{{ paymentEditFieldError('selectedDueIds') }}</small>
            </label>
            <label class="admin-form-grid__full">
              <span class="field-label">Notes</span>
              <Textarea v-model="paymentEditForm.notes" rows="3" auto-resize />
            </label>
          </div>

          <AppDataTable
            v-if="paymentEditPayment.allocations.length > 0"
            :value="paymentEditPayment.allocations"
            responsive-layout="scroll"
          >
            <Column field="billingPeriodLabel" header="Current period" />
            <Column field="allocatedAmount" header="Allocated">
              <template #body="{ data: row }">{{ formatMoney(row.allocatedAmount) }}</template>
            </Column>
            <Column field="remainingBalance" header="Balance">
              <template #body="{ data: row }">{{ formatMoney(row.remainingBalance) }}</template>
            </Column>
          </AppDataTable>
        </section>

        <div class="admin-form-actions">
          <Button type="button" label="Cancel" severity="secondary" outlined @click="paymentEditVisible = false" />
          <Button
            type="submit"
            label="Save payment"
            icon="pi pi-check"
            :loading="paymentEditSaving"
            :disabled="paymentEditSaving || paymentEditLoading"
          />
        </div>
      </form>
    </Dialog>
  </div>
</template>
