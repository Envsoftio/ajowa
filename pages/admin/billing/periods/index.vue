<script setup lang="ts">
import type {
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
type FlatsResponse = { ok: true; data: { items: FlatSummary[] } }
type PreviewResponse = {
  ok: true
  data: DueGenerationPreview & { skippedExisting: number; isLocked: boolean }
}
type GenerationResponse = {
  ok: true
  data: {
    generated: number
    skipped: number
    advanceAppliedCount: number
    advanceAppliedAmount: number
    dueIds: string[]
  }
}

const api = useApi()
const route = useRoute()
const toast = useToast()
const lastGeneratedDueIds = ref<string[]>([])
const { downloadingBillPdfs, downloadBillPdfs } = useBillPdfZipDownload()

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)

const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-IN').format(value)

const formatUnit = (count: number, singular: string, plural = `${singular}s`) =>
  `${formatNumber(count)} ${count === 1 ? singular : plural}`

const formatDate = (value: string | null | undefined) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
        dateStyle: 'medium',
      })
    : '-'

const frequencyMonthMultipliers: Partial<Record<BillingFrequency, number>> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
}

const frequencyOptions: Array<{ label: string; value: BillingFrequency }> = [
  { label: 'Monthly', value: 'MONTHLY' },
  { label: 'Quarterly', value: 'QUARTERLY' },
  { label: 'Half yearly', value: 'HALF_YEARLY' },
  { label: 'Yearly', value: 'YEARLY' },
  { label: 'Custom', value: 'CUSTOM' },
]

const getFrequencyLabel = (frequency: BillingFrequency) =>
  frequencyOptions.find((item) => item.value === frequency)?.label ?? frequency

const getBillingPeriodMonthSpan = (startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 1
  }

  return Math.max(
    1,
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth()) +
      1,
  )
}

const getFrequencyMonthCount = (
  frequency: BillingFrequency,
  startDate?: string,
  endDate?: string,
) =>
  frequencyMonthMultipliers[frequency] ??
  (startDate && endDate ? getBillingPeriodMonthSpan(startDate, endDate) : 1)

const formatCycleMonths = (months: number) =>
  `${months} ${months === 1 ? 'month' : 'months'}`

const toDateInput = (date: Date) => date.toISOString().slice(0, 10)

const addDays = (date: Date, days: number) => {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

const startOfMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))

const endOfMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))

const addMonths = (date: Date, months: number) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))

const formatSuggestedCycleLabel = (startDate: Date, endDate: Date) => {
  const startLabel = startDate.toLocaleDateString('en-IN', {
    month: 'long',
    timeZone: 'UTC',
  })
  const endLabel = endDate.toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  if (startDate.getUTCMonth() === endDate.getUTCMonth() && startDate.getUTCFullYear() === endDate.getUTCFullYear()) {
    return endLabel
  }

  return `${startLabel} - ${endLabel}`
}

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

const [
  periodsAsyncData,
  flatsAsyncData,
] = await Promise.all([
  useAsyncData('admin-billing-periods', loadPeriods, {
    watch: [periodQuery],
  }),
  useAsyncData('billing-flat-options', () =>
    api<FlatsResponse>('/api/admin/flats', {
      query: {
        page: 1,
        pageSize: 2000,
        sortBy: 'flatNumber',
        sortDirection: 'asc',
      },
    }),
  ),
])

const {
  data: periodsData,
  pending: periodsPending,
  refresh: refreshPeriods,
} = periodsAsyncData
const { data: flatsData } = flatsAsyncData

