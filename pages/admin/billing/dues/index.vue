<script setup lang="ts">
import type { DataTablePageEvent } from 'primevue/datatable'
import type { StaffPermission } from '~/shared/permissions'
import type { BillingPeriod, MaintenanceDue } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Billing Dues',
})

type DueResponse = {
  ok: true
  data: {
    items: MaintenanceDue[]
    total: number
    page: number
    pageSize: number
  }
}
type PeriodResponse = { ok: true; data: { items: BillingPeriod[] } }
type BillChannel = 'PUSH' | 'EMAIL' | 'WHATSAPP' | 'IN_APP'
type NotificationQueueResponse = {
  ok: true
  data: { eligible: number; jobCount: number }
}

const api = useApi()
const toast = useToast()
const authStore = useAuthStore()
const notificationBatchSize = 500

const hasPermission = (permission: StaffPermission) =>
  authStore.me?.user.permissions.includes(permission) ?? false

const canManageBilling = computed(() => hasPermission('billing.manage'))
const canManageDues = computed(() => hasPermission('dues.manage'))

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)

const formatDate = (value: string | null | undefined) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
        dateStyle: 'medium',
      })
    : '-'

const query = reactive({
  page: 1,
  pageSize: 50,
  search: '',
  billingPeriodId: '',
  status: '',
  balance: '',
  overdue: '',
  advance: '',
  sortBy: 'flatNumber',
  sortDirection: 'asc',
})

const buildDueQuery = (overrides: Partial<typeof query> = {}) => ({
  page: overrides.page ?? query.page,
  pageSize: overrides.pageSize ?? query.pageSize,
  search: query.search || undefined,
  billingPeriodId: query.billingPeriodId || undefined,
  status: query.status || undefined,
  balance: query.balance || undefined,
  overdue: query.overdue || undefined,
  advance: query.advance || undefined,
  sortBy: query.sortBy,
  sortDirection: query.sortDirection,
})

const loadDues = () =>
  api<DueResponse>('/api/admin/billing/dues', {
    query: buildDueQuery(),
  })

const { data, pending, refresh } = await useAsyncData(
  'admin-billing-dues',
  loadDues,
  { watch: [query] },
)

const { data: periodsData } = await useAsyncData('due-period-options', () =>
  api<PeriodResponse>('/api/admin/billing/periods', {
    query: {
      page: 1,
      pageSize: 2000,
      sortBy: 'startDate',
      sortDirection: 'desc',
    },
  }),
)

const dues = computed(() => data.value?.data.items ?? [])
const totalRecords = computed(() => data.value?.data.total ?? 0)
const periodOptions = computed(() =>
  (periodsData.value?.data.items ?? []).map((period) => ({
    label: period.label,
    value: period.id,
  })),
)

const statusOptions = [
  { label: 'All statuses', value: '' },
  { label: 'Open', value: 'OPEN' },
  { label: 'Partially paid', value: 'PARTIALLY_PAID' },
  { label: 'Paid', value: 'PAID' },
  { label: 'Overdue', value: 'OVERDUE' },
  { label: 'Waived', value: 'WAIVED' },
]

const balanceOptions = [
  { label: 'All balances', value: '' },
  { label: 'Outstanding', value: 'outstanding' },
  { label: 'Paid off', value: 'paid' },
]

const overdueOptions = [
  { label: 'Any due date', value: '' },
  { label: 'Overdue only', value: 'true' },
]

const advanceOptions = [
  { label: 'All advance states', value: '' },
  { label: 'CAM advance covered', value: 'covered' },
  { label: 'Billable / partial advance', value: 'billable' },
]

const isReminderEligible = (due: MaintenanceDue) =>
  canManageDues.value &&
  due.balanceAmount > 0 &&
  !due.isCamAdvanceCovered &&
  !['PAID', 'WAIVED', 'CANCELLED'].includes(due.status)

const canSendBill = (due: MaintenanceDue) =>
  canManageDues.value &&
  !due.isAdvanceCoverageRow &&
  !due.isCamAdvanceCovered && due.status !== 'CANCELLED'

const canRecordPayment = (due: MaintenanceDue) =>
  canManageBilling.value &&
  due.balanceAmount > 0 &&
  !due.isAdvanceCoverageRow &&
  !due.isCamAdvanceCovered &&
  !['PAID', 'WAIVED', 'CANCELLED'].includes(due.status)

const canWaiveDue = (due: MaintenanceDue) =>
  canManageDues.value && !due.isAdvanceCoverageRow && !due.isCamAdvanceCovered && !['PAID', 'CANCELLED'].includes(due.status)

const getRecordPaymentRoute = (due: MaintenanceDue) => ({
  path: '/admin/payments/new',
  query: {
    flatId: due.flatId,
    dueId: due.id,
    billingPeriodId: due.billingPeriodId,
    amount: String(due.balanceAmount),
  },
})

