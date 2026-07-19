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
const validationAttempted = ref(false)
const editingArrangement = computed(() => Boolean(form.id))

type ArrangementFormField =
  | 'flatId'
  | 'penaltyFreeUntilDay'
  | 'effectiveFrom'
  | 'effectiveUntil'
  | 'reason'
  | 'reference'

const formErrors = computed<Partial<Record<ArrangementFormField, string>>>(() => {
  const errors: Partial<Record<ArrangementFormField, string>> = {}

  if (!form.flatId) errors.flatId = 'Flat is required.'
  if (!Number.isInteger(form.penaltyFreeUntilDay) || form.penaltyFreeUntilDay < 1 || form.penaltyFreeUntilDay > 31) {
    errors.penaltyFreeUntilDay = 'Enter a day from 1 to 31.'
  }
  if (!form.effectiveFrom) errors.effectiveFrom = 'First monthly CAM due is required.'
  if (form.effectiveUntil && form.effectiveFrom && form.effectiveUntil < form.effectiveFrom) {
    errors.effectiveUntil = 'Last monthly CAM due cannot be before the first one.'
  }

  const reason = form.reason.trim()
  if (!reason) errors.reason = 'Reason is required.'
  else if (reason.length < 2) errors.reason = 'Reason must contain at least 2 characters.'
  else if (reason.length > 500) errors.reason = 'Reason cannot exceed 500 characters.'

  if (form.reference.trim().length > 200) {
    errors.reference = 'Approval reference cannot exceed 200 characters.'
  }

  return errors
})

const formFieldError = (field: ArrangementFormField) =>
  validationAttempted.value ? formErrors.value[field] ?? '' : ''

const resetForm = () => {
  validationAttempted.value = false
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
  validationAttempted.value = false
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
  if (!canManageBilling.value) return

  validationAttempted.value = true
  if (Object.keys(formErrors.value).length > 0) {
    toast.add({
      severity: 'warn',
      summary: 'Complete required fields',
      detail: 'Check the highlighted fields before saving the arrangement.',
      life: 5000,
    })
    return
  }

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
      <form class="admin-form-layout" @submit.prevent="saveArrangement">
        <div class="admin-form-grid">
          <small class="field-help admin-form-grid__full">
            Fields marked <span class="required-marker">*</span> are required.
          </small>
          <label class="admin-form-grid__full">
            <span class="field-label">Flat <span class="required-marker">*</span></span>
            <Select
              v-model="form.flatId"
              :options="flatOptions"
              option-label="label"
              option-value="value"
              filter
              placeholder="Choose flat"
              required
              :invalid="Boolean(formFieldError('flatId'))"
            />
            <small v-if="formFieldError('flatId')" class="field-error">{{ formFieldError('flatId') }}</small>
          </label>
          <label class="admin-form-grid__full">
            <span class="field-label">Last day to pay without a late fee <span class="required-marker">*</span></span>
            <InputNumber
              v-model="form.penaltyFreeUntilDay"
              :min="1"
              :max="31"
              required
              fluid
              :invalid="Boolean(formFieldError('penaltyFreeUntilDay'))"
            />
            <small class="field-help">
              Enter a day of the month. The normal CAM due date remains the 10th; this arrangement only extends the fee-free payment period.
            </small>
            <small v-if="formFieldError('penaltyFreeUntilDay')" class="field-error">
              {{ formFieldError('penaltyFreeUntilDay') }}
            </small>
          </label>
          <Message severity="info" :closable="false" class="admin-form-grid__full">
            <strong>Example:</strong> If you enter 26 and cover CAM dues from 10 Jul 2026 through 10 Sep 2026, the July, August, and September CAM dues can each be paid through the 26th of their month without a late fee. Late fees start on the 27th.
          </Message>
          <label>
            <span class="field-label">First monthly CAM due covered <span class="required-marker">*</span></span>
            <InputText
              v-model="form.effectiveFrom"
              type="date"
              required
              :invalid="Boolean(formFieldError('effectiveFrom'))"
            />
            <small class="field-help">
              Choose the 10th of the first month to include. For example, 10 Jul 2026 includes the July CAM due.
            </small>
            <small v-if="formFieldError('effectiveFrom')" class="field-error">
              {{ formFieldError('effectiveFrom') }}
            </small>
          </label>
          <label>
            <span class="field-label">Last monthly CAM due covered (optional)</span>
            <InputText
              v-model="form.effectiveUntil"
              type="date"
              :invalid="Boolean(formFieldError('effectiveUntil'))"
            />
            <small class="field-help">
              Choose the 10th of the final month to include. Leave blank to include every future CAM month.
            </small>
            <small v-if="formFieldError('effectiveUntil')" class="field-error">
              {{ formFieldError('effectiveUntil') }}
            </small>
          </label>
          <label class="admin-form-grid__full">
            <span class="field-label">Reason <span class="required-marker">*</span></span>
            <Textarea
              v-model="form.reason"
              rows="3"
              auto-resize
              required
              maxlength="500"
              :invalid="Boolean(formFieldError('reason'))"
            />
            <small v-if="formFieldError('reason')" class="field-error">{{ formFieldError('reason') }}</small>
          </label>
          <label class="admin-form-grid__full">
            <span class="field-label">Approval reference (optional)</span>
            <InputText
              v-model="form.reference"
              maxlength="200"
              placeholder="Committee minutes, email, or note number"
              :invalid="Boolean(formFieldError('reference'))"
            />
            <small v-if="formFieldError('reference')" class="field-error">
              {{ formFieldError('reference') }}
            </small>
          </label>
          <label class="admin-toggle-card admin-form-grid__full">
            <span class="field-label">Apply this arrangement</span>
            <small class="field-help">
              On: CAM dues in the date range above use this late-fee arrangement. Off: normal late-fee rules apply, and this record is kept for history.
            </small>
            <ToggleSwitch v-model="form.isActive" />
          </label>
        </div>
        <div class="admin-inline-actions dialog-actions">
          <Button type="button" label="Cancel" severity="secondary" outlined @click="dialogVisible = false" />
          <Button type="submit" label="Save arrangement" icon="pi pi-save" :loading="saving" :disabled="!canManageBilling" />
        </div>
      </form>
    </Dialog>
  </div>
</template>
