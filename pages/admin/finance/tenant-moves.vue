<script setup lang="ts">
import type { BankAccount } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Tenant Move In / Out',
})

type TenantMoveStatus =
  | 'OCCUPIED'
  | 'MOVE_OUT_REQUESTED'
  | 'REFUND_PENDING'
  | 'CLOSED'
  | 'CANCELLED'

type TenantMoveItem = {
  id: string
  flatResidentId: string
  tenantUserId: string
  tenantName: string
  tenantMobileNumber: string
  flatId: string
  flatLabel: string
  status: TenantMoveStatus
  moveInDate: string
  expectedMoveOutDate: string | null
  actualMoveOutDate: string | null
  expectedDepositAmount: number
  receivedAmount: number
  damageDeductionAmount: number
  penaltyDeductionAmount: number
  refundedAmount: number
  heldAmount: number
  refundableAmount: number
  settlementDate: string | null
  settlementVoucherNumber: string | null
  notes: string | null
}

type TenantMoveDetail = TenantMoveItem & {
  tenantEmail: string | null
  closedAt: string | null
  receipts: Array<{
    id: string
    receiptDate: string
    receiptNumber: string
    amount: number
    mode: string
    referenceNumber: string | null
    notes: string | null
    bankAccountName: string
    journalId: string | null
    voucherNumber: string | null
  }>
  inspection: null | {
    id: string
    inspectionDate: string
    conditionRating: 'GOOD' | 'DAMAGE_FOUND'
    conditionSummary: string
    checklist: Record<string, boolean>
    inspectedByName: string | null
    updatedAt: string
  }
  deductions: Array<{
    id: string
    deductionType: 'DAMAGE' | 'PENALTY'
    amount: number
    description: string
  }>
  settlement: null | {
    id: string
    settlementDate: string
    receivedAmount: number
    damageDeductionAmount: number
    penaltyDeductionAmount: number
    refundAmount: number
    refundMode: string | null
    referenceNumber: string | null
    bankAccountName: string | null
    approvedByName: string | null
    voucherNumber: string | null
    incomeTransactionId: string | null
  }
  attachments: Array<{
    id: string
    attachmentType: string
    fileName: string
    mimeType: string
    sizeBytes: number
    createdAt: string
    downloadUrl: string
  }>
}

type TenantRelationshipOption = {
  flatResidentId: string
  tenantUserId: string
  tenantName: string
  flatId: string
  flatLabel: string
  leaseStartDate: string | null
  leaseEndDate: string | null
}

type DeductionDraft = {
  id?: string
  deductionType: 'DAMAGE' | 'PENALTY'
  amount: number
  description: string
}

const api = useApi()
const toast = useToast()
const route = useRoute()
const authStore = useAuthStore()
const { formatMoney, formatDate, formatDateTime } = useFinanceFormatters()
const today = () => new Date().toISOString().slice(0, 10)

const canManage = computed(
  () => authStore.me?.user.permissions.includes('finance.manage') ?? false,
)
const search = ref('')
const status = ref('')
const page = ref(1)
const pageSize = ref(20)