const isCamDue = (due: MaintenanceDue) => due.billingPeriodChargeType === 'CAM'
const isCoverageRow = (due: MaintenanceDue) => Boolean(due.isAdvanceCoverageRow)
const camAdvanceAdjustmentAmount = (due: MaintenanceDue) =>
  due.chargeBreakdown.reduce((sum, item) => {
    const adjustment = Number(item.camAdvanceAdjustmentAmount ?? 0)
    return Number.isFinite(adjustment) && adjustment > 0
      ? sum + adjustment
      : sum
  }, 0)
const hasCamAdvanceAdjustment = (due: MaintenanceDue) =>
  camAdvanceAdjustmentAmount(due) > 0
const camAdvanceAdjustmentNote = (due: MaintenanceDue) =>
  due.chargeBreakdown.find((item) => item.camAdvanceNote)?.camAdvanceNote ?? null
const paymentProgressLabel = (due: MaintenanceDue) => {
  if (due.isCamAdvanceCovered) return 'Covered'

  const advanceAdjustment = camAdvanceAdjustmentAmount(due)

  if (advanceAdjustment > 0) {
    return `${formatMoney(advanceAdjustment)} advance deducted; ${paymentProgress(due)}% covered overall`
  }

  return `${paymentProgress(due)}% paid`
}

const advanceStatusKind = (due: MaintenanceDue) => {
  if (isCoverageRow(due) || due.isCamAdvanceCovered) return 'covered'
  if (hasCamAdvanceAdjustment(due)) return 'billable'
  if (isCamDue(due)) return 'billable'
  return 'not-cam'
}

const advanceStatusLabel = (due: MaintenanceDue) => {
  if (isCoverageRow(due)) return 'Coverage marker'
  if (due.isCamAdvanceCovered) return 'Covered'
  if (hasCamAdvanceAdjustment(due)) return 'Advance deducted'
  if (isCamDue(due)) return 'Billable'
  return 'Not CAM'
}

const advanceStatusDetail = (due: MaintenanceDue) => {
  if (isCoverageRow(due))
    return 'This row is a CAM coverage marker only. No bill or payment action is available.'
  if (due.isCamAdvanceCovered) {
    return `Covered ${formatDate(due.camAdvanceCoveredFrom)} to ${formatDate(due.camAdvancePaidUntil)}. Bill and reminder actions are off.`
  }
  if (hasCamAdvanceAdjustment(due)) {
    const note = camAdvanceAdjustmentNote(due)
    return `${formatMoney(camAdvanceAdjustmentAmount(due))} advance deducted${note ? ` (${note})` : ''}. Remaining due is payable.`
  }
  if (isCamDue(due)) return 'No advance coverage for this CAM period.'
  return 'Advance coverage applies only to CAM bills.'
}

const getRecordPaymentTitle = (due: MaintenanceDue) => {
  if (isCoverageRow(due))
    return 'No payment needed. This is a CAM coverage marker, not a payable due.'
  if (due.isCamAdvanceCovered) return 'No payment needed. CAM advance covers this period.'
  if (due.balanceAmount <= 0) return 'No balance pending.'
  if (['PAID', 'WAIVED', 'CANCELLED'].includes(due.status)) return 'Payment is unavailable for this status.'
  return 'Record payment'
}

const getSendBillTitle = (due: MaintenanceDue) =>
  isCoverageRow(due) || due.isCamAdvanceCovered
    ? 'Bill delivery is off because this CAM period is already covered.'
    : 'Send bill'

const getReminderTitle = (due: MaintenanceDue) => {
  if (isCoverageRow(due)) return 'Reminder is off for CAM coverage marker rows.'
  if (due.isCamAdvanceCovered) return 'Reminder is off because CAM advance covers this period.'
  if (due.balanceAmount <= 0) return 'No balance pending.'
  return `Send reminder for ${due.flatNumber || 'flat'} ${due.billingPeriodLabel || ''}`.trim()
}

const summary = computed(() => {
  const rows = dues.value
  const billRows = rows.filter((row) => !row.isAdvanceCoverageRow)
  const totalDue = billRows.reduce((sum, row) => sum + row.totalAmount, 0)
  const totalPaid = billRows.reduce((sum, row) => sum + row.paidAmount, 0)
  const totalBalance = billRows.reduce((sum, row) => sum + row.balanceAmount, 0)
  const overdue = billRows.filter((row) => row.status === 'OVERDUE').length
  const advanceCoveredRows = rows.filter((row) => row.isCamAdvanceCovered)

  return {
    totalDue,
    totalPaid,
    totalBalance,
    overdue,
    advanceCoveredCount: advanceCoveredRows.length,
    advanceCoveredBalance: advanceCoveredRows.reduce((sum, row) => sum + row.balanceAmount, 0),
    collectionPercent:
      totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0,
  }
})

const selectedReminderCount = computed(
  () => notificationSelectedDues.value.filter(isReminderEligible).length,
)
const selectedBillCount = computed(() => notificationSelectedDues.value.filter(canSendBill).length)

const hasActiveFilters = computed(
  () =>
    Boolean(query.search) ||
    Boolean(query.billingPeriodId) ||
    Boolean(query.status) ||
    Boolean(query.balance) ||
    Boolean(query.overdue) ||
    Boolean(query.advance),
)

