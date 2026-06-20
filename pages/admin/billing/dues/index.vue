<script setup lang="ts">
import type { DataTablePageEvent } from 'primevue/datatable'
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
type BillChannel = 'EMAIL' | 'WHATSAPP'

const api = useApi()
const toast = useToast()

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
  sortBy: 'flatNumber',
  sortDirection: 'asc',
})

const loadDues = () =>
  api<DueResponse>('/api/admin/billing/dues', {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search || undefined,
      billingPeriodId: query.billingPeriodId || undefined,
      status: query.status || undefined,
      balance: query.balance || undefined,
      overdue: query.overdue || undefined,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    },
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

const isReminderEligible = (due: MaintenanceDue) =>
  due.balanceAmount > 0 && !['PAID', 'WAIVED', 'CANCELLED'].includes(due.status)

const summary = computed(() => {
  const rows = dues.value
  const totalDue = rows.reduce((sum, row) => sum + row.totalAmount, 0)
  const totalPaid = rows.reduce((sum, row) => sum + row.paidAmount, 0)
  const totalBalance = rows.reduce((sum, row) => sum + row.balanceAmount, 0)
  const overdue = rows.filter((row) => row.status === 'OVERDUE').length

  return {
    totalDue,
    totalPaid,
    totalBalance,
    overdue,
    collectionPercent:
      totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0,
  }
})

const selectedReminderCount = computed(
  () => selectedDues.value.filter(isReminderEligible).length,
)
const selectedBillCount = computed(() => selectedDues.value.length)

const hasActiveFilters = computed(
  () =>
    Boolean(query.search) ||
    Boolean(query.billingPeriodId) ||
    Boolean(query.status) ||
    Boolean(query.balance) ||
    Boolean(query.overdue),
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
  due.totalAmount > 0
    ? Math.min(100, Math.round((due.paidAmount / due.totalAmount) * 100))
    : 0

const selectedDue = ref<MaintenanceDue | null>(null)
const breakdownVisible = ref(false)
const selectedDues = ref<MaintenanceDue[]>([])
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

const billChannelOptions = [
  { label: 'Email', value: 'EMAIL' },
  { label: 'WhatsApp', value: 'WHATSAPP' },
]

const openBreakdown = (due: MaintenanceDue) => {
  selectedDue.value = due
  breakdownVisible.value = true
}

const openWaiver = (due: MaintenanceDue) => {
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
  if (dueIds.length === 0) return
  const confirmed = await confirmAction({
    header: 'Send payment reminders?',
    message: `Queue reminders for ${dueIds.length} due${dueIds.length === 1 ? '' : 's'}?`,
    icon: 'pi pi-send',
    acceptLabel: 'Send reminders',
    acceptSeverity: 'warn',
  })

  if (!confirmed) {
    return
  }

  sendingReminder.value = true

  try {
    const response = await api<{
      ok: true
      data: { eligible: number; jobCount: number }
    }>('/api/admin/billing/dues/reminders', {
      method: 'POST',
      body: { dueIds },
    })
    toast.add({
      severity: 'success',
      summary: 'Reminders queued',
      detail: `${response.data.eligible} dues matched and ${response.data.jobCount} delivery jobs were queued.`,
      life: 10000,
    })
  } finally {
    sendingReminder.value = false
  }
}

const sendSelectedReminders = () =>
  sendReminders(
    selectedDues.value.filter(isReminderEligible).map((due) => due.id),
  )

const openBillSend = (targets: MaintenanceDue[]) => {
  billSendTargets.value = targets
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
    const response = await api<{
      ok: true
      data: { eligible: number; jobCount: number }
    }>('/api/admin/billing/dues/send-bills', {
      method: 'POST',
      body: {
        dueIds,
        channels: billChannels.value,
      },
    })
    toast.add({
      severity: 'success',
      summary: 'Bills queued',
      detail: `${response.data.eligible} bills matched and ${response.data.jobCount} delivery jobs were queued.`,
      life: 10000,
    })
    billSendDialogVisible.value = false
  } finally {
    sendingBills.value = false
  }
}

const resetFilters = () => {
  query.page = 1
  query.search = ''
  query.billingPeriodId = ''
  query.status = ''
  query.balance = ''
  query.overdue = ''
}
</script>

<template>
  <div class="landing-page">
    <div class="surface-grid">
      <section class="surface-card">
        <p class="eyebrow">Visible due</p>
        <h3>{{ formatMoney(summary.totalDue) }}</h3>
        <p>{{ totalRecords }} due rows match the current filters.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Collected</p>
        <h3>{{ formatMoney(summary.totalPaid) }}</h3>
        <p>{{ summary.collectionPercent }}% collection across visible rows.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Balance</p>
        <h3>{{ formatMoney(summary.totalBalance) }}</h3>
        <p>{{ summary.overdue }} overdue flats on this page.</p>
      </section>
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
              selectedBillCount > 0
                ? `Send ${selectedBillCount} bill${selectedBillCount === 1 ? '' : 's'}`
                : 'Send bills'
            "
            icon="pi pi-envelope"
            severity="secondary"
            outlined
            :loading="sendingBills"
            :disabled="selectedBillCount === 0"
            @click="openBillSend(selectedDues)"
          />
          <Button
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
        </div>
        <dl>
          <div>
            <dt>Rows shown</dt>
            <dd>{{ dues.length }} / {{ totalRecords }}</dd>
          </div>
          <div>
            <dt>Selected</dt>
            <dd>{{ selectedDues.length }}</dd>
          </div>
          <div>
            <dt>Can remind</dt>
            <dd>{{ selectedReminderCount }}</dd>
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
        <Column selection-mode="multiple" header-style="width: 3rem" />
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
              <span>{{ paymentProgress(row) }}% paid</span>
              <div class="billing-progress-track">
                <span :style="{ width: `${paymentProgress(row)}%` }" />
              </div>
            </div>
          </template>
        </Column>
        <Column field="status" header="Status">
          <template #body="{ data: row }">
            <AppStatusBadge :status="row.status" />
          </template>
        </Column>
        <Column header="Actions" style="width: 210px">
          <template #body="{ data: row }">
            <div class="admin-inline-actions">
              <Button
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
                icon="pi pi-envelope"
                severity="secondary"
                text
                rounded
                aria-label="Send bill"
                title="Send bill"
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
                icon="pi pi-send"
                severity="secondary"
                text
                rounded
                :aria-label="`Send reminder for ${row.flatNumber || 'flat'} ${row.billingPeriodLabel || ''}`"
                :title="`Send reminder for ${row.flatNumber || 'flat'} ${row.billingPeriodLabel || ''}`"
                :disabled="!isReminderEligible(row)"
                @click="sendReminders([row.id])"
              />
              <Button
                :icon="row.status === 'WAIVED' ? 'pi pi-undo' : 'pi pi-ban'"
                severity="secondary"
                text
                rounded
                :aria-label="
                  row.status === 'WAIVED' ? 'Remove waiver' : 'Waive due'
                "
                :title="row.status === 'WAIVED' ? 'Remove waiver' : 'Waive due'"
                :disabled="row.status === 'PAID' || row.status === 'CANCELLED'"
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
            <AppStatusBadge :status="due.status" />
          </div>
          <div class="billing-balance-cell billing-balance-cell--card">
            <strong>{{ formatMoney(due.balanceAmount) }}</strong>
            <span>
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
              label="Send bill"
              icon="pi pi-envelope"
              size="small"
              severity="secondary"
              outlined
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
              label="Remind"
              icon="pi pi-send"
              size="small"
              severity="secondary"
              outlined
              :disabled="!isReminderEligible(due)"
              @click="sendReminders([due.id])"
            />
            <Button
              :label="due.status === 'WAIVED' ? 'Undo waiver' : 'Waive'"
              :icon="due.status === 'WAIVED' ? 'pi pi-undo' : 'pi pi-ban'"
              size="small"
              severity="secondary"
              outlined
              :disabled="due.status === 'PAID' || due.status === 'CANCELLED'"
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
            <p>Email delivery includes the PDF bill attachment.</p>
          </div>
        </div>
        <label>
          <span class="field-label">
            Channels
            <AppHelpIcon
              text="Choose Email, WhatsApp, or both for the billing contacts linked to each flat."
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