const statusOptions = [
  { label: 'All statuses', value: '' },
  { label: 'Occupied', value: 'OCCUPIED' },
  { label: 'Refund pending', value: 'REFUND_PENDING' },
  { label: 'Closed', value: 'CLOSED' },
  { label: 'Cancelled', value: 'CANCELLED' },
]
const paymentModeOptions = [
  { label: 'Cash', value: 'CASH' },
  { label: 'Bank transfer', value: 'BANK_TRANSFER' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Cheque', value: 'CHEQUE' },
  { label: 'Card', value: 'CARD' },
  { label: 'Other', value: 'OTHER' },
]
const conditionOptions = [
  { label: 'Good — full refund', value: 'GOOD' },
  { label: 'Damage or penalty found', value: 'DAMAGE_FOUND' },
]
const deductionTypeOptions = [
  { label: 'Property damage', value: 'DAMAGE' },
  { label: 'Policy penalty', value: 'PENALTY' },
]
const attachmentTypeOptions = [
  { label: 'Move-in condition', value: 'MOVE_IN' },
  { label: 'Inspection evidence', value: 'INSPECTION' },
  { label: 'Damage evidence', value: 'DAMAGE' },
  { label: 'Refund proof', value: 'REFUND' },
]

const query = computed(() => ({
  page: page.value,
  pageSize: pageSize.value,
  search: search.value,
  status: status.value,
}))

const [movesAsync, optionsAsync, banksAsync] = await Promise.all([
  useAsyncData(
    'admin-tenant-moves',
    () =>
      api<{
        ok: true
        data: {
          items: TenantMoveItem[]
          total: number
          page: number
          pageSize: number
          summary: {
            totalCases: number
            occupiedCases: number
            pendingRefundCases: number
            closedCases: number
            totalHeld: number
            totalReceived: number
            totalDeductions: number
            totalRefunded: number
          }
        }
      }>('/api/admin/finance/tenant-moves', { query: query.value }),
    { watch: [query] },
  ),
  useAsyncData('admin-tenant-move-options', () =>
    api<{
      ok: true
      data: { tenantRelationships: TenantRelationshipOption[] }
    }>('/api/admin/finance/tenant-moves/options'),
  ),
  useAsyncData('admin-tenant-move-bank-options', () =>
    api<{ ok: true; data: { items: BankAccount[] } }>(
      '/api/admin/finance/bank-accounts',
      { query: { isActive: 'true' } },
    ),
  ),
])

const { data, pending, refresh } = movesAsync
const { data: optionsData, refresh: refreshOptions } = optionsAsync
const { data: banksData } = banksAsync
const moves = computed(() => data.value?.data.items ?? [])
const total = computed(() => data.value?.data.total ?? 0)
const summary = computed(
  () =>
    data.value?.data.summary ?? {
      totalCases: 0,
      occupiedCases: 0,
      pendingRefundCases: 0,
      closedCases: 0,
      totalHeld: 0,
      totalReceived: 0,
      totalDeductions: 0,
      totalRefunded: 0,
    },
)
const tenantRelationships = computed(
  () => optionsData.value?.data.tenantRelationships ?? [],
)
const tenantRelationshipOptions = computed(() =>
  tenantRelationships.value.map((item) => ({
    label: `${item.flatLabel} · ${item.tenantName}${item.leaseEndDate ? ` · lease to ${formatDate(item.leaseEndDate)}` : ''}`,
    value: item.flatResidentId,
  })),
)
const bankOptions = computed(() =>
  (banksData.value?.data.items ?? [])
    .filter((item) => item.isActive)
    .map((item) => ({
      label: `${item.accountName} (${item.accountNumberMasked})`,
      value: item.id,
    })),
)

const statusLabel = (value: string) => value.replaceAll('_', ' ')
const statusSeverity = (value: string) => {
  if (value === 'CLOSED') return 'success'
  if (value === 'REFUND_PENDING') return 'warn'
  if (value === 'CANCELLED') return 'danger'
  return 'info'
}
const referenceIsRequired = (mode: string | null | undefined) =>
  ['BANK_TRANSFER', 'UPI', 'CHEQUE', 'CARD'].includes(mode ?? '')
const formatFileSize = (value: number) =>
  value >= 1024 * 1024
    ? `${(value / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(value / 1024))} KB`

const createDialog = ref(false)
const createSaving = ref(false)
const createForm = reactive({
  flatResidentId: '',
  moveInDate: today(),
  expectedMoveOutDate: null as string | null,
  expectedDepositAmount: 0,
  notes: '',
})

const openCreate = (flatResidentId?: string) => {
  createForm.flatResidentId =
    flatResidentId ?? tenantRelationshipOptions.value[0]?.value ?? ''
  const selected = tenantRelationships.value.find(
    (item) => item.flatResidentId === createForm.flatResidentId,
  )
  createForm.moveInDate = selected?.leaseStartDate ?? today()
  createForm.expectedMoveOutDate = selected?.leaseEndDate ?? null
  createForm.expectedDepositAmount = 0
  createForm.notes = ''
  createDialog.value = true
}

watch(
  () => createForm.flatResidentId,
  (flatResidentId) => {
    const selected = tenantRelationships.value.find(
      (item) => item.flatResidentId === flatResidentId,
    )
    if (!selected) return
    createForm.moveInDate = selected.leaseStartDate ?? createForm.moveInDate
    createForm.expectedMoveOutDate = selected.leaseEndDate
  },
)

const selectedCaseId = ref<string | null>(null)
const detailDialog = ref(false)
const detailLoading = ref(false)
const detail = ref<TenantMoveDetail | null>(null)

const loadDetail = async (id: string) => {
  detailLoading.value = true
  try {
    const response = await api<{ ok: true; data: TenantMoveDetail }>(
      `/api/admin/finance/tenant-moves/${id}`,
    )
    detail.value = response.data
  } finally {
    detailLoading.value = false
  }
}

const openDetail = async (item: TenantMoveItem | string) => {
  const id = typeof item === 'string' ? item : item.id
  selectedCaseId.value = id
  detailDialog.value = true
  await loadDetail(id)
}

const refreshAll = async () => {
  await Promise.all([refresh(), refreshOptions()])
  if (selectedCaseId.value && detailDialog.value) {
    await loadDetail(selectedCaseId.value)
  }
}

const submitCreate = async () => {
  createSaving.value = true
  try {
    const response = await api<{ ok: true; data: { id: string } }>(
      '/api/admin/finance/tenant-moves',
      { method: 'POST', body: { ...createForm } },
    )
    createDialog.value = false
    await refreshAll()
    toast.add({
      severity: 'success',
      summary: 'Move-in recorded',
      detail: 'Tenant occupancy and expected security deposit are now tracked.',
      life: 10000,
    })
    await openDetail(response.data.id)
  } finally {
    createSaving.value = false
  }
}

const receiptDialog = ref(false)
const receiptSaving = ref(false)
const receiptForm = reactive({
  receiptDate: today(),
  amount: 0,
  bankAccountId: '',
  mode: 'BANK_TRANSFER',
  referenceNumber: '',
  notes: '',
})

const openReceipt = () => {
  const remainingExpected = Math.max(
    0,
    Number(detail.value?.expectedDepositAmount ?? 0) -
      Number(detail.value?.receivedAmount ?? 0),
  )
  receiptForm.receiptDate = today()
  receiptForm.amount = remainingExpected
  receiptForm.bankAccountId = bankOptions.value[0]?.value ?? ''
  receiptForm.mode = 'BANK_TRANSFER'
  receiptForm.referenceNumber = ''
  receiptForm.notes = ''
  receiptDialog.value = true
}

const submitReceipt = async () => {
  if (!selectedCaseId.value) return
  receiptSaving.value = true
  try {
    await api(
      `/api/admin/finance/tenant-moves/${selectedCaseId.value}/receipts`,
      {
        method: 'POST',
        body: { ...receiptForm },
      },
    )
    receiptDialog.value = false
    await refreshAll()
    toast.add({
      severity: 'success',
      summary: 'Deposit received',
      detail: 'The receipt and balanced liability journal were posted.',
      life: 10000,
    })
  } finally {
    receiptSaving.value = false
  }
}

const inspectionDialog = ref(false)
const inspectionSaving = ref(false)
const inspectionForm = reactive({
  actualMoveOutDate: today(),
  inspectionDate: today(),
  conditionRating: 'GOOD' as 'GOOD' | 'DAMAGE_FOUND',
  conditionSummary: '',
  checklist: {
    keysReturned: false,
    propertyCleared: false,
    commonAreasChecked: false,
    outstandingItemsReviewed: false,
  },
  deductions: [] as DeductionDraft[],
})

const openInspection = () => {
  const current = detail.value
  inspectionForm.actualMoveOutDate = current?.actualMoveOutDate ?? today()
  inspectionForm.inspectionDate = current?.inspection?.inspectionDate ?? today()
  inspectionForm.conditionRating =
    current?.inspection?.conditionRating ?? 'GOOD'
  inspectionForm.conditionSummary = current?.inspection?.conditionSummary ?? ''
  inspectionForm.checklist = {
    keysReturned: Boolean(current?.inspection?.checklist.keysReturned),
    propertyCleared: Boolean(current?.inspection?.checklist.propertyCleared),
    commonAreasChecked: Boolean(
      current?.inspection?.checklist.commonAreasChecked,
    ),
    outstandingItemsReviewed: Boolean(
      current?.inspection?.checklist.outstandingItemsReviewed,
    ),
  }
  inspectionForm.deductions = (current?.deductions ?? []).map((item) => ({
    id: item.id,
    deductionType: item.deductionType,
    amount: item.amount,
    description: item.description,
  }))
  inspectionDialog.value = true
}

const addDeduction = () => {
  inspectionForm.conditionRating = 'DAMAGE_FOUND'
  inspectionForm.deductions.push({
    deductionType: 'DAMAGE',
    amount: 0,
    description: '',
  })
}
const removeDeduction = (index: number) => {
  inspectionForm.deductions.splice(index, 1)
  if (inspectionForm.deductions.length === 0) {
    inspectionForm.conditionRating = 'GOOD'
  }
}
const draftDeductionTotal = computed(() =>
  inspectionForm.deductions.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  ),
)