const activePeriodLabel = computed(() => {
  if (!query.billingPeriodId) return 'All periods'
  return (
    periodOptions.value.find((period) => period.value === query.billingPeriodId)
      ?.label ?? 'Selected period'
  )
})

const topOutstandingDue = computed(
  () =>
    dues.value
      .filter((due) => due.balanceAmount > 0)
      .sort((a, b) => b.balanceAmount - a.balanceAmount)[0] ?? null,
)

const paymentProgress = (due: MaintenanceDue) =>
  {
    if (due.isCamAdvanceCovered) {
      return 100
    }

    const advanceAdjustment = camAdvanceAdjustmentAmount(due)
    const totalWithAdvance = due.totalAmount + advanceAdjustment
    const paidWithAdvance = due.paidAmount + advanceAdjustment

    return totalWithAdvance > 0
      ? Math.min(100, Math.round((paidWithAdvance / totalWithAdvance) * 100))
      : 0
  }

const selectedDue = ref<MaintenanceDue | null>(null)
const breakdownVisible = ref(false)
const selectedDues = ref<MaintenanceDue[]>([])
const bulkSelectedDues = ref<MaintenanceDue[]>([])
const loadingBulkSelection = ref(false)
const waiverDialogVisible = ref(false)
const waiverTarget = ref<MaintenanceDue | null>(null)
const waiverReason = ref('')
const savingWaiver = ref(false)
const sendingReminder = ref(false)
const billSendDialogVisible = ref(false)
const billSendTargets = ref<MaintenanceDue[]>([])
const billChannels = ref<BillChannel[]>(['EMAIL', 'WHATSAPP'])
const sendingBills = ref(false)
const confirmAction = useAppConfirm()
const { downloadingBillPdfs, downloadBillPdfs } = useBillPdfZipDownload()

const hasBulkSelection = computed(() => bulkSelectedDues.value.length > 0)
const notificationSelectedDues = computed(() =>
  hasBulkSelection.value ? bulkSelectedDues.value : selectedDues.value,
)
const selectedReminderDues = computed(() =>
  notificationSelectedDues.value.filter(isReminderEligible),
)
const selectedBillDues = computed(() =>
  notificationSelectedDues.value.filter(canSendBill),
)
const selectedPdfDues = computed(() =>
  notificationSelectedDues.value.filter((due) => !due.isAdvanceCoverageRow),
)
const selectedPdfCount = computed(() => selectedPdfDues.value.length)
const notificationSelectionText = computed(() => {
  if (hasBulkSelection.value) {
    return `${bulkSelectedDues.value.length} matching due${bulkSelectedDues.value.length === 1 ? '' : 's'} selected across every page.`
  }

  if (selectedDues.value.length > 0) {
    return `${selectedDues.value.length} due${selectedDues.value.length === 1 ? '' : 's'} selected on this page.`
  }

  return 'Select dues on this page, or select every due matching the current filters.'
})

const billChannelOptions = [
  { label: 'Email', value: 'EMAIL' },
  { label: 'WhatsApp', value: 'WHATSAPP' },
  { label: 'Push', value: 'PUSH' },
  { label: 'In-app', value: 'IN_APP' },
]

const chunkDueIds = (dueIds: string[]) => {
  const chunks: string[][] = []

  for (let index = 0; index < dueIds.length; index += notificationBatchSize) {
    chunks.push(dueIds.slice(index, index + notificationBatchSize))
  }

  return chunks
}

const sumNotificationResponses = (responses: NotificationQueueResponse['data'][]) =>
  responses.reduce(
    (total, item) => ({
      eligible: total.eligible + item.eligible,
      jobCount: total.jobCount + item.jobCount,
    }),
    { eligible: 0, jobCount: 0 },
  )

const fetchAllMatchingDues = async () => {
  const pageSize = 2000
  const firstPage = await api<DueResponse>('/api/admin/billing/dues', {
    query: buildDueQuery({ page: 1, pageSize }),
  })
  const items = [...firstPage.data.items]
  const pageCount = Math.ceil(firstPage.data.total / pageSize)

  for (let page = 2; page <= pageCount; page += 1) {
    const response = await api<DueResponse>('/api/admin/billing/dues', {
      query: buildDueQuery({ page, pageSize }),
    })
    items.push(...response.data.items)
  }

  return items
}

const selectAllMatchingDues = async () => {
  if (totalRecords.value === 0) return

  loadingBulkSelection.value = true

  try {
    bulkSelectedDues.value = await fetchAllMatchingDues()
    toast.add({
      severity: 'success',
      summary: 'All matching records selected',
      detail: `${bulkSelectedDues.value.length} billing record${bulkSelectedDues.value.length === 1 ? '' : 's'} selected across all pages.`,
      life: 8000,
    })
  } finally {
    loadingBulkSelection.value = false
  }
}

const clearNotificationSelection = () => {
  selectedDues.value = []
  bulkSelectedDues.value = []
}