const periods = computed(() => periodsData.value?.data.items ?? [])
const flatOptions = computed(() =>
  (flatsData.value?.data.items ?? []).map((flat) => ({
    label: `${flat.blockName} ${flat.flatNumber} - ${flat.unitType}`,
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

const openPeriodDetail = computed(() =>
  summary.value.open > 0
    ? `${formatUnit(summary.value.open, 'period')} unlocked for edits`
    : 'All loaded periods are locked',
)

const unpaidBillsDetail = computed(() =>
  summary.value.unpaidDueCount > 0
    ? `${formatUnit(summary.value.unpaidDueCount, 'unpaid bill')} pending`
    : 'No unpaid bills in loaded periods',
)

const canGenerateForPeriod = (period: BillingPeriod) => !period.isLocked

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

const periodFormCycleMonths = computed(() =>
  getFrequencyMonthCount(periodForm.frequency, periodForm.startDate, periodForm.endDate),
)

const periodFormCycleSummary = computed(() =>
  `${formatCycleMonths(periodFormCycleMonths.value)} - ${formatDate(periodForm.startDate)} to ${formatDate(periodForm.endDate)}`,
)

const cycleNameLooksLikeCharge = computed(() =>
  /\b(cam|dg\s*set|dgset|generator|power\s*backup|maintenance\s*charge)\b/i.test(
    periodForm.label.trim(),
  ),
)

const resetPeriodForm = () => {
  selectedPeriod.value = null
  periodForm.label = ''
  periodForm.frequency = 'MONTHLY'
  periodForm.startDate = ''
  periodForm.endDate = ''
  periodForm.dueDate = ''
}

const applySuggestedPeriod = (frequency: BillingFrequency = 'MONTHLY') => {
  const latestPeriod = periods.value
    .slice()
    .sort(
      (a, b) =>
        new Date(`${b.endDate}T00:00:00`).getTime() -
        new Date(`${a.endDate}T00:00:00`).getTime(),
    )[0]
  const start = latestPeriod
    ? addDays(new Date(`${latestPeriod.endDate}T00:00:00Z`), 1)
    : startOfMonth(new Date())
  const monthStart = startOfMonth(start)
  const monthCount = getFrequencyMonthCount(frequency)
  const monthEnd = endOfMonth(addMonths(monthStart, monthCount - 1))
  const dueDate = new Date(Date.UTC(monthEnd.getUTCFullYear(), monthEnd.getUTCMonth() + 1, 10))

  periodForm.frequency = frequency
  periodForm.label = formatSuggestedCycleLabel(monthStart, monthEnd)
  periodForm.startDate = toDateInput(monthStart)
  periodForm.endDate = toDateInput(monthEnd)
  periodForm.dueDate = toDateInput(dueDate)
}

const openCreatePeriod = () => {
  resetPeriodForm()
  applySuggestedPeriod()
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
  if (cycleNameLooksLikeCharge.value) {
    toast.add({
      severity: 'warn',
      summary: 'Use a period name',
      detail: 'Use a period name like July - September 2026 here. CAM charges and DG readings are entered on their own pages.',
      life: 10000,
    })
    return
  }

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
      life: 10000,
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
      life: 10000,
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
const generating = ref(false)

const generationCycleMonths = computed(() =>
  generationPreview.value?.cycleMultiplier ??
  (generationTarget.value
    ? getFrequencyMonthCount(
        generationTarget.value.frequency,
        generationTarget.value.startDate,
        generationTarget.value.endDate,
      )
    : 1),
)

const generationCycleLabel = computed(() =>
  generationPreview.value?.cycleLabel ?? formatCycleMonths(generationCycleMonths.value),
)

const isCamCharge = (charge: ChargeBreakdownItem) =>
  charge.chargeType === 'CAM' ||
  charge.calculationMethod === 'AREA_RATE' ||
  /^cam(?:\s+charges?)?$/i.test(charge.label.trim())

const isDgCharge = (charge: ChargeBreakdownItem) =>
  charge.chargeType === 'DG_SET' ||
  /\b(dg\s*set|dgset|generator|power\s*back\s*up|power\s*backup)\b/i.test(charge.label)

const getPreviewChargeTotal = (predicate: (charge: ChargeBreakdownItem) => boolean) =>
  generationPreview.value?.flatTypeBreakdown.reduce(
    (sum, group) =>
      sum +
      group.chargeTemplate
        .filter(predicate)
        .reduce((chargeSum, charge) => chargeSum + Number(charge.amount ?? 0) * group.flatCount, 0),
    0,
  ) ?? 0

const generationCamTotal = computed(() => getPreviewChargeTotal(isCamCharge))
const generationDgTotal = computed(() => getPreviewChargeTotal(isDgCharge))

const loadGenerationPreview = async () => {
  if (!generationTarget.value) return

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
}

const openGenerationDialog = async (period: BillingPeriod) => {
  generationTarget.value = period
  selectedFlatIds.value = []
  generationPreview.value = null
  generationDialogVisible.value = true
  await loadGenerationPreview()
}

watch(selectedFlatIds, () => {
  if (generationDialogVisible.value) {
    void loadGenerationPreview()
  }
})

const openedRouteGenerationPeriodId = ref('')

watch(
  [periods, () => route.query.generatePeriodId],
  ([items, generatePeriodId]) => {
    if (typeof generatePeriodId !== 'string' || !generatePeriodId) return
    if (openedRouteGenerationPeriodId.value === generatePeriodId) return

    const period = items.find((item) => item.id === generatePeriodId)
    if (!period) return

    openedRouteGenerationPeriodId.value = generatePeriodId
    void openGenerationDialog(period)
  },
  { immediate: true },
)

const generateDues = async () => {
  if (!generationTarget.value) return
  generating.value = true

  try {
    const response = await api<GenerationResponse>('/api/admin/billing/dues', {
      method: 'POST',
      body: {
        billingPeriodId: generationTarget.value.id,
        flatIds: selectedFlatIds.value.length
          ? selectedFlatIds.value
          : undefined,
      },
    })
    lastGeneratedDueIds.value = response.data.dueIds
    toast.add({
      severity: 'success',
      summary: 'Bills generated',
      detail: [
        `${response.data.generated} created`,
        `${response.data.skipped} skipped`,
        response.data.advanceAppliedAmount > 0
          ? `${formatMoney(response.data.advanceAppliedAmount)} advance applied`
          : '',
      ].filter(Boolean).join(', ') + '.',
      life: 10000,
    })
    generationDialogVisible.value = false
    await refreshPeriods()
  } finally {
    generating.value = false
  }
}

const downloadLastGeneratedBillPdfs = () => {
  if (lastGeneratedDueIds.value.length === 0) return

  void downloadBillPdfs({
    dueIds: lastGeneratedDueIds.value,
  })
}
</script>

<template>
  <div class="landing-page">
    <section class="billing-command-panel">
      <header class="billing-command-header">
        <div>
          <p class="eyebrow">Billing</p>
          <h1>Billing periods</h1>
          <p>
            Define the date range, tenure, and due date that CAM, DG Set, and
            final bills use. Charge entry stays on the dedicated CAM and DG Set
            pages.
          </p>
        </div>
        <div class="billing-command-actions">
          <Button
            v-if="lastGeneratedDueIds.length > 0"
            :label="`Download last ${lastGeneratedDueIds.length} PDF${lastGeneratedDueIds.length === 1 ? '' : 's'}`"
            icon="pi pi-download"
            severity="secondary"
            outlined
            :loading="downloadingBillPdfs"
            @click="downloadLastGeneratedBillPdfs"
          />
          <Button
            label="Create period"
            icon="pi pi-calendar-plus"
            @click="openCreatePeriod"
          />
        </div>
      </header>

      <div class="billing-cycle-guide" aria-label="Billing period summary">
        <div>
          <span>Total periods</span>
          <strong>{{ formatUnit(summary.total, 'period') }}</strong>
          <p>Date ranges configured for billing.</p>
        </div>
        <div>
          <span>Open periods</span>
          <strong>{{ formatUnit(summary.open, 'period') }}</strong>
          <p>{{ openPeriodDetail }}</p>
        </div>
        <div>
          <span>Generated</span>
          <strong>{{ formatUnit(summary.dueCount, 'bill') }}</strong>
          <p>{{ unpaidBillsDetail }}</p>
        </div>
      </div>
    </section>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Billing periods</h1>
          <p>Period dates, due dates, lock status, and final generation.</p>
        </div>
        <div class="list-page__exports">
          <Button
            label="Create period"
            icon="pi pi-calendar-plus"
            @click="openCreatePeriod"
          />
        </div>
      </header>

      <div class="list-page__toolbar">
        <label class="list-page__search">
          <span class="field-label">
            Search
            <AppHelpIcon text="Find billing periods by their visible period name." />
          </span>
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText
              v-model="periodQuery.search"
              placeholder="Search by period name"
            />
          </IconField>
        </label>
        <div class="list-page__filters">
          <label>
            <span class="field-label">
              State
              <AppHelpIcon text="Show all billing periods, open periods, or locked periods." />
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
              <AppHelpIcon text="Filter billing periods by frequency." />
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

      <AppDataTable
        :value="periods"
        :loading="periodsPending"
        responsive-layout="scroll"
        class="list-page__table"
        data-key="id"
      >
        <Column field="label" header="Period name">
          <template #body="{ data: row }">
            <div class="billing-period-cell">
              <strong>{{ row.label }}</strong>
              <span>{{ getFrequencyLabel(row.frequency) }} - {{ formatCycleMonths(getFrequencyMonthCount(row.frequency, row.startDate, row.endDate)) }}</span>
            </div>
          </template>
        </Column>
        <Column header="Date range">
          <template #body="{ data: row }">
            <span>{{ formatDate(row.startDate) }} - {{ formatDate(row.endDate) }}</span>
          </template>
        </Column>
        <Column field="dueDate" header="Due date">
          <template #body="{ data: row }">
            <span>{{ formatDate(row.dueDate) }}</span>
          </template>
        </Column>
        <Column header="Bills">
          <template #body="{ data: row }">
            <div class="billing-period-cell">
              <strong>{{ row.dueCount ?? 0 }} generated</strong>
              <span>{{ row.unpaidDueCount ?? 0 }} unpaid</span>
            </div>
          </template>
        </Column>
        <Column field="status" header="Status">
          <template #body="{ data: row }">
            <AppStatusBadge :status="row.isLocked ? 'locked' : 'open'" />
          </template>
        </Column>
        <Column header="Actions" style="width: 300px">
          <template #body="{ data: row }">
            <div class="admin-inline-actions billing-table-actions">
              <Button
                label="Generate"
                icon="pi pi-send"
                severity="secondary"
                outlined
                size="small"
                :disabled="row.isLocked"
                @click="openGenerationDialog(row)"
              />
              <Button
                label="Edit"
                icon="pi pi-pencil"
                severity="secondary"
                outlined
                size="small"
                :disabled="row.isLocked"
                @click="editPeriod(row)"
              />
              <Button
                :label="row.isLocked ? 'Unlock' : 'Lock'"
                :icon="row.isLocked ? 'pi pi-lock-open' : 'pi pi-lock'"
                severity="secondary"
                outlined
                size="small"
                @click="openLockDialog(row)"
              />
            </div>
          </template>
        </Column>
      </AppDataTable>

      <div class="list-page__cards">
        <article v-for="period in periods" :key="period.id" class="list-card">
          <div class="list-card__header">
            <div>
              <h3>{{ period.label }}</h3>
              <p>{{ getFrequencyLabel(period.frequency) }}</p>
            </div>
            <AppStatusBadge :status="period.isLocked ? 'locked' : 'open'" />
          </div>
          <div class="list-card__row">
            <span>Coverage</span>
            <strong>{{ formatDate(period.startDate) }} - {{ formatDate(period.endDate) }}</strong>
          </div>
          <div class="list-card__row">
            <span>Due date</span>
            <strong>{{ formatDate(period.dueDate) }}</strong>
          </div>
          <div class="list-card__row">
            <span>Bills generated</span>
            <strong>{{ period.dueCount ?? 0 }}</strong>
          </div>
          <div class="admin-inline-actions">
            <Button
              label="Generate"
              icon="pi pi-send"
              size="small"
              severity="secondary"
              outlined
              :disabled="!canGenerateForPeriod(period)"
              @click="openGenerationDialog(period)"
            />
            <Button
              label="Edit"
              icon="pi pi-pencil"
              size="small"
              severity="secondary"
              outlined
              :disabled="period.isLocked"
              @click="editPeriod(period)"
            />
          </div>
        </article>
      </div>
    </section>

    <Dialog
      v-model:visible="periodDialogVisible"
      :header="selectedPeriod ? 'Edit billing period' : 'Create billing period'"
      modal
      :style="{ width: '520px' }"
    >
      <form class="admin-form-layout" @submit.prevent="savePeriod">
        <div class="billing-dialog-intro">
          <div>
            <p class="eyebrow">Billing period</p>
            <h2>{{ periodForm.label || 'New billing period' }}</h2>
            <p>Choose the dates covered by this billing period.</p>
          </div>
          <div v-if="!selectedPeriod" class="billing-cycle-presets">
            <Button
              type="button"
              label="Monthly"
              icon="pi pi-calendar"
              severity="secondary"
              outlined
              @click="applySuggestedPeriod('MONTHLY')"
            />
            <Button
              type="button"
              label="Quarterly"
              icon="pi pi-calendar"
              severity="secondary"
              outlined
              @click="applySuggestedPeriod('QUARTERLY')"
            />
            <Button
              type="button"
              label="Yearly"
              icon="pi pi-calendar"
              severity="secondary"
              outlined
              @click="applySuggestedPeriod('YEARLY')"
            />
          </div>
        </div>
        <Message severity="info">
          {{ periodFormCycleSummary }}
        </Message>
        <div class="admin-form-grid">
          <label class="admin-form-grid__full">
            <span class="field-label">
              Period name
              <AppHelpIcon text="Readable billing period name shown to admins and residents, such as July - September 2026." />
            </span>
            <InputText
              v-model="periodForm.label"
              placeholder="June 2026"
              required
            />
          </label>
          <Message
            v-if="cycleNameLooksLikeCharge"
            severity="warn"
            class="admin-form-grid__full"
          >
            This looks like a charge name. Use a month name such as June 2026
            here; CAM charges and DG readings are entered on their own pages.
          </Message>
          <label>
            <span class="field-label">
              Tenure
              <AppHelpIcon text="Billing frequency for this period." />
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
              <AppHelpIcon text="First calendar date covered by this billing period." />
            </span>
            <InputText v-model="periodForm.startDate" type="date" required />
          </label>
          <label>
            <span class="field-label">
              End date
              <AppHelpIcon text="Last calendar date covered by this billing period." />
            </span>
            <InputText v-model="periodForm.endDate" type="date" required />
          </label>
          <label>
            <span class="field-label">
              Due date
              <AppHelpIcon text="Payment deadline shown to residents." />
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
              ? 'Unlock this billing period for corrections.'
              : 'Lock this billing period to block later bills, payments, and journal writes.'
          }}
        </p>
        <label v-if="!lockTarget?.isLocked" class="admin-form-grid__full">
          <span class="field-label">
            Lock reason
            <AppHelpIcon text="Short audit note explaining why the billing period is being locked." />
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
      header="Generate bills"
      modal
      :style="{ width: 'min(940px, 96vw)' }"
    >
      <div class="admin-form-layout">
        <AppSkeletonState v-if="!generationPreview" />
        <template v-else>
          <div class="billing-generation-summary">
            <div>
              <span>Period</span>
              <strong>{{ generationTarget?.label ?? '-' }}</strong>
              <small>{{ generationCycleLabel }}</small>
            </div>
            <div>
              <span>Bills to create</span>
              <strong>{{ generationPreview.totalFlats }}</strong>
              <small>{{ generationPreview.skippedExisting }} skipped</small>
            </div>
            <div>
              <span>CAM estimate</span>
              <strong>{{ formatMoney(generationCamTotal) }}</strong>
              <small>Saved CAM rows included</small>
            </div>
            <div>
              <span>DG estimate</span>
              <strong>{{ formatMoney(generationDgTotal) }}</strong>
              <small>Saved DG rows included</small>
            </div>
            <div>
              <span>Total</span>
              <strong>{{ formatMoney(generationPreview.totalAmount) }}</strong>
              <small>Before new payments</small>
            </div>
          </div>

          <label>
            <span class="field-label">
              Flats
              <AppHelpIcon text="Leave empty to generate bills for all active flats, or select specific flats for a limited run." />
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

          <Message severity="info">
            Generate bills only after CAM charges and DG Set readings are saved
            on their dedicated pages.
          </Message>

          <template v-if="generationPreview.warnings.length">
            <Message
              v-for="warning in generationPreview.warnings"
              :key="warning"
              severity="warn"
            >
              {{ warning }}
            </Message>
          </template>
        </template>

        <div class="admin-inline-actions dialog-actions">
          <Button
            label="Cancel"
            severity="secondary"
            outlined
            @click="generationDialogVisible = false"
          />
          <Button
            label="Generate bills"
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