watch(
  () => inspectionForm.conditionRating,
  (value) => {
    if (value === 'GOOD') inspectionForm.deductions = []
  },
)

const submitInspection = async () => {
  if (!selectedCaseId.value) return
  inspectionSaving.value = true
  try {
    await api(
      `/api/admin/finance/tenant-moves/${selectedCaseId.value}/move-out`,
      {
        method: 'POST',
        body: {
          ...inspectionForm,
          checklist: { ...inspectionForm.checklist },
          deductions: inspectionForm.deductions.map((item) => ({ ...item })),
        },
      },
    )
    inspectionDialog.value = false
    await refreshAll()
    toast.add({
      severity: 'success',
      summary: 'Inspection saved',
      detail:
        'Tenant occupancy and access were closed; the server recalculated the tentative refund.',
      life: 10000,
    })
  } finally {
    inspectionSaving.value = false
  }
}

const settlementDialog = ref(false)
const settlementSaving = ref(false)
const settlementForm = reactive({
  settlementDate: today(),
  bankAccountId: null as string | null,
  refundMode: null as string | null,
  referenceNumber: '',
  notes: '',
})

const openSettlement = () => {
  const refundDue = Number(detail.value?.refundableAmount ?? 0)
  settlementForm.settlementDate = today()
  settlementForm.bankAccountId =
    refundDue > 0 ? (bankOptions.value[0]?.value ?? null) : null
  settlementForm.refundMode = refundDue > 0 ? 'BANK_TRANSFER' : null
  settlementForm.referenceNumber = ''
  settlementForm.notes = ''
  settlementDialog.value = true
}

const submitSettlement = async () => {
  if (!selectedCaseId.value) return
  settlementSaving.value = true
  try {
    const response = await api<{
      ok: true
      data: { refundAmount: number; voucherNumber: string | null }
    }>(`/api/admin/finance/tenant-moves/${selectedCaseId.value}/settle`, {
      method: 'POST',
      body: { ...settlementForm },
    })
    settlementDialog.value = false
    await refreshAll()
    toast.add({
      severity: 'success',
      summary: 'Move-out settled',
      detail: `${formatMoney(response.data.refundAmount)} refunded${response.data.voucherNumber ? ` · ${response.data.voucherNumber}` : ''}. Tenant access was closed.`,
      life: 10000,
    })
  } finally {
    settlementSaving.value = false
  }
}