const openBreakdown = (due: MaintenanceDue) => {
  selectedDue.value = due
  breakdownVisible.value = true
}

const openWaiver = (due: MaintenanceDue) => {
  if (!canManageDues.value) return
  waiverTarget.value = due
  waiverReason.value = ''
  waiverDialogVisible.value = true
}

const submitWaiver = async () => {
  if (!waiverTarget.value) return
  savingWaiver.value = true

  try {
    const waived = waiverTarget.value.status !== 'WAIVED'
    await api(`/api/admin/billing/dues/${waiverTarget.value.id}/waive`, {
      method: 'POST',
      body: {
        waived,
        reason: waiverReason.value,
      },
    })
    toast.add({
      severity: 'success',
      summary: waived ? 'Due waived' : 'Waiver removed',
      detail: 'The due has been updated and audited.',
      life: 10000,
    })
    waiverDialogVisible.value = false
    await refresh()
  } finally {
    savingWaiver.value = false
  }
}

const sendReminders = async (dueIds: string[]) => {
  if (!canManageDues.value || dueIds.length === 0) return
  const bulkReminderIds = new Set(selectedReminderDues.value.map((due) => due.id))
  const isBulkReminderSend =
    hasBulkSelection.value &&
    dueIds.length === bulkReminderIds.size &&
    dueIds.every((dueId) => bulkReminderIds.has(dueId))
  const confirmed = await confirmAction({
    header: 'Send payment reminders?',
    message: `Queue reminders for ${dueIds.length} due${dueIds.length === 1 ? '' : 's'}${isBulkReminderSend ? ' across all matching pages' : ''}?`,
    icon: 'pi pi-send',
    acceptLabel: 'Send reminders',
    acceptSeverity: 'warn',
  })

  if (!confirmed) {
    return
  }

  sendingReminder.value = true

  try {
    const responses: NotificationQueueResponse['data'][] = []

    for (const batchDueIds of chunkDueIds(dueIds)) {
      const response = await api<NotificationQueueResponse>('/api/admin/billing/dues/reminders', {
        method: 'POST',
        body: { dueIds: batchDueIds },
      })
      responses.push(response.data)
    }

    const queued = sumNotificationResponses(responses)
    toast.add({
      severity: 'success',
      summary: 'Reminders queued',
      detail: `${queued.eligible} dues matched and ${queued.jobCount} delivery jobs were queued.`,
      life: 10000,
    })
  } finally {
    sendingReminder.value = false
  }
}

const sendSelectedReminders = () =>
  sendReminders(
    selectedReminderDues.value.map((due) => due.id),
  )

const openBillSend = (targets: MaintenanceDue[]) => {
  if (!canManageDues.value) return
  const eligibleTargets = targets.filter(canSendBill)
  if (eligibleTargets.length === 0) {
    toast.add({
      severity: 'info',
      summary: 'No bills to send',
      detail: 'Selected CAM dues are already covered by advance payment.',
      life: 8000,
    })
    return
  }

  billSendTargets.value = eligibleTargets
  billChannels.value = ['EMAIL', 'WHATSAPP']
  billSendDialogVisible.value = true
}

const billSendSummary = computed(() => {
  if (billSendTargets.value.length === 0) return 'No dues selected.'
  if (billSendTargets.value.length === 1) {
    const due = billSendTargets.value[0]
    return `${due?.blockName ?? ''} ${due?.flatNumber ?? ''} · ${due?.billingPeriodLabel ?? ''}`.trim()
  }

  return `${billSendTargets.value.length} bills selected`
})

const sendBills = async () => {
  const dueIds = billSendTargets.value.map((due) => due.id)
  if (dueIds.length === 0 || billChannels.value.length === 0) return

  sendingBills.value = true

  try {
    const responses: NotificationQueueResponse['data'][] = []

    for (const batchDueIds of chunkDueIds(dueIds)) {
      const response = await api<NotificationQueueResponse>('/api/admin/billing/dues/send-bills', {
        method: 'POST',
        body: {
          dueIds: batchDueIds,
          channels: billChannels.value,
        },
      })
      responses.push(response.data)
    }

    const queued = sumNotificationResponses(responses)
    toast.add({
      severity: 'success',
      summary: 'Bills queued',
      detail: `${queued.eligible} bills matched and ${queued.jobCount} delivery jobs were queued.`,
      life: 10000,
    })
    billSendDialogVisible.value = false
  } finally {
    sendingBills.value = false
  }
}

const buildBillPdfDownloadFilters = () => ({
  search: query.search || undefined,
  billingPeriodId: query.billingPeriodId || undefined,
  status: query.status || undefined,
  balance: query.balance || undefined,
  overdue: query.overdue || undefined,
  advance: query.advance || undefined,
  sortBy: query.sortBy,
  sortDirection: query.sortDirection,
})

const downloadVisibleBillPdfs = () => {
  if (selectedPdfDues.value.length > 0) {
    void downloadBillPdfs({
      dueIds: selectedPdfDues.value.map((due) => due.id),
    })
    return
  }

  void downloadBillPdfs({
    filters: buildBillPdfDownloadFilters(),
  })
}

