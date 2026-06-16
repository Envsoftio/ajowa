<script setup lang="ts">
import type { BillingPeriod, MaintenanceDue } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Billing Dues',
})

type DueResponse = { ok: true; data: { items: MaintenanceDue[]; total: number; page: number; pageSize: number } }
type PeriodResponse = { ok: true; data: { items: BillingPeriod[] } }

const api = useApi()
const toast = useToast()

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)

const formatDate = (value: string | null | undefined) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '-'

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

const { data, pending, refresh } = await useAsyncData('admin-billing-dues', loadDues, { watch: [query] })

const { data: periodsData } = await useAsyncData('due-period-options', () =>
  api<PeriodResponse>('/api/admin/billing/periods', {
    query: { page: 1, pageSize: 2000, sortBy: 'startDate', sortDirection: 'desc' },
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
    collectionPercent: totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0,
  }
})

const selectedDue = ref<MaintenanceDue | null>(null)
const breakdownVisible = ref(false)
const selectedDues = ref<MaintenanceDue[]>([])
const waiverDialogVisible = ref(false)
const waiverTarget = ref<MaintenanceDue | null>(null)
const waiverReason = ref('')
const savingWaiver = ref(false)
const sendingReminder = ref(false)

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
      life: 3000,
    })
    waiverDialogVisible.value = false
    await refresh()
  } finally {
    savingWaiver.value = false
  }
}

const sendReminders = async (dueIds: string[]) => {
  if (dueIds.length === 0) return
  sendingReminder.value = true

  try {
    const response = await api<{ ok: true; data: { eligible: number; jobCount: number } }>(
      '/api/admin/billing/dues/reminders',
      {
        method: 'POST',
        body: { dueIds },
      },
    )
    toast.add({
      severity: 'success',
      summary: 'Reminders queued',
      detail: `${response.data.eligible} dues matched and ${response.data.jobCount} delivery jobs were queued.`,
      life: 4000,
    })
  } finally {
    sendingReminder.value = false
  }
}

const sendSelectedReminders = () =>
  sendReminders(
    selectedDues.value
      .filter((due) => due.balanceAmount > 0 && !['PAID', 'WAIVED', 'CANCELLED'].includes(due.status))
      .map((due) => due.id),
  )

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
          <h1>Maintenance dues</h1>
          <p>Review period-wise dues with computed late fees, paid amounts, balances, and statuses.</p>
        </div>
        <div class="list-page__exports">
          <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined @click="() => refresh()" />
          <Button
            label="Remind selected"
            icon="pi pi-send"
            severity="secondary"
            outlined
            :loading="sendingReminder"
            :disabled="selectedDues.length === 0"
            @click="sendSelectedReminders"
          />
          <Button label="Clear filters" icon="pi pi-filter-slash" severity="secondary" outlined @click="resetFilters" />
        </div>
      </header>

      <div class="list-page__toolbar">
        <IconField class="list-page__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="query.search" placeholder="Search by flat or block" />
        </IconField>
        <div class="list-page__filters">
          <Select
            v-model="query.billingPeriodId"
            :options="[{ label: 'All periods', value: '' }, ...periodOptions]"
            option-label="label"
            option-value="value"
            placeholder="Period"
          />
          <Select
            v-model="query.status"
            :options="[
              { label: 'All statuses', value: '' },
              { label: 'Open', value: 'OPEN' },
              { label: 'Partially paid', value: 'PARTIALLY_PAID' },
              { label: 'Paid', value: 'PAID' },
              { label: 'Overdue', value: 'OVERDUE' },
              { label: 'Waived', value: 'WAIVED' },
            ]"
            option-label="label"
            option-value="value"
            placeholder="Status"
          />
          <Select
            v-model="query.balance"
            :options="[
              { label: 'All balances', value: '' },
              { label: 'Outstanding', value: 'outstanding' },
              { label: 'Paid off', value: 'paid' },
            ]"
            option-label="label"
            option-value="value"
            placeholder="Balance"
          />
          <Select
            v-model="query.overdue"
            :options="[
              { label: 'Any due date', value: '' },
              { label: 'Overdue only', value: 'true' },
            ]"
            option-label="label"
            option-value="value"
            placeholder="Overdue"
          />
        </div>
      </div>

      <DataTable
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
        @page="(event) => { query.page = Math.floor(event.first / event.rows) + 1; query.pageSize = event.rows }"
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
            <strong>{{ formatMoney(row.balanceAmount) }}</strong>
          </template>
        </Column>
        <Column field="status" header="Status">
          <template #body="{ data: row }">
            <AppStatusBadge :status="row.status" />
          </template>
        </Column>
        <Column header="Actions" style="width: 150px">
          <template #body="{ data: row }">
            <div class="admin-inline-actions">
              <Button icon="pi pi-list" severity="secondary" text rounded @click="openBreakdown(row)" />
              <Button
                icon="pi pi-send"
                severity="secondary"
                text
                rounded
                :disabled="row.balanceAmount <= 0 || ['PAID', 'WAIVED', 'CANCELLED'].includes(row.status)"
                @click="sendReminders([row.id])"
              />
              <Button
                :icon="row.status === 'WAIVED' ? 'pi pi-undo' : 'pi pi-ban'"
                severity="secondary"
                text
                rounded
                :disabled="row.status === 'PAID' || row.status === 'CANCELLED'"
                @click="openWaiver(row)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </section>

    <Dialog v-model:visible="breakdownVisible" header="Charge breakdown" modal :style="{ width: '520px' }">
      <div v-if="selectedDue" class="admin-form-layout">
        <div>
          <h3>{{ selectedDue.blockName }} {{ selectedDue.flatNumber }}</h3>
          <p>{{ selectedDue.billingPeriodLabel }} · {{ formatDate(selectedDue.dueDate) }}</p>
        </div>
        <DataTable :value="selectedDue.chargeBreakdown" responsive-layout="scroll">
          <Column field="label" header="Charge" />
          <Column field="amount" header="Amount">
            <template #body="{ data: row }">
              {{ formatMoney(row.amount) }}
            </template>
          </Column>
        </DataTable>
        <div class="billing-total-line">
          <span>Computed balance</span>
          <strong>{{ formatMoney(selectedDue.balanceAmount) }}</strong>
        </div>
      </div>
    </Dialog>

    <Dialog v-model:visible="waiverDialogVisible" :header="waiverTarget?.status === 'WAIVED' ? 'Remove waiver' : 'Waive due'" modal :style="{ width: '480px' }">
      <form class="admin-form-layout" @submit.prevent="submitWaiver">
        <p v-if="waiverTarget">
          {{ waiverTarget.blockName }} {{ waiverTarget.flatNumber }} · {{ waiverTarget.billingPeriodLabel }}
        </p>
        <label>
          <span>Reason</span>
          <Textarea v-model="waiverReason" rows="3" auto-resize required />
        </label>
        <div class="admin-inline-actions dialog-actions">
          <Button type="button" label="Cancel" severity="secondary" outlined @click="waiverDialogVisible = false" />
          <Button type="submit" :label="waiverTarget?.status === 'WAIVED' ? 'Remove waiver' : 'Waive due'" :loading="savingWaiver" />
        </div>
      </form>
    </Dialog>
  </div>
</template>
