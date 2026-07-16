<script setup lang="ts">
import type { DataTablePageEvent } from 'primevue/datatable'
import type { CamPaymentArrangement, FlatSummary } from '~/types/domain'
import type { StaffPermission } from '~/shared/permissions'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'CAM Payment Arrangements',
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

type ArrangementResponse = PaginatedResponse<CamPaymentArrangement>
type FlatsResponse = PaginatedResponse<FlatSummary>
type SaveResponse = { ok: true; data: { id: string; syncedDueCount?: number; deleted?: boolean } }

const api = useApi()
const toast = useToast()
const authStore = useAuthStore()
const confirmAction = useAppConfirm()

const hasPermission = (permission: StaffPermission) =>
  authStore.me?.user.permissions.includes(permission) ?? false

const canManageBilling = computed(() => hasPermission('billing.manage'))

const todayDate = () => new Date().toISOString().slice(0, 10)

const formatDate = (value: string | null | undefined) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
        dateStyle: 'medium',
      })
    : '-'

const dayLabel = (day: number) => {
  const suffix = day % 100 >= 11 && day % 100 <= 13
    ? 'th'
    : day % 10 === 1
      ? 'st'
      : day % 10 === 2
        ? 'nd'
        : day % 10 === 3
          ? 'rd'
          : 'th'
  return `${day}${suffix}`
}

const query = reactive({
  page: 1,
  pageSize: 50,
  search: '',
  state: 'active',
  sortBy: 'effectiveFrom',
  sortDirection: 'desc',
})

const buildArrangementQuery = () => ({
  page: query.page,
  pageSize: query.pageSize,
  search: query.search || undefined,
  state: query.state || undefined,
  sortBy: query.sortBy,
  sortDirection: query.sortDirection,
})

const [
  arrangementsAsyncData,
  flatsAsyncData,
] = await Promise.all([
  useAsyncData(
    'admin-cam-payment-arrangements',
    () => api<ArrangementResponse>('/api/admin/billing/cam-payment-arrangements', {
      query: buildArrangementQuery(),
    }),
    { watch: [query] },
  ),
  useAsyncData('cam-payment-arrangement-flat-options', () =>
    api<FlatsResponse>('/api/admin/flats', {
      query: { page: 1, pageSize: 2000, sortBy: 'flatNumber', sortDirection: 'asc', isActive: 'true' },
    }),
  ),
])

const { data, pending, refresh } = arrangementsAsyncData
const { data: flatsData } = flatsAsyncData

const arrangements = computed(() => data.value?.data.items ?? [])
const totalRecords = computed(() => data.value?.data.total ?? 0)
const flatOptions = computed(() =>
  (flatsData.value?.data.items ?? []).map((flat) => ({
    label: `${flat.blockName} ${flat.flatNumber} - ${flat.unitType}`,
    value: flat.id,
  })),
)

