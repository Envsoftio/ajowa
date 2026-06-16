<script setup lang="ts">
import type {
  BillingChargeConfig,
  BillingFrequency,
  BillingPeriod,
  ChargeBreakdownItem,
  DueGenerationPreview,
  FlatSummary,
} from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Billing Periods',
})

type PeriodResponse = {
  ok: true
  data: { items: BillingPeriod[]; total: number }
}
type ChargeResponse = { ok: true; data: BillingChargeConfig }
type FlatsResponse = { ok: true; data: { items: FlatSummary[] } }
type PreviewResponse = {
  ok: true
  data: DueGenerationPreview & { skippedExisting: number; isLocked: boolean }
}

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

const periodQuery = reactive({
  page: 1,
  pageSize: 50,
  search: '',
  status: '',
  frequency: '',
})

const loadPeriods = () =>
  api<PeriodResponse>('/api/admin/billing/periods', {
    query: {
      page: periodQuery.page,
      pageSize: periodQuery.pageSize,
      search: periodQuery.search || undefined,
      status: periodQuery.status || undefined,
      frequency: periodQuery.frequency || undefined,
      sortBy: 'startDate',
      sortDirection: 'desc',
    },
  })

const {
  data: periodsData,
  pending: periodsPending,
  refresh: refreshPeriods,
} = await useAsyncData('admin-billing-periods', loadPeriods, {
  watch: [periodQuery],
})

const {
  data: chargeData,
  pending: chargePending,
  refresh: refreshCharges,
} = await useAsyncData('admin-billing-charges', () =>
  api<ChargeResponse>('/api/admin/billing/charges'),
)

const { data: flatsData } = await useAsyncData('billing-flat-options', () =>
  api<FlatsResponse>('/api/admin/flats', {
    query: {
      page: 1,
      pageSize: 2000,
      sortBy: 'flatNumber',
      sortDirection: 'asc',
    },
  }),
)

const periods = computed(() => periodsData.value?.data.items ?? [])
const chargeConfig = computed(() => chargeData.value?.data)
const flatOptions = computed(() =>
  (flatsData.value?.data.items ?? []).map((flat) => ({
    label: `${flat.blockName} ${flat.flatNumber} · ${flat.unitType}`,
    value: flat.id,
    flatNumber: flat.flatNumber,
    blockName: flat.blockName,
  })),
)

const summary = computed(() => {
  const items = periods.value
  const dueCount = items.reduce((sum, item) => sum + (item.dueCount ?? 0), 0)
  const unpaidDueCount = items.reduce(
    (sum, item) => sum + (item.unpaidDueCount ?? 0),
    0,
  )

  return {
    total: periodsData.value?.data.total ?? 0,
    open: items.filter((item) => !item.isLocked).length,
    locked: items.filter((item) => item.isLocked).length,
    dueCount,
    unpaidDueCount,
  }
})

const frequencyOptions = [
  { label: 'Monthly', value: 'MONTHLY' },
  { label: 'Quarterly', value: 'QUARTERLY' },
  { label: 'Half yearly', value: 'HALF_YEARLY' },
  { label: 'Yearly', value: 'YEARLY' },
  { label: 'Custom', value: 'CUSTOM' },
]

const periodDialogVisible = ref(false)
const selectedPeriod = ref<BillingPeriod | null>(null)
const savingPeriod = ref(false)
const periodForm = reactive({
  label: '',
  frequency: 'MONTHLY' as BillingFrequency,
  startDate: '',
  endDate: '',
  dueDate: '',
})

const resetPeriodForm = () => {
  selectedPeriod.value = null
  periodForm.label = ''
  periodForm.frequency = 'MONTHLY'
  periodForm.startDate = ''
  periodForm.endDate = ''
  periodForm.dueDate = ''
}

const openCreatePeriod = () => {
  resetPeriodForm()
  periodDialogVisible.value = true
}

const editPeriod = (period: BillingPeriod) => {
  selectedPeriod.value = period
  periodForm.label = period.label
  periodForm.frequency = period.frequency
  periodForm.startDate = period.startDate
  periodForm.endDate = period.endDate
  periodForm.dueDate = period.dueDate
  periodDialogVisible.value = true
}

