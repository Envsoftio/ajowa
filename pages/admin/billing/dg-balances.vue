<script setup lang="ts">
import type { DataTablePageEvent, DataTableSortEvent } from 'primevue/datatable'
import type { DgBalance, DgBalanceSummary, FlatSummary } from '~/types/domain'
import type { StaffPermission } from '~/shared/permissions'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'DG Balances',
})

type BalanceResponse = {
  ok: true
  data: {
    items: DgBalance[]
    total: number
    page: number
    pageSize: number
    totalPages: number
    summary: DgBalanceSummary
  }
}

type FlatsResponse = {
  ok: true
  data: { items: FlatSummary[]; total: number; page: number; pageSize: number }
}

type CreateResponse = {
  ok: true
  data: {
    id: string
    totalAmount: number
    advanceAppliedAmount: number
    balanceAmount: number
  }
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

const previousCycleEndDate = () => {
  const date = new Date()
  date.setDate(0)
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

const query = reactive({
  page: 1,
  pageSize: 50,
  search: '',
  state: 'outstanding',
  sortBy: 'periodStartDate',
  sortDirection: 'desc',
})

usePersistentReactiveState('admin-billing-dg-balance-filters', query, {
  omit: ['page'],
})

const buildQuery = () => ({
  page: query.page,
  pageSize: query.pageSize,
  search: query.search || undefined,
  state: query.state || undefined,
  sortBy: query.sortBy,
  sortDirection: query.sortDirection,
})

const [balancesAsyncData, flatsAsyncData] = await Promise.all([
  useAsyncData(
    'admin-dg-balances',
    () =>
      api<BalanceResponse>('/api/admin/billing/dg-balances', {
        query: buildQuery(),
      }),
    { watch: [query] },
  ),
  useAsyncData('dg-balance-flat-options', () =>
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
])

const { data, pending, refresh } = balancesAsyncData
const { data: flatsData } = flatsAsyncData
const balances = computed(() => data.value?.data.items ?? [])
const totalRecords = computed(() => data.value?.data.total ?? 0)
const summary = computed<DgBalanceSummary>(
  () =>
    data.value?.data.summary ?? {
      principalAmount: 0,
      interestAmount: 0,
      lateFeeAmount: 0,
      totalBilledAmount: 0,
      cashPaidAmount: 0,
      advanceAppliedAmount: 0,
      waivedAmount: 0,
      outstandingAmount: 0,
      availableAdvanceAmount: 0,
      netPositionAmount: 0,
    },
)
const flatOptions = computed(() =>
  (flatsData.value?.data.items ?? []).map((flat) => ({
    label: `${flat.blockName} ${flat.flatNumber} - ${flat.unitType}`,
    value: flat.id,
  })),
)
const tableFirst = computed(() => (query.page - 1) * query.pageSize)
const tableSortOrder = computed(() => (query.sortDirection === 'asc' ? 1 : -1))
const stateOptions = [
  { label: 'Outstanding', value: 'outstanding' },
  { label: 'Settled', value: 'settled' },
  { label: 'All carried-forward entries', value: '' },
]

const dialogVisible = ref(false)
const saving = ref(false)
const form = reactive({
  flatId: '',
  asOfDate: previousCycleEndDate(),
  dueDate: todayDate(),
  principalAmount: null as number | null,
  note: '',
})

const openCreateDialog = () => {
  Object.assign(form, {
    flatId: '',
    asOfDate: previousCycleEndDate(),
    dueDate: todayDate(),
    principalAmount: null,
    note: '',
  })
  dialogVisible.value = true
}

const savePreviousBalance = async () => {
  if (
    !form.flatId ||
    !form.asOfDate ||
    !form.dueDate ||
    !form.principalAmount ||
    form.principalAmount <= 0 ||
    form.note.trim().length < 3
  ) {
    toast.add({
      severity: 'warn',
      summary: 'Complete required fields',
      detail:
        'Select a flat and enter the previous cycle date, due date, unpaid amount, and audit note.',
      life: 7000,
    })
    return
  }
  if (form.dueDate < form.asOfDate) {
    toast.add({
      severity: 'warn',
      summary: 'Check the due date',
      detail: 'The due date cannot be before the previous cycle date.',
      life: 7000,
    })
    return
  }

  saving.value = true
  try {
    const response = await api<CreateResponse>(
      '/api/admin/billing/dg-balances',
      {
        method: 'POST',
        body: {
          flatId: form.flatId,
          asOfDate: form.asOfDate,
          dueDate: form.dueDate,
          principalAmount: form.principalAmount,
          note: form.note,
        },
      },
    )
    const applied = response.data.advanceAppliedAmount
    toast.add({
      severity: 'success',
      summary: 'Carried-forward DG balance added',
      detail:
        applied > 0
          ? `${formatMoney(applied)} of DG advance was applied oldest-first. Remaining balance: ${formatMoney(response.data.balanceAmount)}.`
          : `Payable balance created: ${formatMoney(response.data.balanceAmount)}.`,
      life: 9000,
    })
    dialogVisible.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

const handlePage = (event: DataTablePageEvent) => {
  query.page = event.page + 1
  query.pageSize = event.rows
}

const handleSort = (event: DataTableSortEvent) => {
  query.sortBy = String(event.sortField ?? 'periodStartDate')
  query.sortDirection = event.sortOrder === 1 ? 'asc' : 'desc'
  query.page = 1
}

const resetFilters = () => {
  Object.assign(query, {
    page: 1,
    search: '',
    state: 'outstanding',
    sortBy: 'periodStartDate',
    sortDirection: 'desc',
  })
}

const statusSeverity = (status: DgBalance['status']) => {
  if (status === 'PAID' || status === 'WAIVED') return 'success'
  if (status === 'OVERDUE') return 'danger'
  if (status === 'PARTIALLY_PAID') return 'warn'
  return 'info'
}
</script>

<template>
  <div class="landing-page">
    <section class="billing-command-panel">
      <header class="billing-command-header">
        <div>
          <p class="eyebrow">DG billing</p>
          <h1>DG balances</h1>
          <p>
            Record and settle unpaid DG amounts carried into AJOWA from earlier
            cycles. Current-cycle bills remain in DG Set Charges and Dues.
          </p>
        </div>
        <div class="billing-command-actions">
          <Button
            as="router-link"
            to="/admin/billing/dg-advance"
            label="DG advance"
            icon="pi pi-wallet"
            severity="secondary"
            outlined
          />
          <Button
            label="Add carried-forward balance"
            icon="pi pi-plus-circle"
            :disabled="!canManageBilling"
            @click="openCreateDialog"
          />
        </div>
      </header>

      <div class="billing-cycle-guide">
        <div>
          <span>Carried-forward outstanding</span>
          <strong>{{ formatMoney(summary.outstandingAmount) }}</strong>
          <p>Old unpaid DG amounts</p>
        </div>
        <div>
          <span>Available DG advance</span>
          <strong>{{ formatMoney(summary.availableAdvanceAmount) }}</strong>
          <p>Resident liability still available</p>
        </div>
        <div>
          <span>Advance applied</span>
          <strong>{{ formatMoney(summary.advanceAppliedAmount) }}</strong>
          <p>Internal DG settlement</p>
        </div>
        <div>
          <span>Cash allocated</span>
          <strong>{{ formatMoney(summary.cashPaidAmount) }}</strong>
          <p>Verified money received</p>
        </div>
        <div>
          <span>Net DG position</span>
          <strong>{{ formatMoney(summary.netPositionAmount) }}</strong>
          <p>Outstanding less available DG credit</p>
        </div>
      </div>

      <Message severity="info" :closable="false">
        Initial setup only: enter each flat's unpaid DG amount carried from
        before AJOWA. Current and future bills are generated from DG Set Charges
        and remain visible in Dues and bill PDFs; they are not repeated in this
        carried-forward register.
      </Message>
    </section>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Carried-forward DG balances</h1>
          <p>
            Previous-cycle amounts entered during setup, less payments and DG
            advance adjustments.
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
            label="Clear filters"
            icon="pi pi-filter-slash"
            severity="secondary"
            outlined
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
              placeholder="Flat, resident, period, or note"
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
        :value="balances"
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
            <p class="table-muted">
              {{ row.primaryResidentName || row.unitType }}
            </p>
          </template>
        </Column>
        <Column field="periodStartDate" header="Period / source" sortable>
          <template #body="{ data: row }">
            <strong>{{ row.billingPeriodLabel }}</strong>
            <p class="table-muted">
              Carried-forward balance · {{ formatDate(row.periodStartDate) }}
            </p>
          </template>
        </Column>
        <Column field="principalAmount" header="Principal">
          <template #body="{ data: row }">{{
            formatMoney(row.principalAmount)
          }}</template>
        </Column>
        <Column field="cashPaidAmount" header="Cash paid">
          <template #body="{ data: row }">{{
            formatMoney(row.cashPaidAmount)
          }}</template>
        </Column>
        <Column field="advanceAppliedAmount" header="Advance applied">
          <template #body="{ data: row }">{{
            formatMoney(row.advanceAppliedAmount)
          }}</template>
        </Column>
        <Column field="balanceAmount" header="Amount outstanding" sortable>
          <template #body="{ data: row }"
            ><strong>{{ formatMoney(row.balanceAmount) }}</strong></template
          >
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
      header="Add carried-forward DG balance"
      modal
      :style="{ width: '680px' }"
    >
      <form class="admin-form-layout" @submit.prevent="savePreviousBalance">
        <div class="billing-dialog-intro">
          <div>
            <p class="eyebrow">Initial balance setup</p>
            <h2>Record an old unpaid DG amount</h2>
            <p>
              Enter the amount payable when AJOWA tracking begins. Any available
              DG advance is applied oldest-first.
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
          <label>
            <span class="field-label"
              >Previous cycle date <span class="required-marker">*</span></span
            >
            <InputText v-model="form.asOfDate" type="date" required />
          </label>
          <label>
            <span class="field-label"
              >Due date <span class="required-marker">*</span></span
            >
            <InputText v-model="form.dueDate" type="date" required />
          </label>
          <label>
            <span class="field-label"
              >Unpaid amount <span class="required-marker">*</span></span
            >
            <InputNumber
              v-model="form.principalAmount"
              mode="currency"
              currency="INR"
              locale="en-IN"
              :min="0.01"
              :max-fraction-digits="2"
              fluid
              required
            />
          </label>
          <label class="admin-form-grid__full">
            <span class="field-label"
              >Audit note <span class="required-marker">*</span></span
            >
            <Textarea
              v-model="form.note"
              rows="4"
              auto-resize
              placeholder="Previous bill number, cycle, and reason for the balance entry"
              required
            />
          </label>
        </div>
        <Message severity="warn" :closable="false">
          Do this once during setup. If a DG bill was generated in AJOWA, its
          unpaid amount is already tracked here and must not be added again.
        </Message>
        <div class="admin-inline-actions dialog-actions">
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            outlined
            :disabled="saving"
            @click="dialogVisible = false"
          />
          <Button
            type="submit"
            label="Add balance"
            icon="pi pi-plus-circle"
            :loading="saving"
            :disabled="!canManageBilling"
          />
        </div>
      </form>
    </Dialog>
  </div>
</template>