const attachmentType = ref('INSPECTION')
const attachmentFile = ref<File | null>(null)
const attachmentInput = ref<HTMLInputElement | null>(null)
const attachmentUploading = ref(false)
const availableAttachmentTypeOptions = computed(() =>
  detail.value?.status === 'CLOSED'
    ? attachmentTypeOptions.filter((item) => item.value === 'REFUND')
    : attachmentTypeOptions.filter((item) => item.value !== 'REFUND'),
)
const hasDeductionEvidence = computed(() =>
  (detail.value?.attachments ?? []).some((item) =>
    ['INSPECTION', 'DAMAGE'].includes(item.attachmentType),
  ),
)
watch(
  () => detail.value?.status,
  (moveStatus) => {
    attachmentType.value = moveStatus === 'CLOSED' ? 'REFUND' : 'INSPECTION'
    attachmentFile.value = null
    if (attachmentInput.value) attachmentInput.value.value = ''
  },
)
const onAttachmentSelected = (event: Event) => {
  attachmentFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
}
const uploadAttachment = async () => {
  if (!selectedCaseId.value || !attachmentFile.value) return
  attachmentUploading.value = true
  try {
    const formData = new FormData()
    formData.append('attachmentType', attachmentType.value)
    formData.append('file', attachmentFile.value)
    await api(
      `/api/admin/finance/tenant-moves/${selectedCaseId.value}/attachments`,
      { method: 'POST', body: formData },
    )
    attachmentFile.value = null
    if (attachmentInput.value) attachmentInput.value.value = ''
    await refreshAll()
    toast.add({
      severity: 'success',
      summary: 'Evidence uploaded',
      detail: 'The file is linked to this tenant move record.',
      life: 10000,
    })
  } finally {
    attachmentUploading.value = false
  }
}

const onPage = (event: { page: number; rows: number }) => {
  page.value = event.page + 1
  pageSize.value = event.rows
}

watch([search, status], () => {
  page.value = 1
})

const quickRelationshipId =
  typeof route.query.relationshipId === 'string'
    ? route.query.relationshipId
    : null
const quickCaseId =
  typeof route.query.caseId === 'string' ? route.query.caseId : null
if (quickCaseId) {
  await openDetail(quickCaseId)
}
if (
  canManage.value &&
  quickRelationshipId &&
  tenantRelationships.value.some(
    (item) => item.flatResidentId === quickRelationshipId,
  )
) {
  openCreate(quickRelationshipId)
}
</script>