const stateOptions = [
  { label: 'Active records', value: 'active' },
  { label: 'Currently effective', value: 'current' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Expired', value: 'expired' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'All records', value: '' },
]

const form = reactive({
  id: '',
  flatId: '',
  penaltyFreeUntilDay: 26,
  effectiveFrom: todayDate(),
  effectiveUntil: '',
  reason: '',
  reference: '',
  isActive: true,
})

const dialogVisible = ref(false)
const saving = ref(false)
const editingArrangement = computed(() => Boolean(form.id))

const resetForm = () => {
  form.id = ''
  form.flatId = ''
  form.penaltyFreeUntilDay = 26
  form.effectiveFrom = todayDate()
  form.effectiveUntil = ''
  form.reason = ''
  form.reference = ''
  form.isActive = true
}

const openCreateDialog = () => {
  resetForm()
  dialogVisible.value = true
}

const editArrangement = (arrangement: CamPaymentArrangement) => {
  form.id = arrangement.id
  form.flatId = arrangement.flatId
  form.penaltyFreeUntilDay = arrangement.penaltyFreeUntilDay
  form.effectiveFrom = arrangement.effectiveFrom
  form.effectiveUntil = arrangement.effectiveUntil ?? ''
  form.reason = arrangement.reason
  form.reference = arrangement.reference ?? ''
  form.isActive = arrangement.isActive
  dialogVisible.value = true
}

const saveArrangement = async () => {
  if (!canManageBilling.value || !form.flatId || !form.reason.trim()) return
  saving.value = true

  try {
    const body = {
      flatId: form.flatId,
      penaltyFreeUntilDay: form.penaltyFreeUntilDay,
      effectiveFrom: form.effectiveFrom,
      effectiveUntil: form.effectiveUntil || null,
      reason: form.reason,
      reference: form.reference || null,
      isActive: form.isActive,
    }
    const response = editingArrangement.value
      ? await api<SaveResponse>(`/api/admin/billing/cam-payment-arrangements/${form.id}`, {
          method: 'PATCH',
          body,
        })
      : await api<SaveResponse>('/api/admin/billing/cam-payment-arrangements', {
          method: 'POST',
          body,
        })

    toast.add({
      severity: 'success',
      summary: editingArrangement.value ? 'Arrangement updated' : 'Arrangement added',
      detail: `${response.data.syncedDueCount ?? 0} open CAM due${response.data.syncedDueCount === 1 ? '' : 's'} recalculated.`,
      life: 7000,
    })
    dialogVisible.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

const revokeArrangement = async (arrangement: CamPaymentArrangement) => {
  if (!canManageBilling.value) return
  const confirmed = await confirmAction({
    header: 'Revoke arrangement?',
    message: `Revoke the CAM payment arrangement for ${arrangement.blockName} ${arrangement.flatNumber}? Open CAM dues for this flat will be recalculated with normal late-fee rules.`,
    icon: 'pi pi-calendar-times',
    acceptLabel: 'Revoke',
    acceptSeverity: 'danger',
  })

  if (!confirmed) return

  const response = await api<SaveResponse>(`/api/admin/billing/cam-payment-arrangements/${arrangement.id}`, {
    method: 'DELETE',
  })
  toast.add({
    severity: 'success',
    summary: 'Arrangement revoked',
    detail: `${response.data.syncedDueCount ?? 0} open CAM due${response.data.syncedDueCount === 1 ? '' : 's'} recalculated.`,
    life: 7000,
  })
  await refresh()
}

const resetFilters = () => {
  query.page = 1
  query.search = ''
  query.state = 'active'
}

const summary = computed(() => {
  const rows = arrangements.value
  return {
    activeCount: rows.filter((item) => item.isActive && !item.revokedAt).length,
    currentCount: rows.filter((item) =>
      item.isActive &&
      !item.revokedAt &&
      item.effectiveFrom <= todayDate() &&
      (!item.effectiveUntil || item.effectiveUntil >= todayDate()),
    ).length,
    openEndedCount: rows.filter((item) => item.isActive && !item.effectiveUntil).length,
  }
})
</script>

<template>
  <div class="landing-page">
    <section class="billing-command-panel">
      <header class="billing-command-header">
        <div>
          <p class="eyebrow">CAM billing</p>
          <h1>Payment arrangements</h1>
          <p>
            Approved flats can keep the standard CAM due date while late fees start
            after their agreed payment day.
          </p>
        </div>
        <div class="billing-command-actions">
          <Button
            label="Add arrangement"
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
          <span>Currently effective</span>
          <strong>{{ summary.currentCount }}</strong>
          <p>Based on today's date</p>
        </div>
        <div>
          <span>Open-ended</span>
          <strong>{{ summary.openEndedCount }}</strong>
          <p>No expiry date set</p>
        </div>
      </div>
    </section>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Arrangement register</h1>
          <p>These records apply only to CAM dues.</p>
        </div>
        <div class="list-page__exports">
          <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined @click="() => refresh()" />
          <Button
            label="Clear filters"
            icon="pi pi-filter-slash"
            severity="secondary"
            outlined
            :disabled="!query.search && query.state === 'active'"
            @click="resetFilters"
          />
        </div>
      </header>

      <div class="list-page__toolbar">
        <label class="list-page__search">
          <span class="field-label">Search</span>
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="query.search" placeholder="Flat, tower, resident, reason" />
          </IconField>
        </label>
        <div class="list-page__filters">
          <label>
            <span class="field-label">State</span>
            <Select v-model="query.state" :options="stateOptions" option-label="label" option-value="value" />
          </label>
        </div>
      </div>

      <AppDataTable
        :value="arrangements"
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
        <Column field="penaltyFreeUntilDay" header="No late fee through">
          <template #body="{ data: row }">
            <strong>{{ dayLabel(row.penaltyFreeUntilDay) }}</strong>
            <p class="table-muted">Late fee starts next day</p>
          </template>
        </Column>
        <Column field="effectiveFrom" header="Effective">
          <template #body="{ data: row }">
            <strong>{{ formatDate(row.effectiveFrom) }}</strong>
            <p class="table-muted">Until {{ formatDate(row.effectiveUntil) }}</p>
          </template>
        </Column>
        <Column field="reason" header="Approval">
          <template #body="{ data: row }">
            <span>{{ row.reason }}</span>
            <p class="table-muted">{{ row.reference || 'No reference' }}</p>
          </template>
        </Column>
        <Column field="isActive" header="State">
          <template #body="{ data: row }">
            <Tag
              :value="row.isActive && !row.revokedAt ? 'Active' : 'Inactive'"
              :severity="row.isActive && !row.revokedAt ? 'success' : 'secondary'"
            />
          </template>
        </Column>
        <Column header="Actions">
          <template #body="{ data: row }">
            <div class="row-actions">
              <Button
                icon="pi pi-pencil"
                text
                rounded
                :disabled="!canManageBilling"
                title="Edit arrangement"
                @click="editArrangement(row)"
              />
              <Button
                icon="pi pi-ban"
                text
                rounded
                severity="danger"
                :disabled="!canManageBilling || !row.isActive"
                title="Revoke arrangement"
                @click="revokeArrangement(row)"
              />
            </div>
          </template>
        </Column>
      </AppDataTable>
    </section>

    <Dialog
      v-model:visible="dialogVisible"
      modal
      :header="editingArrangement ? 'Edit arrangement' : 'Add arrangement'"
      :style="{ width: 'min(94vw, 720px)' }"
    >
      <form class="form-grid" @submit.prevent="saveArrangement">
        <label>
          <span class="field-label">Flat <span class="required-marker">*</span></span>
          <Select
            v-model="form.flatId"
            :options="flatOptions"
            option-label="label"
            option-value="value"
            filter
            placeholder="Choose flat"
            required
          />
        </label>
        <label>
          <span class="field-label">No late fee through day <span class="required-marker">*</span></span>
          <InputNumber v-model="form.penaltyFreeUntilDay" :min="1" :max="31" suffix=" day" fluid />
        </label>
        <label>
          <span class="field-label">Effective from <span class="required-marker">*</span></span>
          <InputText v-model="form.effectiveFrom" type="date" required />
        </label>
        <label>
          <span class="field-label">Effective until</span>
          <InputText v-model="form.effectiveUntil" type="date" />
        </label>
        <label class="form-grid__wide">
          <span class="field-label">Reason <span class="required-marker">*</span></span>
          <Textarea v-model="form.reason" rows="3" auto-resize required />
        </label>
        <label class="form-grid__wide">
          <span class="field-label">Approval reference</span>
          <InputText v-model="form.reference" placeholder="Committee minutes, email, or note number" />
        </label>
        <label class="toggle-row form-grid__wide">
          <span>
            <strong>Active</strong>
            <small>Inactive records will not affect CAM dues.</small>
          </span>
          <ToggleSwitch v-model="form.isActive" />
        </label>
        <footer class="dialog-actions form-grid__wide">
          <Button type="button" label="Cancel" severity="secondary" outlined @click="dialogVisible = false" />
          <Button type="submit" label="Save arrangement" icon="pi pi-save" :loading="saving" :disabled="!canManageBilling" />
        </footer>
      </form>
    </Dialog>
  </div>
</template>