const savePeriod = async () => {
  savingPeriod.value = true

  try {
    if (selectedPeriod.value) {
      await api(`/api/admin/billing/periods/${selectedPeriod.value.id}`, {
        method: 'PATCH',
        body: periodForm,
      })
    } else {
      await api('/api/admin/billing/periods', {
        method: 'POST',
        body: periodForm,
      })
    }

    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: 'Billing period saved.',
      life: 3000,
    })
    periodDialogVisible.value = false
    resetPeriodForm()
    await refreshPeriods()
  } finally {
    savingPeriod.value = false
  }
}

const lockDialogVisible = ref(false)
const lockTarget = ref<BillingPeriod | null>(null)
const lockReason = ref('')
const locking = ref(false)

const openLockDialog = (period: BillingPeriod) => {
  lockTarget.value = period
  lockReason.value = period.lockReason ?? ''
  lockDialogVisible.value = true
}

const toggleLock = async () => {
  if (!lockTarget.value) return
  locking.value = true

  try {
    await api(`/api/admin/billing/periods/${lockTarget.value.id}`, {
      method: 'PATCH',
      body: {
        isLocked: !lockTarget.value.isLocked,
        lockReason: !lockTarget.value.isLocked ? lockReason.value : null,
      },
    })
    toast.add({
      severity: 'success',
      summary: 'Updated',
      detail: 'Lock state changed.',
      life: 3000,
    })
    lockDialogVisible.value = false
    await refreshPeriods()
  } finally {
    locking.value = false
  }
}

const generationDialogVisible = ref(false)
const generationTarget = ref<BillingPeriod | null>(null)
const selectedFlatIds = ref<string[]>([])
const generationPreview = ref<PreviewResponse['data'] | null>(null)
const previewLoading = ref(false)
const generating = ref(false)

const openGenerationDialog = async (period: BillingPeriod) => {
  generationTarget.value = period
  selectedFlatIds.value = []
  generationDialogVisible.value = true
  await loadGenerationPreview()
}

const loadGenerationPreview = async () => {
  if (!generationTarget.value) return
  previewLoading.value = true

  try {
    const response = await api<PreviewResponse>(
      '/api/admin/billing/dues/preview',
      {
        query: {
          billingPeriodId: generationTarget.value.id,
          flatIds: selectedFlatIds.value.length
            ? selectedFlatIds.value.join(',')
            : undefined,
        },
      },
    )
    generationPreview.value = response.data
  } finally {
    previewLoading.value = false
  }
}

watch(selectedFlatIds, () => loadGenerationPreview())

const generateDues = async () => {
  if (!generationTarget.value) return
  generating.value = true

  try {
    const response = await api<{
      ok: true
      data: { generated: number; skipped: number }
    }>('/api/admin/billing/dues', {
      method: 'POST',
      body: {
        billingPeriodId: generationTarget.value.id,
        flatIds: selectedFlatIds.value.length
          ? selectedFlatIds.value
          : undefined,
      },
    })
    toast.add({
      severity: 'success',
      summary: 'Dues generated',
      detail: `${response.data.generated} created, ${response.data.skipped} skipped.`,
      life: 4000,
    })
    generationDialogVisible.value = false
    await refreshPeriods()
  } finally {
    generating.value = false
  }
}

const chargeForm = reactive({
  graceDays: 0,
  lateFeePerDay: 50,
  billingTenure: 'MONTHLY' as BillingFrequency,
  excessPaymentHandling:
    'KEEP_AS_ADVANCE' as BillingChargeConfig['excessPaymentHandling'],
  defaultCharges: [] as ChargeBreakdownItem[],
  flatTypeCharges: [] as BillingChargeConfig['flatTypeCharges'],
  flatOverrideCharges: [] as BillingChargeConfig['flatOverrideCharges'],
})

watch(
  chargeConfig,
  (config) => {
    if (!config) return
    chargeForm.graceDays = config.graceDays
    chargeForm.lateFeePerDay = config.lateFeePerDay
    chargeForm.billingTenure = config.billingTenure
    chargeForm.excessPaymentHandling = config.excessPaymentHandling
    chargeForm.defaultCharges = config.defaultCharges.map((item) => ({
      ...item,
    }))
    chargeForm.flatTypeCharges = config.flatTypeCharges.map((item) => ({
      flatType: item.flatType,
      label: item.label,
      charges: item.charges.map((charge) => ({ ...charge })),
    }))
    chargeForm.flatOverrideCharges = config.flatOverrideCharges.map((item) => ({
      flatId: item.flatId,
      flatNumber: item.flatNumber,
      blockName: item.blockName,
      charges: item.charges.map((charge) => ({ ...charge })),
    }))
  },
  { immediate: true },
)