<template>
  <div class="landing-page tenant-moves-page">
    <div class="surface-grid">
      <section class="surface-card">
        <p class="eyebrow">Deposits currently held</p>
        <h3>{{ formatMoney(summary.totalHeld) }}</h3>
        <p>Posted tenant security-deposit liability awaiting settlement.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Pending refunds</p>
        <h3>{{ summary.pendingRefundCases }}</h3>
        <p>Inspected move-outs waiting for finance settlement.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Refunded</p>
        <h3>{{ formatMoney(summary.totalRefunded) }}</h3>
        <p>Security deposits returned through completed settlements.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Approved deductions</p>
        <h3>{{ formatMoney(summary.totalDeductions) }}</h3>
        <p>Damage recovery and policy penalties recorded at move-out.</p>
      </section>
    </div>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Tenant move-in and move-out</h1>
          <p>
            Record occupancy, hold refundable deposits as liabilities, inspect
            condition, approve deductions, and post refunds.
          </p>
        </div>
        <div class="list-page__exports">
          <Button
            as="router-link"
            to="/admin/finance/reports?reportType=tenant-deposits"
            label="Deposit report"
            icon="pi pi-chart-bar"
            severity="secondary"
            outlined
          />
          <Button
            v-if="canManage"
            label="Record move-in"
            icon="pi pi-plus"
            :disabled="tenantRelationshipOptions.length === 0"
            @click="openCreate()"
          />
        </div>
      </header>

      <div class="admin-page-guide">
        <h2>Accounting flow</h2>
        <p>
          Receipts credit Tenant Security Deposits, not income. At move-out the
          full liability is released between the approved refund and any
          evidence-backed deduction income.
        </p>
      </div>

      <div class="list-page__toolbar">
        <label class="list-page__search">
          <span>Search tenant or flat</span>
          <InputText v-model="search" placeholder="Name, mobile, flat" />
        </label>
        <label>
          <span>Status</span>
          <Select
            v-model="status"
            :options="statusOptions"
            option-label="label"
            option-value="value"
          />
        </label>
        <Button
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          title="Refresh"
          @click="refreshAll"
        />
      </div>

      <AppDataTable
        :value="moves"
        :loading="pending"
        responsive-layout="scroll"
        class="list-page__table"
      >
        <Column header="Tenant / flat">
          <template #body="{ data: row }">
            <div class="tenant-move-primary">
              <strong>{{ row.tenantName }}</strong>
              <span>{{ row.flatLabel }} · {{ row.tenantMobileNumber }}</span>
            </div>
          </template>
        </Column>
        <Column header="Occupancy">
          <template #body="{ data: row }">
            <div class="tenant-move-primary">
              <strong>{{ formatDate(row.moveInDate) }}</strong>
              <span
                >to
                {{
                  formatDate(row.actualMoveOutDate || row.expectedMoveOutDate)
                }}</span
              >
            </div>
          </template>
        </Column>
        <Column header="Deposit">
          <template #body="{ data: row }">
            <div class="tenant-move-primary">
              <strong>{{ formatMoney(row.receivedAmount) }}</strong>
              <span>Expected {{ formatMoney(row.expectedDepositAmount) }}</span>
            </div>
          </template>
        </Column>
        <Column header="Held / refundable">
          <template #body="{ data: row }">
            <div class="tenant-move-primary">
              <strong>{{ formatMoney(row.heldAmount) }} held</strong>
              <span>{{ formatMoney(row.refundableAmount) }} refundable</span>
            </div>
          </template>
        </Column>
        <Column header="Status">
          <template #body="{ data: row }">
            <Tag
              :value="statusLabel(row.status)"
              :severity="statusSeverity(row.status)"
            />
          </template>
        </Column>
        <Column header="Actions">
          <template #body="{ data: row }">
            <Button
              label="Open"
              icon="pi pi-arrow-right"
              size="small"
              severity="secondary"
              outlined
              @click="openDetail(row)"
            />
          </template>
        </Column>
      </AppDataTable>
      <Paginator
        v-if="total > pageSize"
        :first="(page - 1) * pageSize"
        :rows="pageSize"
        :total-records="total"
        :rows-per-page-options="[10, 20, 50, 100]"
        @page="onPage"
      />
    </section>

    <Dialog
      v-model:visible="createDialog"
      modal
      header="Record tenant move-in"
      :style="{ width: '42rem' }"
    >
      <form class="admin-form-grid" @submit.prevent="submitCreate">
        <label class="admin-form-field admin-form-field--wide">
          <span>Tenant relationship</span>
          <Select
            v-model="createForm.flatResidentId"
            :options="tenantRelationshipOptions"
            option-label="label"
            option-value="value"
            filter
            required
          />
        </label>
        <label class="admin-form-field">
          <span>Move-in date</span>
          <InputText v-model="createForm.moveInDate" type="date" required />
        </label>
        <label class="admin-form-field">
          <span>Expected move-out</span>
          <InputText v-model="createForm.expectedMoveOutDate" type="date" />
        </label>
        <label class="admin-form-field admin-form-field--wide">
          <span>Refundable security deposit expected</span>
          <InputNumber
            v-model="createForm.expectedDepositAmount"
            mode="currency"
            currency="INR"
            locale="en-IN"
            :min="0"
            :max-fraction-digits="2"
          />
        </label>
        <label class="admin-form-field admin-form-field--wide">
          <span>Notes</span>
          <Textarea v-model="createForm.notes" rows="3" maxlength="1000" />
        </label>
        <div class="admin-dialog-actions admin-form-field--wide">
          <Button
            label="Cancel"
            severity="secondary"
            text
            @click="createDialog = false"
          />
          <Button
            type="submit"
            label="Record move-in"
            icon="pi pi-check"
            :loading="createSaving"
          />
        </div>
      </form>
    </Dialog>

    <Dialog
      v-model:visible="detailDialog"
      modal
      :header="
        detail
          ? `${detail.tenantName} · ${detail.flatLabel}`
          : 'Tenant move record'
      "
      :style="{ width: 'min(76rem, 96vw)' }"
    >
      <AppState
        v-if="detailLoading"
        title="Loading move record"
        message="Retrieving deposit, inspection, and journal details."
        icon="pi pi-spin pi-spinner"
      />
      <div v-else-if="detail" class="tenant-move-detail">
        <div class="tenant-move-detail__header">
          <div>
            <Tag
              :value="statusLabel(detail.status)"
              :severity="statusSeverity(detail.status)"
            />
            <p>
              Move-in {{ formatDate(detail.moveInDate) }}
              <template v-if="detail.actualMoveOutDate">
                · Move-out {{ formatDate(detail.actualMoveOutDate) }}</template
              >
            </p>
          </div>
          <div
            v-if="
              canManage &&
              detail.status !== 'CLOSED' &&
              detail.status !== 'CANCELLED'
            "
            class="list-page__exports"
          >
            <Button
              label="Receive deposit"
              icon="pi pi-wallet"
              severity="secondary"
              outlined
              @click="openReceipt"
            />
            <Button
              label="Move-out inspection"
              icon="pi pi-clipboard"
              severity="secondary"
              outlined
              @click="openInspection"
            />
            <Button
              v-if="detail.status === 'REFUND_PENDING'"
              label="Settle and close"
              icon="pi pi-check-circle"
              @click="openSettlement"
            />
          </div>
        </div>

        <div class="surface-grid tenant-move-detail__metrics">
          <section class="surface-card">
            <span>Expected</span>
            <strong>{{ formatMoney(detail.expectedDepositAmount) }}</strong>
          </section>
          <section class="surface-card">
            <span>Received</span>
            <strong>{{ formatMoney(detail.receivedAmount) }}</strong>
          </section>
          <section class="surface-card">
            <span>Deductions</span>
            <strong>{{
              formatMoney(
                detail.damageDeductionAmount + detail.penaltyDeductionAmount,
              )
            }}</strong>
          </section>
          <section class="surface-card">
            <span>{{
              detail.status === 'CLOSED' ? 'Refunded' : 'Refund due'
            }}</span>
            <strong>{{
              formatMoney(
                detail.status === 'CLOSED'
                  ? detail.refundedAmount
                  : detail.refundableAmount,
              )
            }}</strong>
          </section>
        </div>

        <section class="tenant-move-panel">
          <div class="tenant-move-panel__header">
            <div>
              <p class="eyebrow">Deposit ledger</p>
              <h3>Receipts</h3>
            </div>
          </div>
          <AppState
            v-if="detail.receipts.length === 0"
            title="No deposit received"
            message="Record each payment only when funds reach a society bank or cash account."
            icon="pi pi-wallet"
          />
          <AppDataTable
            v-else
            :value="detail.receipts"
            responsive-layout="scroll"
          >
            <Column field="receiptNumber" header="Receipt" />
            <Column header="Date"
              ><template #body="{ data: row }">{{
                formatDate(row.receiptDate)
              }}</template></Column
            >
            <Column field="bankAccountName" header="Account" />
            <Column field="mode" header="Mode" />
            <Column field="referenceNumber" header="Reference" />
            <Column field="voucherNumber" header="Journal" />
            <Column header="Amount"
              ><template #body="{ data: row }">{{
                formatMoney(row.amount)
              }}</template></Column
            >
          </AppDataTable>
        </section>

        <section class="tenant-move-panel">
          <div class="tenant-move-panel__header">
            <div>
              <p class="eyebrow">Condition</p>
              <h3>Move-out inspection and deductions</h3>
            </div>
          </div>
          <AppState
            v-if="!detail.inspection"
            title="Inspection not recorded"
            message="Record the condition before calculating any refund."
            icon="pi pi-clipboard"
          />
          <div v-else class="tenant-inspection-summary">
            <div>
              <Tag
                :value="detail.inspection.conditionRating.replaceAll('_', ' ')"
                :severity="
                  detail.inspection.conditionRating === 'GOOD'
                    ? 'success'
                    : 'warn'
                "
              />
              <strong>{{
                formatDate(detail.inspection.inspectionDate)
              }}</strong>
            </div>
            <p>{{ detail.inspection.conditionSummary }}</p>
          </div>
          <AppDataTable
            v-if="detail.deductions.length"
            :value="detail.deductions"
            responsive-layout="scroll"
          >
            <Column field="deductionType" header="Type" />
            <Column field="description" header="Reason" />
            <Column header="Amount"
              ><template #body="{ data: row }">{{
                formatMoney(row.amount)
              }}</template></Column
            >
          </AppDataTable>
        </section>

        <section class="tenant-move-panel">
          <div class="tenant-move-panel__header">
            <div>
              <p class="eyebrow">Evidence</p>
              <h3>Condition documents and refund proof</h3>
            </div>
          </div>
          <div
            v-if="canManage && detail.status !== 'CANCELLED'"
            class="tenant-attachment-upload"
          >
            <Select
              v-model="attachmentType"
              :options="availableAttachmentTypeOptions"
              option-label="label"
              option-value="value"
            />
            <input
              ref="attachmentInput"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              @change="onAttachmentSelected"
            >
            <Button
              label="Upload"
              icon="pi pi-upload"
              :disabled="!attachmentFile"
              :loading="attachmentUploading"
              @click="uploadAttachment"
            />
          </div>
          <div v-if="detail.attachments.length" class="tenant-attachment-list">
            <a
              v-for="attachment in detail.attachments"
              :key="attachment.id"
              :href="attachment.downloadUrl"
              target="_blank"
              rel="noopener"
              class="tenant-attachment-card"
            >
              <i class="pi pi-paperclip" />
              <span
                ><strong>{{ attachment.fileName }}</strong
                ><small
                  >{{ attachment.attachmentType }} ·
                  {{ formatFileSize(attachment.sizeBytes) }} ·
                  {{ formatDateTime(attachment.createdAt) }}</small
                ></span
              >
            </a>
          </div>
          <p v-else class="table-muted">No evidence files uploaded.</p>
        </section>

        <section
          v-if="detail.settlement"
          class="tenant-move-panel tenant-move-panel--settled"
        >
          <div class="tenant-move-panel__header">
            <div>
              <p class="eyebrow">Final settlement</p>
              <h3>
                {{ detail.settlement.voucherNumber || 'No-money settlement' }}
              </h3>
            </div>
            <Tag value="POSTED" severity="success" />
          </div>
          <div class="tenant-settlement-grid">
            <span
              >Date
              <strong>{{
                formatDate(detail.settlement.settlementDate)
              }}</strong></span
            >
            <span
              >Deposit
              <strong>{{
                formatMoney(detail.settlement.receivedAmount)
              }}</strong></span
            >
            <span
              >Deductions
              <strong>{{
                formatMoney(
                  detail.settlement.damageDeductionAmount +
                    detail.settlement.penaltyDeductionAmount,
                )
              }}</strong></span
            >
            <span
              >Refund
              <strong>{{
                formatMoney(detail.settlement.refundAmount)
              }}</strong></span
            >
            <span
              >Account
              <strong>{{
                detail.settlement.bankAccountName || '-'
              }}</strong></span
            >
            <span
              >Reference
              <strong>{{
                detail.settlement.referenceNumber || '-'
              }}</strong></span
            >
          </div>
        </section>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="receiptDialog"
      modal
      header="Receive tenant security deposit"
      :style="{ width: '40rem' }"
    >
      <form class="admin-form-grid" @submit.prevent="submitReceipt">
        <label class="admin-form-field"
          ><span>Date received</span
          ><InputText v-model="receiptForm.receiptDate" type="date" required
        /></label>
        <label class="admin-form-field"
          ><span>Amount</span
          ><InputNumber
            v-model="receiptForm.amount"
            mode="currency"
            currency="INR"
            locale="en-IN"
            :min="0.01"
            :max-fraction-digits="2"
            required
        /></label>
        <label class="admin-form-field"
          ><span>Deposit account</span
          ><Select
            v-model="receiptForm.bankAccountId"
            :options="bankOptions"
            option-label="label"
            option-value="value"
            required
        /></label>
        <label class="admin-form-field"
          ><span>Payment mode</span
          ><Select
            v-model="receiptForm.mode"
            :options="paymentModeOptions"
            option-label="label"
            option-value="value"
            required
        /></label>
        <label class="admin-form-field admin-form-field--wide"
          ><span
            >Reference
            {{
              referenceIsRequired(receiptForm.mode) ? '(required)' : ''
            }}</span
          ><InputText
            v-model="receiptForm.referenceNumber"
            :required="referenceIsRequired(receiptForm.mode)"
        /></label>
        <label class="admin-form-field admin-form-field--wide"
          ><span>Notes</span
          ><Textarea v-model="receiptForm.notes" rows="3" maxlength="1000"
        /></label>
        <div class="admin-dialog-actions admin-form-field--wide">
          <Button
            label="Cancel"
            severity="secondary"
            text
            @click="receiptDialog = false"
          />
          <Button
            type="submit"
            label="Post deposit receipt"
            icon="pi pi-check"
            :loading="receiptSaving"
          />
        </div>
      </form>
    </Dialog>

    <Dialog
      v-model:visible="inspectionDialog"
      modal
      header="Move-out condition inspection"
      :style="{ width: 'min(64rem, 96vw)' }"
    >
      <form class="admin-form-grid" @submit.prevent="submitInspection">
        <label class="admin-form-field"
          ><span>Actual move-out date</span
          ><InputText
            v-model="inspectionForm.actualMoveOutDate"
            type="date"
            required
        /></label>
        <label class="admin-form-field"
          ><span>Inspection date</span
          ><InputText
            v-model="inspectionForm.inspectionDate"
            type="date"
            required
        /></label>
        <label class="admin-form-field admin-form-field--wide"
          ><span>Condition</span
          ><Select
            v-model="inspectionForm.conditionRating"
            :options="conditionOptions"
            option-label="label"
            option-value="value"
        /></label>
        <fieldset class="tenant-checklist admin-form-field--wide">
          <legend>Exit checklist</legend>
          <label
            ><Checkbox v-model="inspectionForm.checklist.keysReturned" binary />
            Keys/access devices returned</label
          >
          <label
            ><Checkbox
              v-model="inspectionForm.checklist.propertyCleared"
              binary
            />
            Property cleared</label
          >
          <label
            ><Checkbox
              v-model="inspectionForm.checklist.commonAreasChecked"
              binary
            />
            Common areas checked</label
          >
          <label
            ><Checkbox
              v-model="inspectionForm.checklist.outstandingItemsReviewed"
              binary
            />
            Outstanding items reviewed</label
          >
        </fieldset>
        <label class="admin-form-field admin-form-field--wide"
          ><span>Condition summary</span
          ><Textarea
            v-model="inspectionForm.conditionSummary"
            rows="4"
            maxlength="2000"
            required
        /></label>

        <Message
          severity="warn"
          :closable="false"
          class="admin-form-field--wide"
        >
          Saving the actual move-out immediately ends this tenant relationship
          and revokes its access. Verify the dates before continuing.
        </Message>

        <div class="admin-form-field--wide tenant-deductions-editor">
          <div class="tenant-move-panel__header">
            <div>
              <h3>Deductions</h3>
              <p>
                Each deduction needs a clear reason and inspection/damage
                evidence before settlement.
              </p>
            </div>
            <Button
              type="button"
              label="Add deduction"
              icon="pi pi-plus"
              severity="secondary"
              outlined
              @click="addDeduction"
            />
          </div>
          <div
            v-for="(deduction, index) in inspectionForm.deductions"
            :key="deduction.id || index"
            class="tenant-deduction-row"
          >
            <Select
              v-model="deduction.deductionType"
              :options="deductionTypeOptions"
              option-label="label"
              option-value="value"
            />
            <InputNumber
              v-model="deduction.amount"
              mode="currency"
              currency="INR"
              locale="en-IN"
              :min="0.01"
              :max-fraction-digits="2"
            />
            <InputText
              v-model="deduction.description"
              placeholder="Damage or penalty reason"
              maxlength="500"
            />
            <Button
              type="button"
              icon="pi pi-trash"
              severity="danger"
              text
              title="Remove deduction"
              @click="removeDeduction(index)"
            />
          </div>
          <p v-if="inspectionForm.deductions.length === 0" class="table-muted">
            No deductions — the server will calculate a full refund.
          </p>
          <strong v-else
            >Total deductions: {{ formatMoney(draftDeductionTotal) }}</strong
          >
        </div>

        <div class="admin-dialog-actions admin-form-field--wide">
          <Button
            label="Cancel"
            severity="secondary"
            text
            @click="inspectionDialog = false"
          />
          <Button
            type="submit"
            label="Save inspection"
            icon="pi pi-check"
            :loading="inspectionSaving"
          />
        </div>
      </form>
    </Dialog>

    <Dialog
      v-model:visible="settlementDialog"
      modal
      header="Approve refund and close move-out"
      :style="{ width: '42rem' }"
    >
      <form class="admin-form-grid" @submit.prevent="submitSettlement">
        <div class="admin-form-field--wide tenant-settlement-preview">
          <span
            >Deposit received
            <strong>{{
              formatMoney(detail?.receivedAmount ?? 0)
            }}</strong></span
          >
          <span
            >Approved deductions
            <strong>{{
              formatMoney(
                (detail?.damageDeductionAmount ?? 0) +
                  (detail?.penaltyDeductionAmount ?? 0),
              )
            }}</strong></span
          >
          <span
            >Refund calculated by server
            <strong>{{
              formatMoney(detail?.refundableAmount ?? 0)
            }}</strong></span
          >
        </div>
        <Message
          v-if="
            (detail?.damageDeductionAmount ?? 0) +
              (detail?.penaltyDeductionAmount ?? 0) >
              0 && !hasDeductionEvidence
          "
          severity="warn"
          :closable="false"
          class="admin-form-field--wide"
        >
          Upload inspection or damage evidence before settlement.
        </Message>
        <label class="admin-form-field"
          ><span>Settlement date</span
          ><InputText
            v-model="settlementForm.settlementDate"
            type="date"
            required
        /></label>
        <template v-if="(detail?.refundableAmount ?? 0) > 0">
          <label class="admin-form-field"
            ><span>Refund account</span
            ><Select
              v-model="settlementForm.bankAccountId"
              :options="bankOptions"
              option-label="label"
              option-value="value"
              required
          /></label>
          <label class="admin-form-field"
            ><span>Refund mode</span
            ><Select
              v-model="settlementForm.refundMode"
              :options="paymentModeOptions"
              option-label="label"
              option-value="value"
              required
          /></label>
          <label class="admin-form-field"
            ><span
              >Refund reference
              {{
                referenceIsRequired(settlementForm.refundMode)
                  ? '(required)'
                  : ''
              }}</span
            ><InputText
              v-model="settlementForm.referenceNumber"
              :required="referenceIsRequired(settlementForm.refundMode)"
          /></label>
        </template>
        <label class="admin-form-field admin-form-field--wide"
          ><span>Settlement notes</span
          ><Textarea v-model="settlementForm.notes" rows="3" maxlength="1000"
        /></label>
        <Message
          severity="info"
          :closable="false"
          class="admin-form-field--wide"
        >
          Posting finalizes the move record, releases the deposit liability, and
          cannot be edited as an ordinary expense. Tenant access was already
          revoked when the actual move-out inspection was saved.
        </Message>
        <div class="admin-dialog-actions admin-form-field--wide">
          <Button
            label="Cancel"
            severity="secondary"
            text
            @click="settlementDialog = false"
          />
          <Button
            type="submit"
            label="Post settlement and close"
            icon="pi pi-check-circle"
            :loading="settlementSaving"
          />
        </div>
      </form>
    </Dialog>
  </div>
