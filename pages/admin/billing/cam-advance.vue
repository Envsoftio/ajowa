<script setup lang="ts">
import type { DataTablePageEvent } from 'primevue/datatable'
import type { CamAdvanceCoverage, CamAdvanceCoverageSource, FlatSummary } from '~/types/domain'
import type { StaffPermission } from '~/shared/permissions'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'CAM Advance',
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

type CoverageResponse = PaginatedResponse<CamAdvanceCoverage>
type FlatsResponse = PaginatedResponse<FlatSummary>
type SaveResponse = { ok: true; data: { id: string; updated?: boolean; deleted?: boolean } }

const api = useApi()
const toast = useToast()
const authStore = useAuthStore()
const confirmAction = useAppConfirm()

const hasPermission = (permission: StaffPermission) =>
  authStore.me?.user.permissions.includes(permission) ?? false

const canManageBilling = computed(() => hasPermission('billing.manage'))

const formatMoney = (value: number | null | undefined) =>
  value == null
    ? '-'
    : new Intl.NumberFormat('en-IN', {
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

const todayDate = () => new Date().toISOString().slice(0, 10)

const query = reactive({
  page: 1,
  pageSize: 50,
  search: '',
  state: 'active',
  source: '',
  sortBy: 'coveredUntil',
  sortDirection: 'desc',
})

const buildCoverageQuery = (overrides: Partial<typeof query> = {}) => ({
  page: overrides.page ?? query.page,
  pageSize: overrides.pageSize ?? query.pageSize,
  search: query.search || undefined,
  state: query.state || undefined,
  source: query.source || undefined,
  sortBy: query.sortBy,
  sortDirection: query.sortDirection,
})

const [
  coveragesAsyncData,
  flatsAsyncData,
] = await Promise.all([
  useAsyncData(
    'admin-cam-advance-coverages',
    () => api<CoverageResponse>('/api/admin/billing/cam-advance-coverages', {
      query: buildCoverageQuery(),
    }),
    { watch: [query] },
  ),
  useAsyncData('cam-advance-flat-options', () =>
    api<FlatsResponse>('/api/admin/flats', {
      query: { page: 1, pageSize: 2000, sortBy: 'flatNumber', sortDirection: 'asc', isActive: 'true' },
    }),
  ),
])

const { data, pending, refresh } = coveragesAsyncData
const { data: flatsData } = flatsAsyncData

const coverages = computed(() => data.value?.data.items ?? [])
const totalRecords = computed(() => data.value?.data.total ?? 0)
const flatOptions = computed(() =>
  (flatsData.value?.data.items ?? []).map((flat) => ({
    label: `${flat.blockName} ${flat.flatNumber} - ${flat.unitType}`,
    value: flat.id,
  })),
)

const stateOptions = [
  { label: 'Active records', value: 'active' },
  { label: 'Currently covering', value: 'current' },
  { label: 'Expired', value: 'expired' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'All records', value: '' },
]

const sourceOptions: Array<{ label: string; value: CamAdvanceCoverageSource | '' }> = [
  { label: 'All sources', value: '' },
  { label: 'Manual', value: 'MANUAL' },
  { label: 'Payment', value: 'PAYMENT' },
  { label: 'Import', value: 'IMPORT' },
  { label: 'Opening balance', value: 'OPENING_BALANCE' },
  { label: 'Legacy marker', value: 'LEGACY_MARKER' },
]

const form = reactive({
  id: '',
  flatId: '',
  coveredFrom: todayDate(),
  coveredUntil: todayDate(),
  amount: null as number | null,
  source: 'MANUAL' as CamAdvanceCoverageSource,
  reference: '',
  notes: '',
  isActive: true,
})

const dialogVisible = ref(false)
const saving = ref(false)
const editingCoverage = computed(() => Boolean(form.id))

const resetForm = () => {
  form.id = ''
  form.flatId = ''
  form.coveredFrom = todayDate()
  form.coveredUntil = todayDate()
  form.amount = null
  form.source = 'MANUAL'
  form.reference = ''
  form.notes = ''
  form.isActive = true
}

const openCreateDialog = () => {
  resetForm()
  dialogVisible.value = true
}

const editCoverage = (coverage: CamAdvanceCoverage) => {
  form.id = coverage.id
  form.flatId = coverage.flatId
  form.coveredFrom = coverage.coveredFrom
  form.coveredUntil = coverage.coveredUntil
  form.amount = coverage.amount
  form.source = coverage.source
  form.reference = coverage.reference ?? ''
  form.notes = coverage.notes ?? ''
  form.isActive = coverage.isActive
  dialogVisible.value = true
}

const saveCoverage = async () => {
  if (!canManageBilling.value || !form.flatId) return
  saving.value = true

  try {
    const body = {
      flatId: form.flatId,
      coveredFrom: form.coveredFrom,
      coveredUntil: form.coveredUntil,
      amount: form.amount,
      source: form.source,
      reference: form.reference || null,
      notes: form.notes || null,
      isActive: form.isActive,
    }
    const response = editingCoverage.value
      ? await api<SaveResponse>(`/api/admin/billing/cam-advance-coverages/${form.id}`, {
          method: 'PATCH',
          body,
        })
      : await api<SaveResponse>('/api/admin/billing/cam-advance-coverages', {
          method: 'POST',
          body,
        })

    toast.add({
      severity: 'success',
      summary: editingCoverage.value ? 'Coverage updated' : 'Coverage added',
      detail: `CAM advance coverage ${response.data.id ? 'saved' : 'updated'}. Recompute generated CAM dues for affected flats before sending bills.`,
      life: 8000,
    })
    dialogVisible.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

const deactivateCoverage = async (coverage: CamAdvanceCoverage) => {
  if (!canManageBilling.value) return
  const confirmed = await confirmAction({
    header: 'Deactivate CAM advance?',
    message: `Deactivate coverage for ${coverage.blockName} ${coverage.flatNumber}? Covered CAM periods will become billable if no other coverage exists.`,
    icon: 'pi pi-calendar-times',
    acceptLabel: 'Deactivate',
    acceptSeverity: 'danger',
  })

  if (!confirmed) return

  await api<SaveResponse>(`/api/admin/billing/cam-advance-coverages/${coverage.id}`, {
    method: 'DELETE',
  })
  toast.add({
    severity: 'success',
    summary: 'Coverage deactivated',
    detail: 'The CAM advance record is inactive now. Recompute generated CAM dues for affected flats before sending bills.',
    life: 8000,
  })
  await refresh()
}

const resetFilters = () => {
  query.page = 1
  query.search = ''
  query.state = 'active'
  query.source = ''
}

const summary = computed(() => {
  const rows = coverages.value
  return {
    visibleAmount: rows.reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
    currentCount: rows.filter((item) => item.coveredFrom <= todayDate() && item.coveredUntil >= todayDate() && item.isActive).length,
    activeCount: rows.filter((item) => item.isActive).length,
  }
})
</script>

<template>
  <div class="landing-page">
    <section class="billing-command-panel">
      <header class="billing-command-header">
        <div>
          <p class="eyebrow">CAM billing</p>
          <h1>CAM advance</h1>
          <p>
            Track CAM periods already prepaid so CAM bill generation can skip those
            flats and dues remain non-actionable for that period.
          </p>
        </div>
        <div class="billing-command-actions">
          <Button
            label="Add coverage"
            icon="pi pi-calendar-plus"
            :disabled="!canManageBilling"
            @click="openCreateDialog"
          />
        </div>
      </header>

      <div class="billing-cycle-guide">
        <div>
          <span>Visible records</span>
          <strong>{{ totalRecords }}</strong>
          <p>{{ summary.activeCount }} active on this page</p>
        </div>
        <div>
          <span>Currently covering</span>
          <strong>{{ summary.currentCount }}</strong>
          <p>Based on today's date</p>
        </div>
        <div>
          <span>Visible amount</span>
          <strong>{{ formatMoney(summary.visibleAmount) }}</strong>
          <p>For records with an amount</p>
        </div>
      </div>

      <div class="admin-page-guide">
        <h2>How this page works</h2>
        <p>
          This is a coverage register, not a bill register. Each row stores a CAM
          period that is already paid through manual mark, receipt link, import,
          opening balance, or past payment mapping.
        </p>
        <ol>
          <li>
            Add or edit coverage for the exact covered period (from-to dates).
          </li>
          <li>
            Keep it active for the period where CAM is covered to prevent
            duplicate CAM generation.
          </li>
          <li>
            In dues, these appear as coverage rows so admins can audit paid CAM
            periods without sending bills/reminders for them.
          </li>
        </ol>
      </div>
    </section>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Advance register</h1>
          <p>Coverage rows are separate from receipts and regular dues.</p>
        </div>
        <div class="list-page__exports">
          <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined @click="() => refresh()" />
          <Button
            label="Clear filters"
            icon="pi pi-filter-slash"
            severity="secondary"
            outlined
            :disabled="!query.search && query.state === 'active' && !query.source"
            @click="resetFilters"
          />
        </div>
      </header>

      <div class="list-page__toolbar">
        <label class="list-page__search">
          <span class="field-label">Search</span>
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="query.search" placeholder="Flat, block, resident, reference" />
          </IconField>
        </label>
        <div class="list-page__filters">
          <label>
            <span class="field-label">State</span>
            <Select v-model="query.state" :options="stateOptions" option-label="label" option-value="value" />
          </label>
          <label>
            <span class="field-label">Source</span>
            <Select v-model="query.source" :options="sourceOptions" option-label="label" option-value="value" />
          </label>
        </div>
      </div>

      <AppDataTable
        :value="coverages"
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
        <Column field="flatNumber" header="Flat">
          <template #body="{ data: row }">
            <strong>{{ row.blockName }} {{ row.flatNumber }}</strong>
            <p class="table-muted">{{ row.unitType }}</p>
          </template>
        </Column>
        <Column field="primaryResidentName" header="Billing contact">
          <template #body="{ data: row }">{{ row.primaryResidentName || '-' }}</template>
        </Column>
        <Column field="coveredFrom" header="Covered from">
          <template #body="{ data: row }">{{ formatDate(row.coveredFrom) }}</template>
        </Column>
        <Column field="coveredUntil" header="Covered until">
          <template #body="{ data: row }">
            <strong>{{ formatDate(row.coveredUntil) }}</strong>
          </template>
        </Column>
        <Column field="amount" header="Amount">
          <template #body="{ data: row }">{{ formatMoney(row.amount) }}</template>
        </Column>
        <Column field="source" header="Source" />
        <Column field="reference" header="Reference">
          <template #body="{ data: row }">{{ row.reference || '-' }}</template>
        </Column>
        <Column field="isActive" header="State">
          <template #body="{ data: row }">
            <Tag :value="row.isActive ? 'Active' : 'Inactive'" :severity="row.isActive ? 'success' : 'secondary'" rounded />
          </template>
        </Column>
        <Column header="Actions" style="width: 130px">
          <template #body="{ data: row }">
            <div class="admin-inline-actions">
              <Button
                icon="pi pi-pencil"
                severity="secondary"
                text
                rounded
                aria-label="Edit coverage"
                title="Edit coverage"
                :disabled="!canManageBilling"
                @click="editCoverage(row)"
              />
              <Button
                v-if="row.isActive"
                icon="pi pi-times"
                severity="secondary"
                text
                rounded
                aria-label="Deactivate coverage"
                title="Deactivate coverage"
                :disabled="!canManageBilling"
                @click="deactivateCoverage(row)"
              />
            </div>
          </template>
        </Column>
      </AppDataTable>
    </section>

    <Dialog
      v-model:visible="dialogVisible"
      :header="editingCoverage ? 'Edit CAM advance' : 'Add CAM advance'"
      modal
      :style="{ width: '620px' }"
    >
      <form class="admin-form-layout" @submit.prevent="saveCoverage">
        <div class="billing-dialog-intro">
          <div>
            <p class="eyebrow">Advance coverage</p>
            <h2>{{ editingCoverage ? 'Update coverage' : 'New coverage' }}</h2>
            <p>
              This saves a CAM coverage marker only; it does not create a new
              bill, receipt, or due row.
            </p>
          </div>
        </div>

        <div class="admin-form-grid">
          <label class="admin-form-grid__full">
            <span class="field-label">Flat</span>
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
            <span class="field-label">Covered from</span>
            <InputText v-model="form.coveredFrom" type="date" required />
          </label>
          <label>
            <span class="field-label">Covered until</span>
            <InputText v-model="form.coveredUntil" type="date" required />
          </label>
          <label>
            <span class="field-label">Amount</span>
            <InputNumber v-model="form.amount" :min="0" :max-fraction-digits="2" placeholder="Optional" fluid />
          </label>
          <label>
            <span class="field-label">Source</span>
            <Select
              v-model="form.source"
              :options="sourceOptions.filter((item) => item.value)"
              option-label="label"
              option-value="value"
            />
          </label>
          <label class="admin-form-grid__full">
            <span class="field-label">Reference</span>
            <InputText v-model="form.reference" placeholder="Receipt, UTR, import batch, or note reference" />
          </label>
          <label class="admin-form-grid__full">
            <span class="field-label">Notes</span>
            <Textarea v-model="form.notes" rows="3" auto-resize />
          </label>
          <label class="admin-toggle-card admin-form-grid__full">
            <span>
              <strong>Active</strong>
              <small>Inactive records are kept for audit but do not cover CAM generation.</small>
            </span>
            <ToggleSwitch v-model="form.isActive" />
          </label>
        </div>

        <div class="admin-inline-actions dialog-actions">
          <Button type="button" label="Cancel" severity="secondary" outlined @click="dialogVisible = false" />
          <Button type="submit" label="Save coverage" icon="pi pi-check" :loading="saving" :disabled="!form.flatId" />
        </div>
      </form>
    </Dialog>
  </div>
</template>