const addCharge = (charges: ChargeBreakdownItem[]) => {
  charges.push({ label: '', amount: 0 })
}

const removeCharge = (charges: ChargeBreakdownItem[], index: number) => {
  charges.splice(index, 1)
}

const addFlatTypeConfig = () => {
  chargeForm.flatTypeCharges.push({
    flatType: '',
    label: 'Unit type charge',
    charges: [{ label: 'Maintenance Charges', amount: 0 }],
  })
}

const addFlatOverride = () => {
  chargeForm.flatOverrideCharges.push({
    flatId: '',
    flatNumber: '',
    blockName: '',
    charges: [{ label: 'Maintenance Charges', amount: 0 }],
  })
}

const syncFlatOverrideLabel = (index: number) => {
  const override = chargeForm.flatOverrideCharges[index]
  if (!override) return
  const flat = flatOptions.value.find((item) => item.value === override.flatId)
  override.flatNumber = flat?.flatNumber ?? ''
  override.blockName = flat?.blockName ?? ''
}

const savingCharges = ref(false)

const saveCharges = async () => {
  savingCharges.value = true

  try {
    await api('/api/admin/billing/charges', {
      method: 'PUT',
      body: chargeForm,
    })
    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: 'Charge configuration updated.',
      life: 3000,
    })
    await refreshCharges()
  } finally {
    savingCharges.value = false
  }
}
</script>