const resetFilters = () => {
  query.page = 1
  query.search = ''
  query.billingPeriodId = ''
  query.status = ''
  query.balance = ''
  query.overdue = ''
  query.advance = ''
}

watch(
  () => [
    query.search,
    query.billingPeriodId,
    query.status,
    query.balance,
    query.overdue,
    query.advance,
  ].join('|'),
  () => {
    clearNotificationSelection()
  },
)
</script>

<template>
  <div class="landing-page">
    <div class="surface-grid">
      <section class="surface-card">
        <p class="eyebrow">Visible due</p>
        <h3>{{ formatMoney(summary.totalDue) }}</h3>
        <p>{{ totalRecords }} billing records match the current filters.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Collected</p>
        <h3>{{ formatMoney(summary.totalPaid) }}</h3>
        <p>{{ summary.collectionPercent }}% collection across generated bills.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Actionable balance</p>
        <h3>{{ formatMoney(summary.totalBalance) }}</h3>
        <p>
          {{ summary.overdue }} overdue flats.
          {{ summary.advanceCoveredCount }} CAM advance rows are non-billable (they are either covered bill rows or coverage markers).
        </p>
      </section>
    </div>

    <div class="admin-page-guide">
      <h2>How to read this list</h2>
      <p>
        CAM advance coverage appears in dues in two ways: normal bill rows and
        non-billable coverage markers.
      </p>
      <ol>
        <li>
          Regular rows are actual payable dues created by billing period generation.
        </li>
        <li>
          Coverage marker rows are inserted for flats already covered by advance CAM and
          should not receive bill send, reminder, or payment actions.
        </li>
        <li>
          Use the CAM advance filter below to isolate billable rows or already covered
          rows quickly.
        </li>
      </ol>
    </div>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Maintenance bills</h1>
          <p>
            Generate PDFs, send bills, and track period-wise balances for every
            flat.
          </p>
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
            :label="
              selectedPdfCount > 0
                ? `Download ${selectedPdfCount} PDF${selectedPdfCount === 1 ? '' : 's'}`
                : 'Download PDFs'
            "
            icon="pi pi-download"
            severity="secondary"
            outlined
            :loading="downloadingBillPdfs"
            :disabled="totalRecords === 0 && selectedPdfCount === 0"
            @click="downloadVisibleBillPdfs"
          />
          <Button
            v-if="canManageDues"
            :label="
              selectedBillCount > 0
                ? `Send ${selectedBillCount} bill${selectedBillCount === 1 ? '' : 's'}`
                : 'Send bills'
            "
            icon="pi pi-envelope"
            severity="secondary"
            outlined
            :loading="sendingBills"
            :disabled="selectedBillCount === 0"
            @click="openBillSend(selectedBillDues)"
          />
          <Button
            v-if="canManageDues"
            :label="
              selectedReminderCount > 0
                ? `Remind ${selectedReminderCount}`
                : 'Remind selected'
            "
            icon="pi pi-send"
            severity="secondary"
            outlined
            :loading="sendingReminder"
            :disabled="selectedReminderCount === 0"
            @click="sendSelectedReminders"
          />
          <Button
            label="Clear filters"
            icon="pi pi-filter-slash"
            severity="secondary"
            outlined
            :disabled="!hasActiveFilters"
            @click="resetFilters"
          />
        </div>
      </header>

      <div class="billing-workflow-panel billing-workflow-panel--dues">
        <div>
          <p class="eyebrow">Current view</p>
          <h2>{{ activePeriodLabel }}</h2>
          <p v-if="topOutstandingDue">
            Highest visible balance is
            {{ formatMoney(topOutstandingDue.balanceAmount) }} for
            {{ topOutstandingDue.blockName }}
            {{ topOutstandingDue.flatNumber }}.
          </p>
          <p v-else>
            No outstanding balance is visible with the current filters.
          </p>
          <div v-if="canManageDues" class="billing-selection-actions">
            <p>{{ notificationSelectionText }}</p>
            <div class="admin-inline-actions">
              <Button
                label="Select all matching"
                icon="pi pi-check-square"
                severity="secondary"
                outlined
                :loading="loadingBulkSelection"
                :disabled="totalRecords === 0 || loadingBulkSelection"
                @click="selectAllMatchingDues"
              />
              <Button
                label="Clear selection"
                icon="pi pi-times"
                severity="secondary"
                outlined
                :disabled="notificationSelectedDues.length === 0"
                @click="clearNotificationSelection"
              />
            </div>
          </div>
        </div>
        <dl>
          <div>
            <dt>Rows shown</dt>
            <dd>{{ dues.length }} / {{ totalRecords }}</dd>
          </div>
          <div v-if="canManageDues">
            <dt>Selected</dt>
            <dd>{{ selectedBillCount }}</dd>
          </div>
          <div v-if="canManageDues">
            <dt>Can remind</dt>
            <dd>{{ selectedReminderCount }}</dd>
          </div>
          <div>
            <dt>CAM advance</dt>
            <dd>{{ summary.advanceCoveredCount }}</dd>
          </div>
        </dl>
      </div>

      <div class="list-page__toolbar">
        <label class="list-page__search">
          <span class="field-label">
            Search
            <AppHelpIcon text="Find dues by flat number or block name." />
          </span>
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText
              v-model="query.search"
              placeholder="Search by flat or block"
            />
          </IconField>
        </label>
        <div class="list-page__filters">
          <label>
            <span class="field-label">
              Period
              <AppHelpIcon
                text="Limit the table to dues generated for one billing period."
              />
            </span>
            <Select
              v-model="query.billingPeriodId"
              :options="[{ label: 'All periods', value: '' }, ...periodOptions]"
              option-label="label"
              option-value="value"
              placeholder="Period"
            />
          </label>
          <label>
            <span class="field-label">
              Status
              <AppHelpIcon
                text="Filter by due lifecycle, such as open, paid, overdue, or waived."
              />
            </span>
            <Select
              v-model="query.status"
              :options="statusOptions"
              option-label="label"
              option-value="value"
              placeholder="Status"
            />
          </label>
          <label>
            <span class="field-label">
              Balance
              <AppHelpIcon
                text="Show dues that still have money pending or dues that are fully paid."
              />
            </span>
            <Select
              v-model="query.balance"
              :options="balanceOptions"
              option-label="label"
              option-value="value"
              placeholder="Balance"
            />
          </label>
          <label>
            <span class="field-label">
              Overdue
              <AppHelpIcon
                text="Show only dues past their due date and still unpaid."
              />
            </span>
            <Select
              v-model="query.overdue"
              :options="overdueOptions"
              option-label="label"
              option-value="value"
              placeholder="Overdue"
            />
          </label>
          <label>
            <span class="field-label">
              Advance
              <AppHelpIcon
                text="Separate CAM-advance non-billable coverage rows from billable rows."
              />
            </span>
            <Select
              v-model="query.advance"
              :options="advanceOptions"
              option-label="label"
              option-value="value"
              placeholder="Advance"
            />
          </label>
        </div>
      </div>

      <AppDataTable
        v-model:selection="selectedDues"
        :value="dues"
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
        <Column v-if="canManageDues" selection-mode="multiple" header-style="width: 3rem" />
        <Column field="flatNumber" header="Flat">
          <template #body="{ data: row }">
            <strong>{{ row.blockName }} {{ row.flatNumber }}</strong>
            <p class="table-muted">{{ row.unitType }}</p>
          </template>
        </Column>
        <Column field="billingPeriodLabel" header="Period">
          <template #body="{ data: row }">
            <span>{{ row.billingPeriodLabel }}</span>
            <p class="table-muted">Due {{ formatDate(row.dueDate) }}</p>
          </template>
        </Column>
        <Column header="Advance" style="min-width: 13rem">
          <template #body="{ data: row }">
            <div
              class="billing-advance-state"
              :class="`billing-advance-state--${advanceStatusKind(row)}`"
            >
              <span class="billing-advance-pill">
                {{ advanceStatusLabel(row) }}
              </span>
              <p>{{ advanceStatusDetail(row) }}</p>
            </div>
          </template>
        </Column>
        <Column field="primaryResidentName" header="Billing contact">
          <template #body="{ data: row }">
            <span>{{ row.primaryResidentName || '-' }}</span>
          </template>
        </Column>
        <Column field="baseAmount" header="Base">
          <template #body="{ data: row }">
            {{ formatMoney(row.baseAmount) }}
          </template>
        </Column>
        <Column field="lateFeeAmount" header="Late fee">
          <template #body="{ data: row }">
            {{ formatMoney(row.lateFeeAmount) }}
          </template>
        </Column>
        <Column field="paidAmount" header="Paid">
          <template #body="{ data: row }">
            {{ formatMoney(row.paidAmount) }}
          </template>
        </Column>
        <Column field="balanceAmount" header="Balance">
          <template #body="{ data: row }">
            <div class="billing-balance-cell">
              <strong>{{ formatMoney(row.balanceAmount) }}</strong>
              <span>{{ paymentProgressLabel(row) }}</span>
              <div class="billing-progress-track">
                <span :style="{ width: `${paymentProgress(row)}%` }" />
              </div>
            </div>
          </template>
        </Column>
        <Column field="status" header="Status">
          <template #body="{ data: row }">
            <span v-if="row.isCamAdvanceCovered" class="billing-advance-pill">
              {{ isCoverageRow(row) ? 'Coverage marker' : 'Covered' }}
            </span>
            <AppStatusBadge v-else :status="row.status" />
          </template>
        </Column>
        <Column header="Actions" style="width: 250px">
          <template #body="{ data: row }">
            <div class="admin-inline-actions">
              <Button
                v-if="canManageBilling"
                as="router-link"
                :to="getRecordPaymentRoute(row)"
                icon="pi pi-credit-card"
                severity="secondary"
                text
                rounded
                :aria-label="getRecordPaymentTitle(row)"
                :title="getRecordPaymentTitle(row)"
                :disabled="!canRecordPayment(row)"
              />
              <Button
                v-if="!row.isAdvanceCoverageRow"
                as="a"
                :href="`/api/admin/billing/dues/${row.id}/bill`"
                target="_blank"
                icon="pi pi-file-pdf"
                severity="secondary"
                text
                rounded
                aria-label="Open bill PDF"
                title="Open bill PDF"
              />
              <Button
                v-if="canManageDues"
                icon="pi pi-envelope"
                severity="secondary"
                text
                rounded
                :aria-label="getSendBillTitle(row)"
                :title="getSendBillTitle(row)"
                :disabled="!canSendBill(row)"
                @click="openBillSend([row])"
              />
              <Button
                icon="pi pi-list"
                severity="secondary"
                text
                rounded
                aria-label="View charge breakdown"
                title="View charge breakdown"
                @click="openBreakdown(row)"
              />
              <Button
                v-if="canManageDues"
                icon="pi pi-send"
                severity="secondary"
                text
                rounded
                :aria-label="getReminderTitle(row)"
                :title="getReminderTitle(row)"
                :disabled="!isReminderEligible(row)"
                @click="sendReminders([row.id])"
              />
              <Button
                v-if="canManageDues"
                :icon="row.status === 'WAIVED' ? 'pi pi-undo' : 'pi pi-ban'"
                severity="secondary"
                text
                rounded
                :aria-label="
                  row.status === 'WAIVED' ? 'Remove waiver' : 'Waive due'
                "
                :title="row.status === 'WAIVED' ? 'Remove waiver' : 'Waive due'"
                :disabled="!canWaiveDue(row)"
                @click="openWaiver(row)"
              />
            </div>
          </template>
        </Column>
      </AppDataTable>

      <div class="list-page__cards">
        <article v-for="due in dues" :key="due.id" class="list-card">
          <div class="list-card__header">
            <div>
              <h3>{{ due.blockName }} {{ due.flatNumber }}</h3>
              <p>
                {{ due.billingPeriodLabel }} · Due {{ formatDate(due.dueDate) }}
              </p>
            </div>
            <div>
            <span v-if="due.isCamAdvanceCovered" class="billing-advance-pill">
              {{ isCoverageRow(due) ? 'Coverage marker' : 'Covered' }}
            </span>
              <AppStatusBadge v-else :status="due.status" />
            </div>
          </div>
          <div
            class="billing-advance-state billing-advance-state--card"
            :class="`billing-advance-state--${advanceStatusKind(due)}`"
          >
            <span class="billing-advance-pill">
              {{ advanceStatusLabel(due) }}
            </span>
            <p>{{ advanceStatusDetail(due) }}</p>
          </div>
          <div class="billing-balance-cell billing-balance-cell--card">
            <strong>{{ formatMoney(due.balanceAmount) }}</strong>
            <span v-if="due.isCamAdvanceCovered">
              {{ isCoverageRow(due) ? 'Coverage marker row' : 'Covered by CAM advance' }}
            </span>
            <span v-else-if="hasCamAdvanceAdjustment(due)">
              {{ formatMoney(camAdvanceAdjustmentAmount(due)) }} advance deducted;
              {{ formatMoney(due.paidAmount) }} paid of
              {{ formatMoney(due.totalAmount) }} remaining bill
            </span>
            <span v-else>
              {{ formatMoney(due.paidAmount) }} paid of
              {{ formatMoney(due.totalAmount) }}
            </span>
            <div class="billing-progress-track">
              <span :style="{ width: `${paymentProgress(due)}%` }" />
            </div>
          </div>
          <div class="list-card__row">
            <span>Billing contact</span>
            <strong>{{ due.primaryResidentName || '-' }}</strong>
          </div>
          <div class="list-card__row">
            <span>Base + late fee</span>
            <strong>
              {{ formatMoney(due.baseAmount) }} +
              {{ formatMoney(due.lateFeeAmount) }}
            </strong>
          </div>
          <div class="admin-inline-actions">
            <Button
              v-if="canManageBilling"
              as="router-link"
              :to="getRecordPaymentRoute(due)"
              label="Record"
              icon="pi pi-credit-card"
              size="small"
              severity="secondary"
              outlined
              :title="getRecordPaymentTitle(due)"
              :disabled="!canRecordPayment(due)"
            />
            <Button
              v-if="!due.isAdvanceCoverageRow"
              as="a"
              :href="`/api/admin/billing/dues/${due.id}/bill`"
              target="_blank"
              label="PDF"
              icon="pi pi-file-pdf"
              size="small"
              severity="secondary"
              outlined
            />
            <Button
              v-if="canManageDues"
              label="Send bill"
              icon="pi pi-envelope"
              size="small"
              severity="secondary"
              outlined
              :title="getSendBillTitle(due)"
              :disabled="!canSendBill(due)"
              @click="openBillSend([due])"
            />
            <Button
              label="Breakdown"
              icon="pi pi-list"
              size="small"
              severity="secondary"
              outlined
              @click="openBreakdown(due)"
            />
            <Button
              v-if="canManageDues"
              label="Remind"
              icon="pi pi-send"
              size="small"
              severity="secondary"
              outlined
              :title="getReminderTitle(due)"
              :disabled="!isReminderEligible(due)"
              @click="sendReminders([due.id])"
            />
            <Button
              v-if="canManageDues"
              :label="due.status === 'WAIVED' ? 'Undo waiver' : 'Waive'"
              :icon="due.status === 'WAIVED' ? 'pi pi-undo' : 'pi pi-ban'"
              size="small"
              severity="secondary"
              outlined
              :disabled="!canWaiveDue(due)"
              @click="openWaiver(due)"
            />
          </div>
        </article>
      </div>
    </section>

    <Dialog
      v-model:visible="breakdownVisible"
      header="Charge breakdown"
      modal
      :style="{ width: '520px' }"
    >
      <div v-if="selectedDue" class="admin-form-layout">
        <div>
          <h3>{{ selectedDue.blockName }} {{ selectedDue.flatNumber }}</h3>
          <p>
            {{ selectedDue.billingPeriodLabel }} ·
            {{ formatDate(selectedDue.dueDate) }}
          </p>
        </div>
        <Message
          v-if="selectedDue.isAdvanceCoverageRow"
          severity="info"
          :closable="false"
        >
          This is a CAM coverage marker row for audit. It does not represent an
          outstanding bill, and bill/reminder/payment actions are intentionally
          disabled for this row.
        </Message>
        <Message v-else-if="selectedDue.isCamAdvanceCovered" severity="success" :closable="false">
          CAM advance covers this period from {{ formatDate(selectedDue.camAdvanceCoveredFrom) }}
          through {{ formatDate(selectedDue.camAdvancePaidUntil) }}.
          Bill delivery, reminders, and new payment capture are disabled for this CAM period.
        </Message>
        <AppDataTable
          :value="selectedDue.chargeBreakdown"
          responsive-layout="scroll"
        >
          <Column field="label" header="Charge" />
          <Column field="amount" header="Amount">
            <template #body="{ data: row }">
              {{ formatMoney(row.amount) }}
            </template>
          </Column>
        </AppDataTable>
        <div class="billing-total-line">
          <span>Computed balance</span>
          <strong>{{ formatMoney(selectedDue.balanceAmount) }}</strong>
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="billSendDialogVisible"
      header="Send bill"
      modal
      :style="{ width: '480px' }"
    >
      <form class="admin-form-layout" @submit.prevent="sendBills">
        <div class="billing-dialog-intro billing-dialog-intro--compact">
          <div>
            <p class="eyebrow">Bill delivery</p>
            <h2>{{ billSendSummary }}</h2>
            <p>Email delivery includes the PDF bill attachment. Bills are sent to owner contacts.</p>
          </div>
        </div>
        <label>
          <span class="field-label">
            Channels
            <AppHelpIcon
              text="Choose delivery channels for owner contacts linked to each selected flat."
            />
          </span>
          <MultiSelect
            v-model="billChannels"
            :options="billChannelOptions"
            option-label="label"
            option-value="value"
            display="chip"
            placeholder="Choose channels"
          />
        </label>
        <Message v-if="billChannels.includes('WHATSAPP')" severity="info">
          WhatsApp delivery uses the configured provider and sends the resident
          a secure bill link.
        </Message>
        <div class="admin-inline-actions dialog-actions">
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            outlined
            @click="billSendDialogVisible = false"
          />
          <Button
            type="submit"
            label="Send bill"
            icon="pi pi-send"
            :loading="sendingBills"
            :disabled="billSendTargets.length === 0 || billChannels.length === 0"
          />
        </div>
      </form>
    </Dialog>

    <Dialog
      v-model:visible="waiverDialogVisible"
      :header="
        waiverTarget?.status === 'WAIVED' ? 'Remove waiver' : 'Waive due'
      "
      modal
      :style="{ width: '480px' }"
    >
      <form class="admin-form-layout" @submit.prevent="submitWaiver">
        <div class="admin-page-guide">
          <h2>Waiver note</h2>
          <p>
            This action changes the due status and records the reason for audit
            review.
          </p>
        </div>
        <p v-if="waiverTarget">
          {{ waiverTarget.blockName }} {{ waiverTarget.flatNumber }} ·
          {{ waiverTarget.billingPeriodLabel }}
        </p>
        <label>
          <span class="field-label">
            Reason
            <AppHelpIcon
              text="Explain why this due is being waived or why an existing waiver is being removed."
            />
          </span>
          <Textarea v-model="waiverReason" rows="3" auto-resize required />
        </label>
        <div class="admin-inline-actions dialog-actions">
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            outlined
            @click="waiverDialogVisible = false"
          />
          <Button
            type="submit"
            :label="
              waiverTarget?.status === 'WAIVED' ? 'Remove waiver' : 'Waive due'
            "
            :loading="savingWaiver"
          />
        </div>
      </form>
    </Dialog>
  </div>
</template>