</template>

<style scoped>
.tenant-move-primary,
.tenant-move-primary span,
.tenant-move-detail,
.tenant-attachment-card span {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.tenant-move-primary span,
.tenant-attachment-card small,
.tenant-move-detail__header p,
.tenant-move-panel__header p,
.table-muted {
  color: var(--text-color-secondary);
}

.tenant-move-detail {
  gap: 1rem;
}

.tenant-move-detail__header,
.tenant-move-panel__header,
.tenant-inspection-summary > div,
.tenant-attachment-upload,
.tenant-attachment-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.tenant-move-detail__metrics .surface-card {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 1rem;
}

.tenant-move-detail__metrics strong {
  font-size: 1.2rem;
}

.tenant-move-panel {
  border: 1px solid var(--surface-border);
  border-radius: 0.9rem;
  padding: 1rem;
}

.tenant-move-panel--settled {
  background: color-mix(in srgb, var(--green-50) 55%, var(--surface-card));
}

.tenant-inspection-summary,
.tenant-deductions-editor,
.tenant-attachment-list {
  display: grid;
  gap: 0.75rem;
}

.tenant-attachment-upload {
  justify-content: flex-start;
  flex-wrap: wrap;
  margin: 0.75rem 0;
}

.tenant-attachment-card {
  justify-content: flex-start;
  padding: 0.75rem;
  border: 1px solid var(--surface-border);
  border-radius: 0.7rem;
  text-decoration: none;
  color: inherit;
}

.tenant-checklist {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  border: 1px solid var(--surface-border);
  border-radius: 0.7rem;
  padding: 1rem;
}

.tenant-checklist label {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.tenant-deduction-row {
  display: grid;
  grid-template-columns: 11rem 11rem minmax(14rem, 1fr) auto;
  gap: 0.6rem;
  align-items: center;
}

.tenant-settlement-preview,
.tenant-settlement-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.tenant-settlement-preview span,
.tenant-settlement-grid span {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.75rem;
  border-radius: 0.6rem;
  background: var(--surface-ground);
}

@media (max-width: 760px) {
  .tenant-move-detail__header,
  .tenant-move-panel__header {
    align-items: flex-start;
    flex-direction: column;
  }

  .tenant-checklist,
  .tenant-settlement-preview,
  .tenant-settlement-grid,
  .tenant-deduction-row {
    grid-template-columns: 1fr;
  }
}
</style>