<template>
  <div class="landing-page">
    <div class="surface-grid">
      <section class="surface-card">
        <p class="eyebrow">Periods</p>
        <h3>{{ summary.total }}</h3>
        <p>{{ summary.open }} open and {{ summary.locked }} locked.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Generated</p>
        <h3>{{ summary.dueCount }}</h3>
        <p>Dues generated across visible periods.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Outstanding</p>
        <h3>{{ summary.unpaidDueCount }}</h3>
        <p>Open, partially paid, or overdue due rows.</p>
      </section>
    </div>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Billing periods</h1>
          <p>
            Create periods, lock completed cycles, and generate flat-wise dues.
          </p>
        </div>
        <div class="list-page__exports">
          <Button
            label="Create period"
            icon="pi pi-plus"
            @click="openCreatePeriod"
          />
        </div>
      </header>

      <div class="admin-page-guide">
        <h2>How to use this page</h2>
        <p>
          Use this page to define the society billing cycle before dues are
          created for flats.
        </p>
        <ol>
          <li>
            Confirm the charge configuration first, because generated dues use
            the active charge rules.
          </li>
          <li>
            Create a billing period with start, end, and due dates for the
            cycle.
          </li>
          <li>
            Use the lightning action to preview and generate dues for all active
            flats or selected flats.
          </li>
          <li>
            Lock the period after review so later corrections are intentional
            and audited.
          </li>
        </ol>
      </div>

      <div class="list-page__toolbar">
        <label class="list-page__search">
          <span class="field-label">
            Search
            <i
              class="pi pi-info-circle"
              title="Find billing periods by their visible label."
              aria-label="Find billing periods by their visible label."
            />
          </span>
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText
              v-model="periodQuery.search"
              placeholder="Search by period label"
            />
          </IconField>
        </label>
        <div class="list-page__filters">
          <label>
            <span class="field-label">
              State
              <i
                class="pi pi-info-circle"
                title="Show all periods, only editable open periods, or locked periods."
                aria-label="Show all periods, only editable open periods, or locked periods."
              />
            </span>
            <Select
              v-model="periodQuery.status"
              :options="[
                { label: 'All states', value: '' },
                { label: 'Open', value: 'open' },
                { label: 'Locked', value: 'locked' },
              ]"
              option-label="label"
              option-value="value"
              placeholder="State"
            />
          </label>
          <label>
            <span class="field-label">
              Tenure
              <i
                class="pi pi-info-circle"
                title="Filter periods by billing frequency, such as monthly or quarterly."
                aria-label="Filter periods by billing frequency, such as monthly or quarterly."
              />
            </span>
            <Select
              v-model="periodQuery.frequency"
              :options="[
                { label: 'All tenures', value: '' },
                ...frequencyOptions,
              ]"
              option-label="label"
              option-value="value"
              placeholder="Tenure"
            />
          </label>
        </div>
      </div>

      <DataTable
        :value="periods"
        :loading="periodsPending"
        responsive-layout="scroll"
        class="list-page__table"
        data-key="id"
      >
        <Column field="label" header="Period" />
        <Column field="frequency" header="Tenure">
          <template #body="{ data: row }">
            <span>{{
              frequencyOptions.find((item) => item.value === row.frequency)
                ?.label ?? row.frequency
            }}</span>
          </template>
        </Column>
        <Column header="Dates">
          <template #body="{ data: row }">
            <span
              >{{ formatDate(row.startDate) }} -
              {{ formatDate(row.endDate) }}</span
            >
          </template>
        </Column>
        <Column field="dueDate" header="Due date">
          <template #body="{ data: row }">
            <span>{{ formatDate(row.dueDate) }}</span>
          </template>
        </Column>
        <Column field="dueCount" header="Dues" />
        <Column field="unpaidDueCount" header="Unpaid" />
        <Column field="status" header="Status">
          <template #body="{ data: row }">
            <AppStatusBadge :status="row.isLocked ? 'locked' : 'open'" />
          </template>
        </Column>
        <Column header="Actions" style="width: 210px">
          <template #body="{ data: row }">
            <div class="admin-inline-actions">
              <Button
                icon="pi pi-bolt"
                text
                rounded
                severity="secondary"
                aria-label="Generate preview for period"
                title="Generate preview for period"
                @click="openGenerationDialog(row)"
              />
              <Button
                icon="pi pi-pencil"
                text
                rounded
                severity="secondary"
                :disabled="row.isLocked"
                aria-label="Edit billing period"
                title="Edit billing period"
                @click="editPeriod(row)"
              />
              <Button
                :icon="row.isLocked ? 'pi pi-lock-open' : 'pi pi-lock'"
                text
                rounded
                severity="secondary"
                :aria-label="row.isLocked ? 'Unlock period' : 'Lock period'"
                :title="row.isLocked ? 'Unlock period' : 'Lock period'"
                @click="openLockDialog(row)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </section>

    <section class="surface-card admin-form-layout">
      <header class="list-page__header">
        <div>
          <h1>Charge configuration</h1>
          <p>
            Set default charges, unit-type templates, flat overrides, grace
            days, and late fee rules.
          </p>
        </div>
        <div class="list-page__exports">
          <Button
            label="Save charges"
            icon="pi pi-save"
            :loading="savingCharges"
            @click="saveCharges"
          />
        </div>
      </header>

      <div class="admin-page-guide">
        <h2>How charge rules are applied</h2>
        <p>
          When dues are generated, the system chooses the most specific matching
          charge rule.
        </p>
        <ol>
          <li>Flat overrides are used first for selected flats.</li>
          <li>Unit-type charges are used next for matching flat types.</li>
          <li>Default charges are used when no specific rule exists.</li>
        </ol>
      </div>

      <AppSkeletonState v-if="chargePending" />
      <form v-else class="admin-form-layout" @submit.prevent="saveCharges">
        <div class="admin-form-grid">
          <label>
            <span class="field-label">
              Billing tenure pack
              <i
                class="pi pi-info-circle"
                title="Default billing frequency used when preparing maintenance cycles."
                aria-label="Default billing frequency used when preparing maintenance cycles."
              />
            </span>
            <Select
              v-model="chargeForm.billingTenure"
              :options="frequencyOptions"
              option-label="label"
              option-value="value"
            />
          </label>
          <label>
            <span class="field-label">
              Excess payment policy
              <i
                class="pi pi-info-circle"
                title="Decides what to do when a resident pays more than the balance amount."
                aria-label="Decides what to do when a resident pays more than the balance amount."
              />
            </span>
            <Select
              v-model="chargeForm.excessPaymentHandling"
              :options="[
                { label: 'Keep as advance', value: 'KEEP_AS_ADVANCE' },
                { label: 'Refund', value: 'REFUND' },
                { label: 'Manual review', value: 'MANUAL_REVIEW' },
              ]"
              option-label="label"
              option-value="value"
            />
          </label>
          <label>
            <span class="field-label">
              Grace days
              <i
                class="pi pi-info-circle"
                title="Number of days after the due date before late fee calculation starts."
                aria-label="Number of days after the due date before late fee calculation starts."
              />
            </span>
            <InputNumber v-model="chargeForm.graceDays" :min="0" fluid />
          </label>
          <label>
            <span class="field-label">
              Late fee per day
              <i
                class="pi pi-info-circle"
                title="Daily late fee added after grace days expire for unpaid balances."
                aria-label="Daily late fee added after grace days expire for unpaid balances."
              />
            </span>
            <InputNumber v-model="chargeForm.lateFeePerDay" :min="0" fluid />
          </label>
        </div>

        <div class="admin-charge-section">
          <div class="admin-form-section__header">
            <div>
              <h2>Default charges</h2>
              <p>Used when no unit-type or flat override exists.</p>
            </div>
            <Button
              type="button"
              label="Add charge"
              icon="pi pi-plus"
              severity="secondary"
              outlined
              @click="addCharge(chargeForm.defaultCharges)"
            />
          </div>
          <div
            v-for="(charge, index) in chargeForm.defaultCharges"
            :key="index"
            class="admin-charge-row"
          >
            <label>
              <span class="field-label">
                Charge label
                <i
                  class="pi pi-info-circle"
                  title="Name shown in the resident charge breakdown, such as Maintenance Charges."
                  aria-label="Name shown in the resident charge breakdown, such as Maintenance Charges."
                />
              </span>
              <InputText v-model="charge.label" placeholder="Charge label" />
            </label>
            <label>
              <span class="field-label">
                Amount
                <i
                  class="pi pi-info-circle"
                  title="Amount charged for this line item in the billing period."
                  aria-label="Amount charged for this line item in the billing period."
                />
              </span>
              <InputNumber v-model="charge.amount" :min="0" fluid />
            </label>
            <Button
              type="button"
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              :aria-label="`Remove default charge ${charge.label || 'item'}`"
              :title="`Remove default charge ${charge.label || 'item'}`"
              @click="removeCharge(chargeForm.defaultCharges, index)"
            />
          </div>
        </div>

        <div class="admin-charge-section">
          <div class="admin-form-section__header">
            <div>
              <h2>Unit-type charges</h2>
              <p>Overrides default charges for matching flat unit types.</p>
            </div>
            <Button
              type="button"
              label="Add unit type"
              icon="pi pi-plus"
              severity="secondary"
              outlined
              @click="addFlatTypeConfig"
            />
          </div>
          <div
            v-for="(config, configIndex) in chargeForm.flatTypeCharges"
            :key="configIndex"
            class="admin-charge-card"
          >
            <div class="admin-form-section__header">
              <label>
                <span class="field-label">
                  Unit type
                  <i
                    class="pi pi-info-circle"
                    title="Flat unit type this charge template applies to, for example 2BHK."
                    aria-label="Flat unit type this charge template applies to, for example 2BHK."
                  />
                </span>
                <InputText
                  v-model="config.flatType"
                  placeholder="Unit type, e.g. 2BHK"
                />
              </label>
              <Button
                type="button"
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                :aria-label="`Remove ${config.flatType || 'unit type'} charge template`"
                :title="`Remove ${config.flatType || 'unit type'} charge template`"
                @click="chargeForm.flatTypeCharges.splice(configIndex, 1)"
              />
            </div>
            <div
              v-for="(charge, chargeIndex) in config.charges"
              :key="chargeIndex"
              class="admin-charge-row"
            >
              <label>
                <span class="field-label">
                  Charge label
                  <i
                    class="pi pi-info-circle"
                    title="Name shown in the resident charge breakdown for this unit type."
                    aria-label="Name shown in the resident charge breakdown for this unit type."
                  />
                </span>
                <InputText v-model="charge.label" placeholder="Charge label" />
              </label>
              <label>
                <span class="field-label">
                  Amount
                  <i
                    class="pi pi-info-circle"
                    title="Amount charged to flats matching this unit type."
                    aria-label="Amount charged to flats matching this unit type."
                  />
                </span>
                <InputNumber v-model="charge.amount" :min="0" fluid />
              </label>
              <Button
                type="button"
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                :aria-label="`Remove charge ${charge.label || 'item'}`"
                :title="`Remove charge ${charge.label || 'item'}`"
                @click="removeCharge(config.charges, chargeIndex)"
              />
            </div>
            <Button
              type="button"
              label="Add charge"
              icon="pi pi-plus"
              severity="secondary"
              outlined
              @click="addCharge(config.charges)"
            />
          </div>
        </div>

        <div class="admin-charge-section">
          <div class="admin-form-section__header">
            <div>
              <h2>Flat overrides</h2>
              <p>Highest-priority charge template for selected flats.</p>
            </div>
            <Button
              type="button"
              label="Add flat override"
              icon="pi pi-plus"
              severity="secondary"
              outlined
              @click="addFlatOverride"
            />
          </div>
          <div
            v-for="(config, configIndex) in chargeForm.flatOverrideCharges"
            :key="configIndex"
            class="admin-charge-card"
          >
            <div class="admin-form-section__header">
              <label>
                <span class="field-label">
                  Flat
                  <i
                    class="pi pi-info-circle"
                    title="Specific flat that should use this override instead of default or unit-type charges."
                    aria-label="Specific flat that should use this override instead of default or unit-type charges."
                  />
                </span>
                <Select
                  v-model="config.flatId"
                  :options="flatOptions"
                  option-label="label"
                  option-value="value"
                  filter
                  placeholder="Select flat"
                  @change="syncFlatOverrideLabel(configIndex)"
                />
              </label>
              <Button
                type="button"
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                :aria-label="`Remove flat override for ${config.flatNumber || 'selected flat'} charge template`"
                :title="`Remove flat override for ${config.flatNumber || 'selected flat'} charge template`"
                @click="chargeForm.flatOverrideCharges.splice(configIndex, 1)"
              />
            </div>
            <div
              v-for="(charge, chargeIndex) in config.charges"
              :key="chargeIndex"
              class="admin-charge-row"
            >
              <label>
                <span class="field-label">
                  Charge label
                  <i
                    class="pi pi-info-circle"
                    title="Name shown in the resident charge breakdown for this flat."
                    aria-label="Name shown in the resident charge breakdown for this flat."
                  />
                </span>
                <InputText v-model="charge.label" placeholder="Charge label" />
              </label>
              <label>
                <span class="field-label">
                  Amount
                  <i
                    class="pi pi-info-circle"
                    title="Amount charged to this selected flat for the line item."
                    aria-label="Amount charged to this selected flat for the line item."
                  />
                </span>
                <InputNumber v-model="charge.amount" :min="0" fluid />
              </label>
              <Button
                type="button"
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                :aria-label="`Remove charge ${charge.label || 'item'}`"
                :title="`Remove charge ${charge.label || 'item'}`"
                @click="removeCharge(config.charges, chargeIndex)"
              />
            </div>
            <Button
              type="button"
              label="Add charge"
              icon="pi pi-plus"
              severity="secondary"
              outlined
              @click="addCharge(config.charges)"
            />
          </div>
        </div>
      </form>
    </section>

    <Dialog
      v-model:visible="periodDialogVisible"
      :header="selectedPeriod ? 'Edit billing period' : 'Create billing period'"
      modal
      :style="{ width: '520px' }"
    >
      <form class="admin-form-layout" @submit.prevent="savePeriod">
        <div class="admin-page-guide">
          <h2>Billing period form</h2>
          <p>
            Create one row for each maintenance cycle. Dues are generated
            separately after the period is saved.
          </p>
        </div>
        <div class="admin-form-grid">
          <label class="admin-form-grid__full">
            <span class="field-label">
              Label
              <i
                class="pi pi-info-circle"
                title="Readable period name shown to admins and residents, such as June 2026."
                aria-label="Readable period name shown to admins and residents, such as June 2026."
              />
            </span>
            <InputText v-model="periodForm.label" required />
          </label>
          <label>
            <span class="field-label">
              Tenure
              <i
                class="pi pi-info-circle"
                title="Billing frequency for this period. It helps categorize monthly, quarterly, and custom cycles."
                aria-label="Billing frequency for this period. It helps categorize monthly, quarterly, and custom cycles."
              />
            </span>
            <Select
              v-model="periodForm.frequency"
              :options="frequencyOptions"
              option-label="label"
              option-value="value"
            />
          </label>
          <label>
            <span class="field-label">
              Start date
              <i
                class="pi pi-info-circle"
                title="First calendar date covered by this billing period."
                aria-label="First calendar date covered by this billing period."
              />
            </span>
            <InputText v-model="periodForm.startDate" type="date" required />
          </label>
          <label>
            <span class="field-label">
              End date
              <i
                class="pi pi-info-circle"
                title="Last calendar date covered by this billing period."
                aria-label="Last calendar date covered by this billing period."
              />
            </span>
            <InputText v-model="periodForm.endDate" type="date" required />
          </label>
          <label>
            <span class="field-label">
              Due date
              <i
                class="pi pi-info-circle"
                title="Payment deadline shown to residents. Late fees start after this date plus grace days."
                aria-label="Payment deadline shown to residents. Late fees start after this date plus grace days."
              />
            </span>
            <InputText v-model="periodForm.dueDate" type="date" required />
          </label>
        </div>
        <div class="admin-inline-actions dialog-actions">
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            outlined
            @click="periodDialogVisible = false"
          />
          <Button type="submit" label="Save period" :loading="savingPeriod" />
        </div>
      </form>
    </Dialog>

    <Dialog
      v-model:visible="lockDialogVisible"
      header="Billing period lock"
      modal
      :style="{ width: '480px' }"
    >
      <div class="admin-form-layout">
        <p>
          {{
            lockTarget?.isLocked
              ? 'Unlock this period for corrections.'
              : 'Lock this period to block later dues, payments, and journal writes.'
          }}
        </p>
        <label v-if="!lockTarget?.isLocked" class="admin-form-grid__full">
          <span class="field-label">
            Lock reason
            <i
              class="pi pi-info-circle"
              title="Short audit note explaining why the period is being locked."
              aria-label="Short audit note explaining why the period is being locked."
            />
          </span>
          <Textarea v-model="lockReason" rows="3" auto-resize />
        </label>
        <div class="admin-inline-actions dialog-actions">
          <Button
            label="Cancel"
            severity="secondary"
            outlined
            @click="lockDialogVisible = false"
          />
          <Button
            :label="lockTarget?.isLocked ? 'Unlock period' : 'Lock period'"
            :loading="locking"
            @click="toggleLock"
          />
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="generationDialogVisible"
      header="Generate dues"
      modal
      :style="{ width: '720px' }"
    >
      <div class="admin-form-layout">
        <label>
          <span class="field-label">
            Flats
            <i
              class="pi pi-info-circle"
              title="Leave empty to generate dues for all active flats, or select specific flats for a limited run."
              aria-label="Leave empty to generate dues for all active flats, or select specific flats for a limited run."
            />
          </span>
          <MultiSelect
            v-model="selectedFlatIds"
            :options="flatOptions"
            option-label="label"
            option-value="value"
            filter
            display="chip"
            placeholder="All active flats"
          />
        </label>

        <AppSkeletonState v-if="previewLoading" />
        <template v-else-if="generationPreview">
          <div class="surface-grid">
            <section class="surface-card">
              <p class="eyebrow">Affected flats</p>
              <h3>{{ generationPreview.totalFlats }}</h3>
            </section>
            <section class="surface-card">
              <p class="eyebrow">Preview amount</p>
              <h3>{{ formatMoney(generationPreview.totalAmount) }}</h3>
            </section>
            <section class="surface-card">
              <p class="eyebrow">Skipped</p>
              <h3>{{ generationPreview.skippedExisting }}</h3>
            </section>
          </div>
          <Message
            v-for="warning in generationPreview.warnings"
            :key="warning"
            severity="warn"
          >
            {{ warning }}
          </Message>
          <DataTable
            :value="generationPreview.flatTypeBreakdown"
            responsive-layout="scroll"
          >
            <Column field="flatType" header="Unit type" />
            <Column field="flatCount" header="Flats" />
            <Column header="Amount">
              <template #body="{ data: row }">
                {{ formatMoney(row.totalAmount) }}
              </template>
            </Column>
          </DataTable>
        </template>

        <div class="admin-inline-actions dialog-actions">
          <Button
            label="Cancel"
            severity="secondary"
            outlined
            @click="generationDialogVisible = false"
          />
          <Button
            label="Generate dues"
            icon="pi pi-bolt"
            :loading="generating"
            :disabled="
              !generationPreview ||
              generationPreview.isLocked ||
              generationPreview.totalFlats === 0
            "
            @click="generateDues"
          />
        </div>
      </div>
    </Dialog>
  </div>
</template>
