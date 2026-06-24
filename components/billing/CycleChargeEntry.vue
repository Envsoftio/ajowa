<script setup lang="ts">
import type {
  BillingFrequency,
  BillingPeriod,
  BillingPeriodChargeType,
  DueGenerationPreview,
  FlatSummary,
} from '~/types/domain'

type ChargeType = 'CAM' | 'DG_SET' | 'OTHER'
type BillChannel = 'PUSH' | 'EMAIL' | 'WHATSAPP' | 'IN_APP'
type GeneratedDueTarget = {
  dueId: string
  flatId: string
}
type GenerationProgressStepStatus = 'pending' | 'active' | 'done' | 'error'
type GenerationProgressStep = {
  id: string
  label: string
  detail: string
  status: GenerationProgressStepStatus
}

type PeriodResponse = {
  ok: true
  data: { items: BillingPeriod[]; total: number }
}

type PeriodCreateResponse = {
  ok: true
  data: { id: string }
}

type FlatListResponse = {
  ok: true
  data: { items: FlatSummary[]; total: number }
}

type VariableChargeEntry = {
  flatId: string
  flatNumber: string
  blockName: string
  unitType: string
  areaSqFt: number | null
  camAdvanceCoveredFrom: string | null
  camAdvancePaidUntil: string | null
  camAdvanceCoverages?: {
    coveredFrom: string
    coveredUntil: string
  }[]
  camAdvanceNote: string | null
  camAdvanceUpdatedAt: string | null
  meterNo: string | null
  openingReading: number | null
  closingReading: number | null
  consumedUnits: number | null
  ratePerUnit: number | null
  ratePerSqFt: number | null
  connectionLoad: string | null
  previousOutstanding: number | null
  interestAmount: number | null
  cycleMultiplier: number | null
  cycleLabel: string | null
  amount: number | null
}

type VariableChargesResponse = {
  ok: true
  data: {
    billingPeriodId: string
    chargeName: string
    items: VariableChargeEntry[]
  }
}

type VariableChargesSaveResponse = {
  ok: true
  data: { saved: number; removed: number }
}

type PreviewResponse = {
  ok: true
  data: DueGenerationPreview & { skippedExisting: number; isLocked: boolean }
}

type GenerationResponse = {
  ok: true
  data: {
    generated: number
    skipped: number
    advanceCoveredCount: number
    advanceProratedCount?: number
    advanceProratedAmount?: number
    overlapSkippedCount: number
    advanceAppliedCount: number
    advanceAppliedAmount: number
    dueIds: string[]
    generatedDues: GeneratedDueTarget[]
    skippedDues: GeneratedDueTarget[]
  }
}

type BillSendResponse = {
  ok: true
  data: {
    eligible: number
    jobCount: number
  }
}

const props = withDefaults(
  defineProps<{
    mode: 'CAM' | 'DG'
    title: string
    eyebrow: string
    description: string
    chargeName: string
    chargeLabel: string
    chargeType: ChargeType
    periodChargeType?: BillingPeriodChargeType | undefined
    source: string
    electricityType?: string | null
    defaultRatePerUnit?: number | null
    defaultRatePerSqFt?: number | null
    defaultFlatAmount?: number | null
    defaultConnectionLoad?: string
    defaultAmountLabel?: string
    defaultRateLabel?: string
    meterLabel?: string
    saveButtonLabel?: string
    savedSummary?: string
    amountSummaryLabel?: string
    unitsSummaryLabel?: string
    showConnectionLoad?: boolean
    allowManualAmount?: boolean
    showAreaRate?: boolean
    showPerFlatCycle?: boolean
    camRunFlow?: boolean
    defaultCycleMonths?: number
    defaultPeriodFrequency?: BillingFrequency
  }>(),
  {
    periodChargeType: undefined,
    electricityType: null,
    defaultRatePerUnit: null,
    defaultRatePerSqFt: null,
    defaultFlatAmount: null,
    defaultConnectionLoad: '',
    defaultAmountLabel: 'Default amount',
    defaultRateLabel: 'Default rate/unit',
    meterLabel: 'Meter no.',
    saveButtonLabel: 'Save charges',
    savedSummary: 'Charges saved',
    amountSummaryLabel: 'Total',
    unitsSummaryLabel: 'units',
    showConnectionLoad: false,
    allowManualAmount: false,
    showAreaRate: false,
    showPerFlatCycle: false,
    camRunFlow: false,
    defaultCycleMonths: 1,
    defaultPeriodFrequency: 'MONTHLY',
  },
)

const api = useApi()
const route = useRoute()
const toast = useToast()

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)

const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
  }).format(value)

const formatUnit = (count: number, singular: string, plural = `${singular}s`) =>
  `${formatNumber(count)} ${count === 1 ? singular : plural}`

type ApiErrorPayloadShape = {
  message?: string
  fieldErrors?: Record<string, string[]>
  details?: {
    fieldErrors?: Record<string, string[]>
  }
  data?: ApiErrorPayloadShape
}

const getFirstFieldErrorMessage = (payload?: ApiErrorPayloadShape | null) => {
  const fieldErrors = payload?.fieldErrors ?? payload?.details?.fieldErrors
  const firstFieldError = Object.entries(fieldErrors ?? {})[0]

  if (!firstFieldError) return null

  const [field, messages] = firstFieldError
  const message = messages[0]

  return message ? `${field}: ${message}` : null
}

const getApiErrorMessage = (
  error: unknown,
  fallback = 'Bill generation failed. Please review the details and try again.',
) => {
  const apiError = error as {
    data?: ApiErrorPayloadShape
    message?: string
    statusMessage?: string
  }
  const payload = apiError.data?.data ?? apiError.data
  const detail =
    getFirstFieldErrorMessage(payload) ??
    payload?.message ??
    apiError.message ??
    apiError.statusMessage

  if (
    !detail ||
    /^(\[.*\]\s*)?fetch failed$/i.test(detail) ||
    /^something went wrong\.?( please try again\.)?$/i.test(detail)
  ) {
    return fallback
  }

  return detail
}

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

const cycleOptions = [
  { label: 'Monthly', value: 1 },
  { label: 'Quarterly', value: 3 },
  { label: 'Half yearly', value: 6 },
  { label: 'Yearly', value: 12 },
]

const getBillingPeriodMonthSpan = (startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  ) {
    return 1
  }

  return Math.max(
    1,
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth()) +
      1,
  )
}

const getFrequencyMonthCount = (period: BillingPeriod | null) =>
  period
    ? (frequencyMonthMultipliers[period.frequency] ??
      getBillingPeriodMonthSpan(period.startDate, period.endDate))
    : 1

const getFrequencyLabel = (frequency: BillingFrequency) =>
  frequency
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ')

const getCycleLabel = (months: number | null | undefined) => {
  const normalized = Math.max(1, Number(months ?? 1))
  const option = cycleOptions.find((item) => item.value === normalized)
  return (
    option?.label ?? `${normalized} ${normalized === 1 ? 'month' : 'months'}`
  )
}

const toDateInput = (date: Date) => date.toISOString().slice(0, 10)

const addDays = (date: Date, days: number) => {
  const copy = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

const startOfMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))

const endOfMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))

const addMonths = (date: Date, months: number) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))

const startOfNextMonth = () => startOfMonth(addMonths(new Date(), 1))

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

  if (
    startDate.getUTCMonth() === endDate.getUTCMonth() &&
    startDate.getUTCFullYear() === endDate.getUTCFullYear()
  ) {
    return endLabel
  }

  return `${startLabel} - ${endLabel}`
}

const asyncKey = `billing-${props.mode.toLowerCase()}-charge-entry`
const periodChargeType = computed<BillingPeriodChargeType>(
  () =>
    props.periodChargeType ??
    (props.chargeType === 'DG_SET' || props.chargeType === 'CAM'
      ? props.chargeType
      : 'GENERAL'),
)

const {
  data: periodsData,
  pending: periodsPending,
  refresh: refreshPeriods,
} = await useAsyncData(`${asyncKey}-periods`, () =>
  api<PeriodResponse>('/api/admin/billing/periods', {
    query: {
      page: 1,
      pageSize: 200,
      chargeType: periodChargeType.value,
      sortBy: 'startDate',
      sortDirection: 'desc',
    },
  }),
)

const periods = computed(() => periodsData.value?.data.items ?? [])
const selectedPeriodId = ref(
  typeof route.query.periodId === 'string' ? route.query.periodId : '',
)
const chargeEntries = ref<VariableChargeEntry[]>([])
const chargeSearch = ref('')
const defaultRatePerUnit = ref<number | null>(props.defaultRatePerUnit)
const defaultRatePerSqFt = ref<number | null>(props.defaultRatePerSqFt)
const defaultFlatAmount = ref<number | null>(props.defaultFlatAmount)
const defaultConnectionLoad = ref(props.defaultConnectionLoad)
const camRunStartDate = ref(toDateInput(startOfMonth(startOfNextMonth())))
const camRunDueDate = ref(toDateInput(startOfMonth(startOfNextMonth())))
const camRunBillDate = ref(toDateInput(startOfMonth(startOfNextMonth())))
const loadingCharges = ref(false)
const savingCharges = ref(false)
const periodDialogVisible = ref(false)
const savingPeriod = ref(false)
const periodForm = reactive({
  label: '',
  frequency: props.defaultPeriodFrequency,
  startDate: '',
  endDate: '',
  dueDate: '',
})
const generationDialogVisible = ref(false)
const generationPreview = ref<
  (DueGenerationPreview & { skippedExisting: number; isLocked: boolean }) | null
>(null)
const loadingGenerationPreview = ref(false)
const selectedFlatIds = ref<string[]>([])
const generating = ref(false)
const sendBillsAfterGeneration = ref(false)
const billChannels = ref<BillChannel[]>(['EMAIL'])
const billDeliveryFlatIds = ref<string[]>([])
const generationProgressSteps = ref<GenerationProgressStep[]>([])
const activeGenerationStepId = ref<string | null>(null)
const lastGeneratedDueIds = ref<string[]>([])
const { downloadingBillPdfs, downloadBillPdfs } = useBillPdfZipDownload()

const billChannelOptions: Array<{ label: string; value: BillChannel }> = [
  { label: 'Email', value: 'EMAIL' },
  { label: 'WhatsApp', value: 'WHATSAPP' },
  { label: 'Push', value: 'PUSH' },
  { label: 'In-app', value: 'IN_APP' },
]

const selectedPeriod = computed(
  () =>
    periods.value.find((period) => period.id === selectedPeriodId.value) ??
    null,
)

const defaultCycleMonths = computed(() =>
  props.camRunFlow
    ? Math.max(1, props.defaultCycleMonths)
    : selectedCycleMonths.value,
)

const selectedCycleMonths = computed(() =>
  getFrequencyMonthCount(selectedPeriod.value),
)

const parseDateInput = (value: string) => new Date(`${value}T00:00:00Z`)
const normalizeCamRunDate = (value: string) => {
  const parsed = parseDateInput(value)
  if (Number.isNaN(parsed.getTime())) {
    return toDateInput(startOfMonth(startOfNextMonth()))
  }

  return toDateInput(startOfMonth(parsed))
}

const camRunStartDateValue = computed(() =>
  startOfMonth(parseDateInput(camRunStartDate.value)),
)
const camRunDueDateLabel = computed(() => formatDate(camRunDueDate.value))
const camRunBillDateLabel = computed(() => formatDate(camRunBillDate.value))

const getCycleFrequency = (cycleMonths: number): BillingFrequency => {
  if (cycleMonths === 1) return 'MONTHLY'
  if (cycleMonths === 3) return 'QUARTERLY'
  if (cycleMonths === 6) return 'HALF_YEARLY'
  if (cycleMonths === 12) return 'YEARLY'
  return 'CUSTOM'
}

const getCamPeriodForCycle = (cycleMonths: number) => {
  const startDate = camRunStartDateValue.value
  const endDate = endOfMonth(addMonths(startDate, cycleMonths - 1))
  const startDateText = toDateInput(startDate)
  const endDateText = toDateInput(endDate)

  return {
    label: `CAM - ${formatSuggestedCycleLabel(startDate, endDate)}`,
    frequency: getCycleFrequency(cycleMonths),
    startDate: startDateText,
    endDate: endDateText,
    dueDate: camRunDueDate.value,
  }
}

const periodFormCycleMonths = computed(
  () =>
    frequencyMonthMultipliers[periodForm.frequency] ??
    (periodForm.startDate && periodForm.endDate
      ? getBillingPeriodMonthSpan(periodForm.startDate, periodForm.endDate)
      : 1),
)

const periodFormCycleSummary = computed(
  () =>
    `${periodFormCycleMonths.value} ${periodFormCycleMonths.value === 1 ? 'month' : 'months'} - ${formatDate(periodForm.startDate)} to ${formatDate(periodForm.endDate)}`,
)

const selectedCycleLabel = computed(() =>
  props.camRunFlow
    ? `CAM run from ${formatDate(camRunStartDate.value)}; due ${camRunDueDateLabel.value}; bill ${camRunBillDateLabel.value}`
    : selectedPeriod.value
      ? `${getFrequencyLabel(selectedPeriod.value.frequency)} - ${formatDate(selectedPeriod.value.startDate)} to ${formatDate(selectedPeriod.value.endDate)}`
      : 'Create or select a billing period',
)

const periodOptions = computed(() =>
  periods.value.map((period) => ({
    label: `${period.label} - ${getFrequencyLabel(period.frequency)} - ${formatDate(period.startDate)} to ${formatDate(period.endDate)}`,
    value: period.id,
  })),
)

const filteredChargeEntries = computed(() => {
  const term = chargeSearch.value.trim().toLowerCase()
  if (!term) return chargeEntries.value

  return chargeEntries.value.filter((entry) =>
    [entry.blockName, entry.flatNumber, entry.unitType]
      .join(' ')
      .toLowerCase()
      .includes(term),
  )
})

const flatOptions = computed(() =>
  chargeEntries.value.map((entry) => ({
    label: `${entry.blockName} ${entry.flatNumber} - ${entry.unitType}`,
    value: entry.flatId,
  })),
)

const billDeliveryFlatOptions = computed(() =>
  chargeEntries.value
    .filter(
      (entry) =>
        getEntryNetBillableAmount(entry) > 0 && !isCamAdvanceCoveredForEntry(entry),
    )
    .map((entry) => ({
      label: `${entry.blockName} ${entry.flatNumber} - ${entry.unitType}`,
      value: entry.flatId,
    })),
)

const selectedBillDeliveryCount = computed(
  () =>
    billDeliveryFlatOptions.value.filter((option) =>
      billDeliveryFlatIds.value.includes(option.value),
    ).length,
)

const filledChargeCount = computed(
  () =>
    chargeEntries.value.filter((entry) => Number(entry.amount ?? 0) > 0).length,
)

const billableFlatIds = computed(() =>
  chargeEntries.value
    .filter(
      (entry) =>
        getEntryNetBillableAmount(entry) > 0 && !isCamAdvanceCoveredForEntry(entry),
    )
    .map((entry) => entry.flatId),
)

const camBillableEntries = computed(() =>
  chargeEntries.value.filter(
    (entry) =>
      getEntryNetBillableAmount(entry) > 0 && !isCamAdvanceCoveredForEntry(entry),
  ),
)

const camAdvanceCoveredEntries = computed(() =>
  chargeEntries.value.filter((entry) => isCamAdvanceCoveredForEntry(entry)),
)

const camAdvanceAdjustedEntries = computed(() =>
  chargeEntries.value.filter((entry) => {
    const coverage = getCamAdvanceCoverageSummaryForEntry(entry)
    return coverage.coveredMonths > 0 && !coverage.isFullyCovered
  }),
)

const camRunGenerationEntries = computed(() =>
  chargeEntries.value.filter(
    (entry) =>
      Number(entry.amount ?? 0) > 0 || isCamAdvanceCoveredForEntry(entry),
  ),
)

const camRunGroups = computed(() => {
  const groups = new Map<
    number,
    {
      cycleMonths: number
      cycleLabel: string
      period: ReturnType<typeof getCamPeriodForCycle>
      entries: VariableChargeEntry[]
      billableCount: number
      advanceCoveredCount: number
      advanceAdjustedCount: number
      totalAmount: number
    }
  >()

  for (const entry of camRunGenerationEntries.value) {
    const cycleMonths = getEntryCycleMultiplier(entry)
    const isCovered = isCamAdvanceCoveredForEntry(entry)
    const coverageSummary = getCamAdvanceCoverageSummaryForEntry(entry)
    const isAdvanceAdjusted =
      coverageSummary.coveredMonths > 0 && !coverageSummary.isFullyCovered
    const billableAmount = getEntryNetBillableAmount(entry)
    const current = groups.get(cycleMonths)

    if (current) {
      current.entries.push(entry)
      current.billableCount += isCovered
        ? 0
        : billableAmount > 0
          ? 1
          : 0
      current.advanceCoveredCount += isCovered ? 1 : 0
      current.advanceAdjustedCount += isAdvanceAdjusted ? 1 : 0
      current.totalAmount = roundChargeValue(
        current.totalAmount + (isCovered ? 0 : billableAmount),
      )
    } else {
      groups.set(cycleMonths, {
        cycleMonths,
        cycleLabel: getCycleLabel(cycleMonths),
        period: getCamPeriodForCycle(cycleMonths),
        entries: [entry],
        billableCount: isCovered || billableAmount <= 0 ? 0 : 1,
        advanceCoveredCount: isCovered ? 1 : 0,
        advanceAdjustedCount: isAdvanceAdjusted ? 1 : 0,
        totalAmount: isCovered ? 0 : billableAmount,
      })
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) => a.cycleMonths - b.cycleMonths,
  )
})

const chargeTotal = computed(() =>
  chargeEntries.value.reduce(
    (sum, entry) => sum + Number(entry.amount ?? 0),
    0,
  ),
)

const billableChargeTotal = computed(() =>
  chargeEntries.value
    .filter((entry) => !isCamAdvanceCoveredForEntry(entry))
    .reduce((sum, entry) => sum + getEntryNetBillableAmount(entry), 0),
)

const advanceAdjustmentTotal = computed(() =>
  chargeEntries.value.reduce(
    (sum, entry) => sum + Math.max(0, getEntryAdvanceAdjustmentAmount(entry)),
    0,
  ),
)

const chargeUnitsTotal = computed(() =>
  chargeEntries.value.reduce(
    (sum, entry) => sum + Number(entry.consumedUnits ?? 0),
    0,
  ),
)

const chargeAreaTotal = computed(() =>
  chargeEntries.value
    .filter((entry) =>
      props.camRunFlow
        ? getEntryNetBillableAmount(entry) > 0
        : Number(entry.amount ?? 0) > 0,
    )
    .reduce((sum, entry) => sum + Number(entry.areaSqFt ?? 0), 0),
)

const cycleDistributionLabel = computed(() => {
  const counts = new Map<string, number>()

  for (const entry of chargeEntries.value) {
    if ((props.camRunFlow ? getEntryNetBillableAmount(entry) : Number(entry.amount ?? 0)) <= 0) continue

    const label = getCycleLabel(
      entry.cycleMultiplier ?? defaultCycleMonths.value,
    )
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  if (counts.size === 0) return 'No flat cycles saved'

  return Array.from(counts.entries())
    .map(([label, count]) => `${count} ${label.toLowerCase()}`)
    .join(', ')
})

const getCamGenerationGroupStepId = (cycleMonths: number) =>
  `cam-cycle-${cycleMonths}`

const buildCamGenerationProgressSteps = (
  groups: Array<{
    cycleMonths: number
    cycleLabel: string
    period: ReturnType<typeof getCamPeriodForCycle>
    entries: VariableChargeEntry[]
    billableCount: number
    advanceCoveredCount: number
    advanceAdjustedCount: number
  }>,
): GenerationProgressStep[] => [
  {
    id: 'prepare-cam-run',
    label: 'Prepare CAM run',
    detail: `Grouping ${formatUnit(camRunGenerationEntries.value.length, 'flat')} into ${formatUnit(groups.length, 'cycle group')}.`,
    status: 'pending',
  },
  ...groups.map((group) => ({
    id: getCamGenerationGroupStepId(group.cycleMonths),
    label: `${group.cycleLabel} CAM bills`,
    detail: `${formatUnit(group.billableCount, 'bill')} - ${formatUnit(group.advanceCoveredCount, 'advance flat')} fully covered - ${formatUnit(group.advanceAdjustedCount, 'advance flat')} adjusted.`,
    status: 'pending' as const,
  })),
  {
    id: 'bill-delivery',
    label: sendBillsAfterGeneration.value
      ? 'Queue bill delivery'
      : 'Skip bill delivery',
    detail: sendBillsAfterGeneration.value
      ? `Preparing ${formatUnit(selectedBillDeliveryCount.value, 'bill')} for ${billChannels.value.join(', ')}.`
      : 'Bills will be generated without notifications.',
    status: 'pending',
  },
  {
    id: 'refresh-billing-data',
    label: 'Refresh billing data',
    detail: 'Loading the latest periods and CAM entries after generation.',
    status: 'pending',
  },
]

const buildStandardGenerationProgressSteps = (): GenerationProgressStep[] => [
  {
    id: 'generate-dues',
    label: 'Generate bill records',
    detail: `Creating dues for ${formatUnit(selectedFlatIds.value.length, 'flat')}.`,
    status: 'pending',
  },
  {
    id: 'bill-delivery',
    label: sendBillsAfterGeneration.value
      ? 'Queue bill delivery'
      : 'Skip bill delivery',
    detail: sendBillsAfterGeneration.value
      ? `Preparing ${formatUnit(selectedBillDeliveryCount.value, 'bill')} for ${billChannels.value.join(', ')}.`
      : 'Bills will be generated without notifications.',
    status: 'pending',
  },
  {
    id: 'refresh-billing-data',
    label: 'Refresh billing data',
    detail: 'Loading the latest billing period totals.',
    status: 'pending',
  },
]

const invalidChargeEntries = computed(() =>
  props.showAreaRate
    ? []
    : chargeEntries.value.filter(
        (entry) =>
          entry.openingReading != null &&
          entry.closingReading != null &&
          Number(entry.closingReading) < Number(entry.openingReading),
      ),
)

const generationChargeTotal = computed(
  () => generationPreview.value?.totalAmount ?? chargeTotal.value,
)

const activeGenerationStep = computed(
  () =>
    generationProgressSteps.value.find((step) => step.status === 'active') ??
    generationProgressSteps.value.find((step) => step.status === 'error') ??
    generationProgressSteps.value.findLast((step) => step.status === 'done') ??
    null,
)

const generationProgressPercent = computed(() => {
  if (generationProgressSteps.value.length === 0) return 0

  const progress = generationProgressSteps.value.reduce((total, step) => {
    if (step.status === 'done') return total + 1
    if (step.status === 'active') return total + 0.5
    return total
  }, 0)

  return Math.round((progress / generationProgressSteps.value.length) * 100)
})

const getGenerationStepIcon = (status: GenerationProgressStepStatus) => {
  if (status === 'active') return 'pi pi-spinner pi-spin'
  if (status === 'done') return 'pi pi-check'
  if (status === 'error') return 'pi pi-exclamation-triangle'
  return 'pi pi-circle'
}

const resetGenerationProgress = () => {
  generationProgressSteps.value = []
  activeGenerationStepId.value = null
}

const setGenerationProgressSteps = (steps: GenerationProgressStep[]) => {
  generationProgressSteps.value = steps
  activeGenerationStepId.value =
    steps.find((step) => step.status === 'active')?.id ?? null
}

const updateGenerationProgressStep = (
  id: string,
  updates: Partial<Omit<GenerationProgressStep, 'id'>>,
) => {
  generationProgressSteps.value = generationProgressSteps.value.map((step) =>
    step.id === id ? { ...step, ...updates } : step,
  )
}

const startGenerationProgressStep = (id: string, detail?: string) => {
  if (activeGenerationStepId.value && activeGenerationStepId.value !== id) {
    updateGenerationProgressStep(activeGenerationStepId.value, {
      status: 'done',
    })
  }

  activeGenerationStepId.value = id
  updateGenerationProgressStep(id, {
    status: 'active',
    ...(detail ? { detail } : {}),
  })
}

const completeGenerationProgressStep = (id: string, detail?: string) => {
  updateGenerationProgressStep(id, {
    status: 'done',
    ...(detail ? { detail } : {}),
  })

  if (activeGenerationStepId.value === id) {
    activeGenerationStepId.value = null
  }
}

const failActiveGenerationProgressStep = (detail: string) => {
  const fallbackStep = generationProgressSteps.value.find(
    (step) => step.status !== 'done',
  )
  const stepId = activeGenerationStepId.value ?? fallbackStep?.id

  if (!stepId) return

  activeGenerationStepId.value = stepId
  updateGenerationProgressStep(stepId, {
    status: 'error',
    detail,
  })
}

const normalizeChargeNumber = (value: number | null | undefined) => {
  if (value == null) return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const roundChargeValue = (value: number) => Math.round(value * 100) / 100
const roundAreaRateChargeValue = (value: number) => Math.ceil(value)

const getEntryCycleMultiplier = (
  entry: Pick<VariableChargeEntry, 'cycleMultiplier'>,
) =>
  Math.max(
    1,
    normalizeChargeNumber(entry.cycleMultiplier) ??
      (props.showPerFlatCycle ? defaultCycleMonths.value : 1),
  )

const getDefaultAmountForEntry = (
  entry: Pick<VariableChargeEntry, 'cycleMultiplier'>,
) => {
  const defaultAmount = normalizeChargeNumber(defaultFlatAmount.value)
  if (defaultAmount == null) return null

  return props.showPerFlatCycle
    ? roundChargeValue(defaultAmount * getEntryCycleMultiplier(entry))
    : defaultAmount
}

const getRecordPaymentPeriod = (
  entry: Pick<VariableChargeEntry, 'cycleMultiplier'>,
) => {
  if (selectedPeriod.value) return selectedPeriod.value
  if (!props.camRunFlow) return null

  const camPeriod = getCamPeriodForCycle(getEntryCycleMultiplier(entry))
  return (
    periods.value.find(
      (period) =>
        period.chargeType === periodChargeType.value &&
        period.startDate === camPeriod.startDate &&
        period.endDate === camPeriod.endDate,
    ) ?? null
  )
}

const getEntryGenerationPeriod = (
  entry: Pick<VariableChargeEntry, 'cycleMultiplier'>,
) =>
  selectedPeriod.value ??
  (props.camRunFlow
    ? getCamPeriodForCycle(getEntryCycleMultiplier(entry))
    : null)

const toUtcBillingDate = (value: string) => new Date(`${value}T00:00:00Z`)

const toBillingDateInput = (date: Date) => date.toISOString().slice(0, 10)

const minBillingDate = (a: string, b: string) => (a <= b ? a : b)

const maxBillingDate = (a: string, b: string) => (a >= b ? a : b)

const getPeriodMonthSegments = (period: { startDate: string; endDate: string }) => {
  const start = toUtcBillingDate(period.startDate)
  const end = toUtcBillingDate(period.endDate)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [{ startDate: period.startDate, endDate: period.endDate }]
  }

  const segments: { startDate: string; endDate: string }[] = []
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  const endMonthStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))

  while (cursor <= endMonthStart) {
    const monthStart = toBillingDateInput(cursor)
    const monthEnd = toBillingDateInput(
      new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)),
    )

    segments.push({
      startDate: maxBillingDate(period.startDate, monthStart),
      endDate: minBillingDate(period.endDate, monthEnd),
    })

    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  }

  return segments
}

const getEntryCamAdvanceCoverages = (
  entry: Pick<
    VariableChargeEntry,
    'camAdvanceCoveredFrom' | 'camAdvancePaidUntil' | 'camAdvanceCoverages'
  >,
) => {
  if ((entry.camAdvanceCoverages?.length ?? 0) > 0) {
    return entry.camAdvanceCoverages ?? []
  }

  if (!entry.camAdvancePaidUntil) {
    return []
  }

  return [{
    coveredFrom: entry.camAdvanceCoveredFrom ?? '0001-01-01',
    coveredUntil: entry.camAdvancePaidUntil,
  }]
}

const getCamAdvanceCoverageSummaryForEntry = (
  entry: Pick<
    VariableChargeEntry,
    'cycleMultiplier' | 'camAdvanceCoveredFrom' | 'camAdvancePaidUntil' | 'camAdvanceCoverages'
  >,
) => {
  const period = getEntryGenerationPeriod(entry)
  const coverages = getEntryCamAdvanceCoverages(entry)

  if (props.chargeType !== 'CAM' || !period || coverages.length === 0) {
    return {
      totalMonths: getEntryCycleMultiplier(entry),
      coveredMonths: 0,
      remainingMonths: getEntryCycleMultiplier(entry),
      isFullyCovered: false,
    }
  }

  const segments = getPeriodMonthSegments(period)
  const totalMonths = Math.max(1, segments.length)
  const coveredMonths = segments.filter((segment) =>
    coverages.some(
      (coverage) =>
        coverage.coveredFrom <= segment.startDate &&
        coverage.coveredUntil >= segment.endDate,
    ),
  ).length
  const remainingMonths = Math.max(0, totalMonths - coveredMonths)

  return {
    totalMonths,
    coveredMonths,
    remainingMonths,
    isFullyCovered: coveredMonths >= totalMonths,
  }
}

const getEntryGrossAmount = (entry: Pick<VariableChargeEntry, 'amount'>) =>
  Number(entry.amount ?? 0)

const getEntryNetBillableAmount = (
  entry: Pick<
    VariableChargeEntry,
    | 'amount'
    | 'areaSqFt'
    | 'ratePerSqFt'
    | 'cycleMultiplier'
    | 'camAdvanceCoveredFrom'
    | 'camAdvancePaidUntil'
    | 'camAdvanceCoverages'
  >,
) => {
  const grossAmount = getEntryGrossAmount(entry)
  const coverage = getCamAdvanceCoverageSummaryForEntry(entry)

  if (grossAmount <= 0 || coverage.coveredMonths <= 0) {
    return grossAmount
  }

  if (coverage.remainingMonths <= 0) {
    return 0
  }

  const areaSqFt = normalizeChargeNumber(entry.areaSqFt)
  const ratePerSqFt = normalizeChargeNumber(entry.ratePerSqFt)

  if (props.showAreaRate && areaSqFt != null && ratePerSqFt != null) {
    return roundAreaRateChargeValue(areaSqFt * ratePerSqFt * coverage.remainingMonths)
  }

  return roundChargeValue(grossAmount * (coverage.remainingMonths / coverage.totalMonths))
}

const getEntryAdvanceAdjustmentAmount = (
  entry: Pick<
    VariableChargeEntry,
    | 'amount'
    | 'areaSqFt'
    | 'ratePerSqFt'
    | 'cycleMultiplier'
    | 'camAdvanceCoveredFrom'
    | 'camAdvancePaidUntil'
    | 'camAdvanceCoverages'
  >,
) => roundChargeValue(getEntryGrossAmount(entry) - getEntryNetBillableAmount(entry))

const getEntryCamAdvanceLabel = (
  entry: Pick<
    VariableChargeEntry,
    'cycleMultiplier' | 'camAdvanceCoveredFrom' | 'camAdvancePaidUntil' | 'camAdvanceCoverages'
  >,
) => {
  const coverage = getCamAdvanceCoverageSummaryForEntry(entry)

  if (coverage.coveredMonths <= 0) {
    return ''
  }

  return `${coverage.coveredMonths} of ${coverage.totalMonths} month${coverage.totalMonths === 1 ? '' : 's'} covered by advance`
}

const isCamAdvanceCoveredForEntry = (
  entry: Pick<
    VariableChargeEntry,
    'cycleMultiplier' | 'camAdvanceCoveredFrom' | 'camAdvancePaidUntil' | 'camAdvanceCoverages'
  >,
) => {
  return getCamAdvanceCoverageSummaryForEntry(entry).isFullyCovered
}

const getRecordPaymentRoute = (entry: VariableChargeEntry) => {
  const amount = props.camRunFlow
    ? getEntryNetBillableAmount(entry)
    : Number(entry.amount ?? 0)
  const billingPeriodId = getRecordPaymentPeriod(entry)?.id ?? ''

  return {
    path: '/admin/payments/new',
    query: {
      flatId: entry.flatId,
      ...(billingPeriodId ? { billingPeriodId } : {}),
      ...(amount > 0 ? { amount: String(amount) } : {}),
    },
  }
}

const canRecordPaymentForEntry = (entry: VariableChargeEntry) =>
  (props.camRunFlow ? getEntryNetBillableAmount(entry) : Number(entry.amount ?? 0)) > 0 &&
  Number(getRecordPaymentPeriod(entry)?.dueCount ?? 0) > 0

const getRecordPaymentTitle = (entry: VariableChargeEntry) =>
  getRecordPaymentPeriod(entry)
    ? 'Record payment for this bill'
    : 'Record payment for this flat'

const normalizeChargeEntry = (
  entry: VariableChargeEntry,
): VariableChargeEntry => ({
  ...entry,
  areaSqFt: normalizeChargeNumber(entry.areaSqFt),
  camAdvanceCoveredFrom: entry.camAdvanceCoveredFrom || null,
  camAdvancePaidUntil: entry.camAdvancePaidUntil || null,
  camAdvanceCoverages: Array.isArray(entry.camAdvanceCoverages)
    ? entry.camAdvanceCoverages
    : [],
  camAdvanceNote: entry.camAdvanceNote || null,
  camAdvanceUpdatedAt: entry.camAdvanceUpdatedAt || null,
  meterNo: entry.meterNo ?? null,
  openingReading: normalizeChargeNumber(entry.openingReading),
  closingReading: normalizeChargeNumber(entry.closingReading),
  consumedUnits: normalizeChargeNumber(entry.consumedUnits),
  ratePerUnit:
    normalizeChargeNumber(entry.ratePerUnit) ??
    normalizeChargeNumber(defaultRatePerUnit.value),
  ratePerSqFt:
    normalizeChargeNumber(entry.ratePerSqFt) ??
    normalizeChargeNumber(defaultRatePerSqFt.value),
  connectionLoad: entry.connectionLoad ?? (defaultConnectionLoad.value || null),
  previousOutstanding: normalizeChargeNumber(entry.previousOutstanding) ?? 0,
  interestAmount: normalizeChargeNumber(entry.interestAmount) ?? 0,
  cycleMultiplier: props.showPerFlatCycle
    ? getEntryCycleMultiplier(entry)
    : normalizeChargeNumber(entry.cycleMultiplier),
  cycleLabel: props.showPerFlatCycle
    ? getCycleLabel(entry.cycleMultiplier ?? defaultCycleMonths.value)
    : entry.cycleLabel,
  amount: normalizeChargeNumber(entry.amount),
})

const hasReadingInput = (entry: VariableChargeEntry) =>
  entry.openingReading != null ||
  entry.closingReading != null ||
  entry.consumedUnits != null

const recalculateCharge = (entry: VariableChargeEntry) => {
  if (props.showAreaRate) {
    const areaSqFt = normalizeChargeNumber(entry.areaSqFt)
    const ratePerSqFt =
      normalizeChargeNumber(entry.ratePerSqFt) ??
      normalizeChargeNumber(defaultRatePerSqFt.value)

    if (areaSqFt != null && areaSqFt > 0 && ratePerSqFt != null) {
      entry.ratePerSqFt = ratePerSqFt
      entry.amount = roundAreaRateChargeValue(
        areaSqFt * ratePerSqFt * getEntryCycleMultiplier(entry),
      )
    } else if (!props.allowManualAmount) {
      entry.amount = null
    }

    return
  }

  const openingReading = normalizeChargeNumber(entry.openingReading)
  const closingReading = normalizeChargeNumber(entry.closingReading)

  if (openingReading != null && closingReading != null) {
    if (closingReading < openingReading) {
      entry.consumedUnits = null
      if (!props.allowManualAmount) {
        entry.amount = null
      }
      return
    }

    entry.consumedUnits = roundChargeValue(closingReading - openingReading)
  }

  const units = normalizeChargeNumber(entry.consumedUnits)
  const rate = normalizeChargeNumber(entry.ratePerUnit)

  if (units != null && rate != null) {
    entry.amount = roundChargeValue(units * rate)
  } else if (!props.allowManualAmount) {
    entry.amount = null
  }
}

const applyChargeDefaults = () => {
  for (const entry of chargeEntries.value) {
    if (props.showAreaRate) {
      if (entry.cycleMultiplier == null) {
        entry.cycleMultiplier = defaultCycleMonths.value
        entry.cycleLabel = getCycleLabel(defaultCycleMonths.value)
      }

      const ratePerSqFt = normalizeChargeNumber(defaultRatePerSqFt.value)
      if (ratePerSqFt != null) {
        entry.ratePerSqFt = ratePerSqFt
      }

      recalculateCharge(entry)
      continue
    }

    if (entry.ratePerUnit == null) {
      entry.ratePerUnit = defaultRatePerUnit.value
    }

    if (props.showConnectionLoad && !entry.connectionLoad) {
      entry.connectionLoad = defaultConnectionLoad.value
    }

    if (
      props.allowManualAmount &&
      getDefaultAmountForEntry(entry) != null &&
      Number(getDefaultAmountForEntry(entry)) > 0 &&
      !hasReadingInput(entry) &&
      !entry.amount
    ) {
      entry.amount = getDefaultAmountForEntry(entry)
    }

    recalculateCharge(entry)
  }
}

const updateEntryCycle = (entry: VariableChargeEntry, value: unknown) => {
  const cycleMultiplier = Math.max(1, Number(value || 1))
  entry.cycleMultiplier = cycleMultiplier
  entry.cycleLabel = getCycleLabel(cycleMultiplier)
  recalculateCharge(entry)
}

const resetPeriodForm = () => {
  periodForm.label = ''
  periodForm.frequency = props.defaultPeriodFrequency
  periodForm.startDate = ''
  periodForm.endDate = ''
  periodForm.dueDate = ''
}

const applySuggestedPeriod = (
  frequency: BillingFrequency = props.defaultPeriodFrequency,
) => {
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
  const monthCount = frequencyMonthMultipliers[frequency] ?? 1
  const monthEnd = endOfMonth(addMonths(monthStart, monthCount - 1))
  const dueDate = new Date(
    Date.UTC(monthEnd.getUTCFullYear(), monthEnd.getUTCMonth() + 1, 10),
  )

  periodForm.frequency = frequency
  periodForm.label = `${props.mode === 'CAM' ? 'CAM' : 'DG Set'} - ${formatSuggestedCycleLabel(monthStart, monthEnd)}`
  periodForm.startDate = toDateInput(monthStart)
  periodForm.endDate = toDateInput(monthEnd)
  periodForm.dueDate = toDateInput(dueDate)
}

const openCreatePeriod = () => {
  resetPeriodForm()
  applySuggestedPeriod()
  periodDialogVisible.value = true
}

const createPeriod = async () => {
  if (periodForm.startDate > periodForm.endDate) {
    toast.add({
      severity: 'warn',
      summary: 'Check dates',
      detail: 'Start date must be before or equal to end date.',
      life: 10000,
    })
    return
  }

  savingPeriod.value = true

  try {
    const response = await api<PeriodCreateResponse>(
      '/api/admin/billing/periods',
      {
        method: 'POST',
        body: {
          ...periodForm,
          chargeType: periodChargeType.value,
        },
      },
    )

    selectedPeriodId.value = response.data.id
    periodDialogVisible.value = false
    await refreshPeriods()
    toast.add({
      severity: 'success',
      summary: 'Period created',
      detail: `${periodForm.label} is ready for ${props.chargeName}.`,
      life: 10000,
    })
  } finally {
    savingPeriod.value = false
  }
}

const ensureCamRunPeriod = async (
  period: ReturnType<typeof getCamPeriodForCycle>,
) => {
  const existing = periods.value.find(
    (item) =>
      item.chargeType === periodChargeType.value &&
      item.startDate === period.startDate &&
      item.endDate === period.endDate,
  )

  if (existing) return existing.id

  try {
    const response = await api<PeriodCreateResponse>(
      '/api/admin/billing/periods',
      {
        method: 'POST',
        showErrorToast: false,
        body: {
          ...period,
          chargeType: periodChargeType.value,
        },
      },
    )

    await refreshPeriods()
    return response.data.id
  } catch (error) {
    await refreshPeriods()
    const afterCreateRace = periods.value.find(
      (item) =>
        item.chargeType === periodChargeType.value &&
        item.startDate === period.startDate &&
        item.endDate === period.endDate,
    )

    if (afterCreateRace) return afterCreateRace.id
    throw error
  }
}

const loadVariableCharges = async () => {
  if (props.camRunFlow) {
    loadingCharges.value = true

    try {
      const response = await api<FlatListResponse>('/api/admin/flats', {
        query: {
          page: 1,
          pageSize: 2000,
          isActive: 'true',
          sortBy: 'flatNumber',
          sortDirection: 'asc',
        },
      })

      chargeEntries.value = response.data.items.map((flat) =>
        normalizeChargeEntry({
          flatId: flat.id,
          flatNumber: flat.flatNumber,
          blockName: flat.blockName,
          unitType: flat.unitType,
          areaSqFt: flat.areaSqFt,
          camAdvanceCoveredFrom: flat.camAdvanceCoveredFrom ?? null,
          camAdvancePaidUntil: flat.camAdvancePaidUntil ?? null,
          camAdvanceCoverages: flat.camAdvanceCoverages ?? [],
          camAdvanceNote: flat.camAdvanceNote ?? null,
          camAdvanceUpdatedAt: flat.camAdvanceUpdatedAt ?? null,
          meterNo: null,
          openingReading: null,
          closingReading: null,
          consumedUnits: null,
          ratePerUnit: null,
          ratePerSqFt: defaultRatePerSqFt.value,
          connectionLoad: null,
          previousOutstanding: 0,
          interestAmount: 0,
          cycleMultiplier: defaultCycleMonths.value,
          cycleLabel: getCycleLabel(defaultCycleMonths.value),
          amount: null,
        }),
      )
      applyChargeDefaults()
    } finally {
      loadingCharges.value = false
    }
    return
  }

  if (!selectedPeriodId.value) {
    chargeEntries.value = []
    return
  }

  loadingCharges.value = true

  try {
    const response = await api<VariableChargesResponse>(
      `/api/admin/billing/periods/${selectedPeriodId.value}/variable-charges`,
      {
        query: {
          chargeName: props.chargeName,
        },
      },
    )
    chargeEntries.value = response.data.items.map(normalizeChargeEntry)
  } finally {
    loadingCharges.value = false
  }
}

const saveVariableCharges = async () => {
  if (!selectedPeriod.value) return

  if (props.showAreaRate) {
    for (const entry of chargeEntries.value) {
      recalculateCharge(entry)
    }
  }

  if (invalidChargeEntries.value.length > 0) {
    toast.add({
      severity: 'warn',
      summary: 'Check readings',
      detail: `${formatUnit(invalidChargeEntries.value.length, 'flat')} has closing below opening.`,
      life: 10000,
    })
    return
  }

  savingCharges.value = true

  try {
    const response = await api<VariableChargesSaveResponse>(
      `/api/admin/billing/periods/${selectedPeriod.value.id}/variable-charges`,
      {
        method: 'PUT',
        body: {
          chargeName: props.chargeName,
          chargeLabel: props.chargeLabel,
          chargeType: props.chargeType,
          source: props.source,
          electricityType: props.electricityType,
          entries: chargeEntries.value.map((entry) => ({
            flatId: entry.flatId,
            areaSqFt: props.showAreaRate ? entry.areaSqFt : null,
            ratePerSqFt: props.showAreaRate
              ? (entry.ratePerSqFt ?? defaultRatePerSqFt.value)
              : null,
            meterNo: props.showAreaRate ? null : entry.meterNo || null,
            openingReading: props.showAreaRate ? null : entry.openingReading,
            closingReading: props.showAreaRate ? null : entry.closingReading,
            consumedUnits: props.showAreaRate ? null : entry.consumedUnits,
            ratePerUnit: props.showAreaRate ? null : entry.ratePerUnit,
            connectionLoad: entry.connectionLoad || null,
            previousOutstanding: entry.previousOutstanding ?? 0,
            interestAmount: entry.interestAmount ?? 0,
            cycleMultiplier: props.showPerFlatCycle
              ? getEntryCycleMultiplier(entry)
              : null,
            cycleLabel: props.showPerFlatCycle
              ? getCycleLabel(entry.cycleMultiplier ?? defaultCycleMonths.value)
              : null,
            amount: Number(entry.amount ?? 0),
          })),
        },
      },
    )

    toast.add({
      severity: 'success',
      summary: props.savedSummary,
      detail: `${response.data.saved} flat charge${response.data.saved === 1 ? '' : 's'} saved for this period.`,
      life: 10000,
    })
    await refreshPeriods()
    await loadVariableCharges()
  } finally {
    savingCharges.value = false
  }
}

const loadGenerationPreview = async () => {
  if (!selectedPeriod.value) return

  if (selectedFlatIds.value.length === 0) {
    generationPreview.value = null
    return
  }

  loadingGenerationPreview.value = true

  try {
    const response = await api<PreviewResponse>(
      '/api/admin/billing/dues/preview',
      {
        query: {
          billingPeriodId: selectedPeriod.value.id,
          flatIds: selectedFlatIds.value.join(','),
        },
      },
    )

    generationPreview.value = response.data
  } finally {
    loadingGenerationPreview.value = false
  }
}

const resetBillDeliveryOptions = (flatIds: string[]) => {
  sendBillsAfterGeneration.value = false
  billChannels.value = ['EMAIL']
  billDeliveryFlatIds.value = [...flatIds]
}

const sendGeneratedBillNotifications = async (
  targets: GeneratedDueTarget[],
) => {
  if (!sendBillsAfterGeneration.value) {
    return null
  }

  const selectedFlatIdSet = new Set(billDeliveryFlatIds.value)
  const dueIds = Array.from(
    new Set(
      targets
        .filter((target) => selectedFlatIdSet.has(target.flatId))
        .map((target) => target.dueId),
    ),
  )

  if (dueIds.length === 0) {
    return { eligible: 0, jobCount: 0 }
  }

  const response = await api<BillSendResponse>(
    '/api/admin/billing/dues/send-bills',
    {
      method: 'POST',
      showErrorToast: false,
      body: {
        dueIds,
        channels: billChannels.value,
      },
    },
  )

  return response.data
}

const getUniqueDueIds = (targets: GeneratedDueTarget[]) =>
  Array.from(new Set(targets.map((target) => target.dueId)))

const downloadLastGeneratedBillPdfs = () => {
  if (lastGeneratedDueIds.value.length === 0) return

  void downloadBillPdfs({
    dueIds: lastGeneratedDueIds.value,
  })
}

const openGenerationDialog = async () => {
  resetGenerationProgress()

  if (props.camRunFlow) {
    for (const entry of chargeEntries.value) {
      recalculateCharge(entry)
    }

    if (camRunDueDate.value < camRunStartDate.value) {
      toast.add({
        severity: 'warn',
        summary: 'Check due date',
        detail: 'CAM due date must be on or after the run start date.',
        life: 10000,
      })
      return
    }

    if (camRunBillDate.value < camRunStartDate.value) {
      toast.add({
        severity: 'warn',
        summary: 'Check bill date',
        detail: 'CAM bill date must be on or after the run start date.',
        life: 10000,
      })
      return
    }

    if (camRunGenerationEntries.value.length === 0) {
      toast.add({
        severity: 'warn',
        summary: 'Apply defaults first',
        detail: `Apply the CAM rate before generating ${props.chargeName} bills. Manage prepaid coverage in CAM Advance first.`,
        life: 10000,
      })
      return
    }

    generationPreview.value = null
    resetBillDeliveryOptions(
      camBillableEntries.value.map((entry) => entry.flatId),
    )
    generationDialogVisible.value = true
    return
  }

  if (!selectedPeriod.value) {
    toast.add({
      severity: 'warn',
      summary: 'Select period',
      detail: `Create or select a ${props.chargeName} period before generating bills.`,
      life: 10000,
    })
    return
  }

  if (billableFlatIds.value.length === 0) {
    toast.add({
      severity: 'warn',
      summary: 'Save charges first',
      detail: `Save at least one flat amount before generating ${props.chargeName} bills.`,
      life: 10000,
    })
    return
  }

  selectedFlatIds.value = [...billableFlatIds.value]
  resetBillDeliveryOptions(selectedFlatIds.value)
  generationPreview.value = null
  generationDialogVisible.value = true
  await loadGenerationPreview()
}

const generateDues = async () => {
  if (sendBillsAfterGeneration.value) {
    if (billChannels.value.length === 0) {
      toast.add({
        severity: 'warn',
        summary: 'Select channel',
        detail: 'Choose at least one bill delivery channel.',
        life: 10000,
      })
      return
    }

    if (selectedBillDeliveryCount.value === 0) {
      toast.add({
        severity: 'warn',
        summary: 'Select bills',
        detail: 'Choose at least one flat bill to send.',
        life: 10000,
      })
      return
    }
  }

  if (props.camRunFlow) {
    const groups = [...camRunGroups.value]
    if (groups.length === 0) return

    setGenerationProgressSteps(buildCamGenerationProgressSteps(groups))
    generating.value = true

    try {
      let generated = 0
      let skipped = 0
      let advanceCoveredCount = 0
      let advanceProratedCount = 0
      let advanceProratedAmount = 0
      let overlapSkippedCount = 0
      let advanceAppliedCount = 0
      let advanceAppliedAmount = 0
      const billSendTargets: GeneratedDueTarget[] = []

      startGenerationProgressStep(
        'prepare-cam-run',
        `Preparing ${formatUnit(groups.length, 'cycle group')} from ${formatUnit(camRunGenerationEntries.value.length, 'flat')}.`,
      )
      completeGenerationProgressStep(
        'prepare-cam-run',
        `${formatUnit(groups.length, 'cycle group')} ready for backend generation.`,
      )

      for (const group of groups) {
        const groupStepId = getCamGenerationGroupStepId(group.cycleMonths)

        startGenerationProgressStep(
          groupStepId,
          `Checking or creating ${group.cycleLabel.toLowerCase()} billing period.`,
        )
        const periodId = await ensureCamRunPeriod(group.period)

        updateGenerationProgressStep(groupStepId, {
          detail: `Saving ${formatUnit(group.entries.length, 'flat')} CAM charge${group.entries.length === 1 ? '' : 's'} for ${group.period.label}.`,
        })
        await api<VariableChargesSaveResponse>(
          `/api/admin/billing/periods/${periodId}/variable-charges`,
          {
            method: 'PUT',
            showErrorToast: false,
            body: {
              chargeName: props.chargeName,
              chargeLabel: props.chargeLabel,
              chargeType: props.chargeType,
              source: props.source,
              electricityType: props.electricityType,
              entries: group.entries.map((entry) => ({
                flatId: entry.flatId,
                areaSqFt: entry.areaSqFt,
                ratePerSqFt: entry.ratePerSqFt ?? defaultRatePerSqFt.value,
                meterNo: null,
                openingReading: null,
                closingReading: null,
                consumedUnits: null,
                ratePerUnit: null,
                connectionLoad: null,
                previousOutstanding: entry.previousOutstanding ?? 0,
                interestAmount: entry.interestAmount ?? 0,
                cycleMultiplier: group.cycleMonths,
                cycleLabel: group.cycleLabel,
                amount: Number(entry.amount ?? 0),
              })),
            },
          },
        )

        updateGenerationProgressStep(groupStepId, {
          detail: `Generating bill records for ${formatUnit(group.billableCount, 'flat')}.`,
        })
        const response = await api<GenerationResponse>(
          '/api/admin/billing/dues',
          {
            method: 'POST',
            showErrorToast: false,
            body: {
              billingPeriodId: periodId,
              flatIds: group.entries.map((entry) => entry.flatId),
              billDate: camRunBillDate.value,
            },
          },
        )

        generated += response.data.generated
        skipped += response.data.skipped
        advanceCoveredCount += response.data.advanceCoveredCount
        advanceProratedCount += response.data.advanceProratedCount ?? 0
        advanceProratedAmount = roundChargeValue(
          advanceProratedAmount + (response.data.advanceProratedAmount ?? 0),
        )
        overlapSkippedCount += response.data.overlapSkippedCount
        advanceAppliedCount += response.data.advanceAppliedCount
        billSendTargets.push(
          ...response.data.generatedDues,
          ...response.data.skippedDues,
        )
        advanceAppliedAmount = roundChargeValue(
          advanceAppliedAmount + response.data.advanceAppliedAmount,
        )
        completeGenerationProgressStep(
          groupStepId,
          [
            `${response.data.generated} created`,
            `${response.data.skipped} skipped`,
            response.data.advanceCoveredCount > 0
              ? `${formatUnit(response.data.advanceCoveredCount, 'advance flat')} covered`
              : '',
            (response.data.advanceProratedCount ?? 0) > 0
              ? `${formatMoney(response.data.advanceProratedAmount ?? 0)} advance deducted`
              : '',
            response.data.overlapSkippedCount > 0
              ? `${formatUnit(response.data.overlapSkippedCount, 'overlap')} skipped`
              : '',
            response.data.advanceAppliedAmount > 0
              ? `${formatMoney(response.data.advanceAppliedAmount)} advance applied`
              : '',
          ]
            .filter(Boolean)
            .join(', ') + '.',
        )
      }

      startGenerationProgressStep(
        'bill-delivery',
        sendBillsAfterGeneration.value
          ? `Queueing selected bill notifications for ${billChannels.value.join(', ')}.`
          : 'Bill delivery is off for this run.',
      )
      const sentBills = await sendGeneratedBillNotifications(billSendTargets)
      lastGeneratedDueIds.value = getUniqueDueIds(billSendTargets)
      completeGenerationProgressStep(
        'bill-delivery',
        sentBills
          ? `${formatUnit(sentBills.jobCount, 'delivery job')} queued for ${formatUnit(sentBills.eligible, 'bill')}.`
          : 'Bill delivery skipped.',
      )

      startGenerationProgressStep(
        'refresh-billing-data',
        'Refreshing periods and CAM entries so the screen matches the generated bills.',
      )
      await refreshPeriods()
      await loadVariableCharges()
      completeGenerationProgressStep(
        'refresh-billing-data',
        'Latest CAM billing data loaded.',
      )

      toast.add({
        severity: 'success',
        summary: 'CAM bills generated',
        detail:
          [
            `${generated} created`,
            `${skipped} skipped`,
            advanceCoveredCount > 0
              ? `${formatUnit(advanceCoveredCount, 'advance flat')} covered`
              : '',
            advanceProratedAmount > 0
              ? `${formatMoney(advanceProratedAmount)} advance deducted across ${formatUnit(advanceProratedCount, 'flat')}`
              : '',
            overlapSkippedCount > 0
              ? `${formatUnit(overlapSkippedCount, 'overlap')} skipped`
              : '',
            advanceAppliedAmount > 0
              ? `${formatMoney(advanceAppliedAmount)} advance applied across ${formatUnit(advanceAppliedCount, 'flat')}`
              : '',
            sentBills
              ? `${sentBills.jobCount} delivery job${sentBills.jobCount === 1 ? '' : 's'} queued`
              : '',
          ]
            .filter(Boolean)
            .join(', ') + '.',
        life: 10000,
      })

      generationDialogVisible.value = false
    } catch (error) {
      const detail = getApiErrorMessage(
        error,
        'CAM bill generation stopped before completion. Please check the current step and try again.',
      )
      failActiveGenerationProgressStep(
        detail,
      )
      toast.add({
        severity: 'error',
        summary: 'CAM bill generation failed',
        detail,
        life: 15000,
      })
    } finally {
      generating.value = false
    }
    return
  }

  if (!selectedPeriod.value || !generationPreview.value) return

  setGenerationProgressSteps(buildStandardGenerationProgressSteps())
  generating.value = true

  try {
    startGenerationProgressStep(
      'generate-dues',
      `Creating bill records for ${formatUnit(selectedFlatIds.value.length, 'flat')}.`,
    )
    const response = await api<GenerationResponse>('/api/admin/billing/dues', {
      method: 'POST',
      showErrorToast: false,
      body: {
        billingPeriodId: selectedPeriod.value.id,
        flatIds: selectedFlatIds.value.length
          ? selectedFlatIds.value
          : undefined,
      },
    })
    completeGenerationProgressStep(
      'generate-dues',
      `${response.data.generated} created, ${response.data.skipped} skipped.`,
    )

    startGenerationProgressStep(
      'bill-delivery',
      sendBillsAfterGeneration.value
        ? `Queueing selected bill notifications for ${billChannels.value.join(', ')}.`
        : 'Bill delivery is off for this run.',
    )
    const sentBills = await sendGeneratedBillNotifications([
      ...response.data.generatedDues,
      ...response.data.skippedDues,
    ])
    lastGeneratedDueIds.value = getUniqueDueIds([
      ...response.data.generatedDues,
      ...response.data.skippedDues,
    ])
    completeGenerationProgressStep(
      'bill-delivery',
      sentBills
        ? `${formatUnit(sentBills.jobCount, 'delivery job')} queued for ${formatUnit(sentBills.eligible, 'bill')}.`
        : 'Bill delivery skipped.',
    )

    toast.add({
      severity: 'success',
      summary: 'Bills generated',
      detail:
        [
          `${response.data.generated} created`,
          `${response.data.skipped} skipped`,
          response.data.advanceAppliedAmount > 0
            ? `${formatMoney(response.data.advanceAppliedAmount)} advance applied`
            : '',
          sentBills
            ? `${sentBills.jobCount} delivery job${sentBills.jobCount === 1 ? '' : 's'} queued`
            : '',
        ]
          .filter(Boolean)
          .join(', ') + '.',
      life: 10000,
    })

    startGenerationProgressStep(
      'refresh-billing-data',
      'Refreshing billing period totals.',
    )
    await refreshPeriods()
    completeGenerationProgressStep(
      'refresh-billing-data',
      'Latest billing data loaded.',
    )
    generationDialogVisible.value = false
  } catch (error) {
    const detail = getApiErrorMessage(error)
    failActiveGenerationProgressStep(
      detail,
    )
    toast.add({
      severity: 'error',
      summary: 'Bill generation failed',
      detail,
      life: 15000,
    })
  } finally {
    generating.value = false
  }
}

watch(selectedFlatIds, () => {
  if (generationDialogVisible.value) {
    void loadGenerationPreview()
  }
})

watch(
  periods,
  (items) => {
    if (props.camRunFlow) {
      selectedPeriodId.value = ''
      return
    }

    if (items.length === 0) {
      selectedPeriodId.value = ''
      return
    }

    if (
      !selectedPeriodId.value ||
      !items.some((period) => period.id === selectedPeriodId.value)
    ) {
      selectedPeriodId.value =
        items.find((period) => !period.isLocked)?.id ?? items[0]?.id ?? ''
    }
  },
  { immediate: true },
)

watch(camRunStartDate, (value) => {
  const normalizedDate = normalizeCamRunDate(value)
  if (value !== normalizedDate) {
    camRunStartDate.value = normalizedDate
    return
  }

  if (camRunDueDate.value < camRunStartDate.value) {
    camRunDueDate.value = normalizedDate
  }

  if (camRunBillDate.value < camRunStartDate.value) {
    camRunBillDate.value = normalizedDate
  }
})

watch(
  selectedPeriodId,
  () => {
    chargeSearch.value = ''
    void loadVariableCharges()
  },
  { immediate: true },
)
</script>

<template>
  <div class="landing-page">
    <section class="billing-command-panel">
      <header class="billing-command-header">
        <div>
          <p class="eyebrow">{{ eyebrow }}</p>
          <h1>{{ title }}</h1>
          <p>{{ description }}</p>
        </div>
        <div class="billing-command-actions">
          <Button
            v-if="!camRunFlow"
            label="Create period"
            icon="pi pi-calendar-plus"
            severity="secondary"
            outlined
            @click="openCreatePeriod"
          />
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
            :label="camRunFlow ? 'Generate CAM bills' : 'Generate bills'"
            icon="pi pi-bolt"
            :disabled="camRunFlow ? loadingCharges : !selectedPeriod"
            @click="openGenerationDialog"
          />
        </div>
      </header>

      <div class="billing-cycle-guide" aria-label="Charge entry summary">
        <div>
          <span>{{ camRunFlow ? 'Start date' : 'Selected period' }}</span>
          <strong>
            {{
              camRunFlow
                ? formatDate(camRunStartDate)
                : (selectedPeriod?.label ?? 'No period selected')
            }}
          </strong>
          <p>{{ selectedCycleLabel }}</p>
        </div>
        <div>
          <span>{{ amountSummaryLabel }}</span>
          <strong>{{
            formatMoney(camRunFlow ? billableChargeTotal : chargeTotal)
          }}</strong>
          <p>
            {{
              camRunFlow
                ? `${formatUnit(camBillableEntries.length, 'bill')} - ${formatMoney(advanceAdjustmentTotal)} advance deducted`
                : `${formatUnit(filledChargeCount, 'flat')} with saved amount.`
            }}
          </p>
        </div>
        <div>
          <span>{{
            camRunFlow
              ? 'Cycle split'
              : showPerFlatCycle
                ? 'Flat cycles'
                : 'Readings'
          }}</span>
          <strong v-if="showPerFlatCycle"
            >{{ filledChargeCount }} configured</strong
          >
          <strong v-else
            >{{ formatNumber(chargeUnitsTotal) }}
            {{ unitsSummaryLabel }}</strong
          >
          <p>
            {{
              showPerFlatCycle
                ? cycleDistributionLabel
                : `${selectedCycleMonths} ${selectedCycleMonths === 1 ? 'month' : 'months'} in this period.`
            }}
          </p>
        </div>
      </div>
    </section>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>{{ title }}</h1>
          <p>
            {{
              camRunFlow
                ? 'Choose the start date, apply defaults, adjust monthly or yearly flats, then generate CAM bills.'
                : showAreaRate
                  ? 'Create or select a charge period, apply the CAM rate by flat area and cycle, then save.'
                  : 'Create or select a charge period, enter per-flat readings or amounts, then save.'
            }}
          </p>
        </div>
        <div class="list-page__exports">
          <Button
            v-if="!camRunFlow"
            label="Create period"
            icon="pi pi-calendar-plus"
            severity="secondary"
            outlined
            @click="openCreatePeriod"
          />
        </div>
      </header>

      <div class="list-page__toolbar">
        <label v-if="camRunFlow">
          <span class="field-label">
            Start date
            <AppHelpIcon
              text="The date from which this CAM invoice run begins. Internal periods are created per flat cycle."
            />
          </span>
          <InputText v-model="camRunStartDate" type="date" />
        </label>
        <label v-if="camRunFlow">
          <span class="field-label">
            Due date
            <AppHelpIcon
              text="Payment deadline shown on all CAM bills generated from this run."
            />
          </span>
          <InputText v-model="camRunDueDate" type="date" :min="camRunStartDate" />
        </label>
        <label v-if="camRunFlow">
          <span class="field-label">
            Bill date
            <AppHelpIcon
              text="Date stamped on generated CAM PDF bills."
            />
          </span>
          <InputText v-model="camRunBillDate" type="date" :min="camRunStartDate" />
        </label>
        <label v-if="!camRunFlow" class="list-page__search">
          <span class="field-label">
            Charge period
            <AppHelpIcon
              text="Select the period for this CAM or DG Set charge run. Create it here when needed."
            />
          </span>
          <Select
            v-model="selectedPeriodId"
            :options="periodOptions"
            option-label="label"
            option-value="value"
            :loading="periodsPending"
            placeholder="Select period"
          />
        </label>
        <div class="list-page__filters">
          <label>
            <span class="field-label">
              Find flat
              <AppHelpIcon text="Search by block, flat number, or unit type." />
            </span>
            <IconField>
              <InputIcon class="pi pi-search" />
              <InputText v-model="chargeSearch" placeholder="Search flats" />
            </IconField>
          </label>
        </div>
      </div>

      <Message v-if="!camRunFlow && selectedPeriod?.isLocked" severity="warn">
        This charge period is locked. Unlock it before changing saved charges.
      </Message>
      <Message
        v-else-if="!camRunFlow && (selectedPeriod?.dueCount ?? 0) > 0"
        severity="warn"
      >
        Bills already exist for this charge period. Saved changes will not alter
        already-generated dues.
      </Message>

      <section class="billing-variable-charge-panel">
        <header>
          <div>
            <p class="eyebrow">{{ chargeName }}</p>
            <h3>Per-flat entries</h3>
            <p>
              {{
                showAreaRate
                  ? 'CAM is calculated from each flat area, the monthly sq ft rate, and the selected flat cycle.'
                  : 'Opening and closing readings calculate units automatically. You can also enter direct amounts where applicable.'
              }}
            </p>
            <p v-if="camRunFlow">
              CAM advance coverage is managed in
              <NuxtLink to="/admin/billing/cam-advance">CAM Advance</NuxtLink>.
              Advance-covered months are deducted from the payable CAM amount.
            </p>
          </div>
          <div>
            <strong>{{
              formatMoney(camRunFlow ? billableChargeTotal : chargeTotal)
            }}</strong>
            <span>
              {{
                camRunFlow
                  ? `${formatMoney(chargeTotal)} gross - ${formatMoney(advanceAdjustmentTotal)} advance deducted`
                  : `${formatUnit(filledChargeCount, 'flat')} - ${
                      showAreaRate
                        ? `${formatNumber(chargeAreaTotal)} sq ft`
                        : `${formatNumber(chargeUnitsTotal)} ${unitsSummaryLabel}`
                    }`
              }}
            </span>
          </div>
        </header>

        <div class="billing-variable-charge-defaults">
          <label v-if="allowManualAmount">
            <span class="field-label">
              {{ defaultAmountLabel }}
              <AppHelpIcon
                text="Applied to rows without readings or an existing amount."
              />
            </span>
            <InputNumber
              v-model="defaultFlatAmount"
              :min="0"
              :max-fraction-digits="2"
              fluid
            />
          </label>
          <label v-if="showAreaRate">
            <span class="field-label">
              {{ defaultRateLabel }}
              <AppHelpIcon
                text="Monthly CAM rate multiplied by flat area and selected cycle."
              />
            </span>
            <InputNumber
              v-model="defaultRatePerSqFt"
              :min="0"
              :max-fraction-digits="2"
              fluid
            />
          </label>
          <label v-else>
            <span class="field-label">
              {{ defaultRateLabel }}
              <AppHelpIcon
                text="Used when a flat row does not already have its own rate."
              />
            </span>
            <InputNumber
              v-model="defaultRatePerUnit"
              :min="0"
              :max-fraction-digits="2"
              fluid
            />
          </label>
          <label v-if="showConnectionLoad">
            <span class="field-label">
              Connection load
              <AppHelpIcon
                text="Printed on rows that do not have a custom connection load."
              />
            </span>
            <InputText v-model="defaultConnectionLoad" />
          </label>
          <Button
            label="Apply defaults"
            icon="pi pi-clone"
            severity="secondary"
            outlined
            @click="applyChargeDefaults"
          />
        </div>

        <div class="billing-variable-charge-toolbar">
          <span>
            {{
              camRunFlow
                ? 'CAM periods are created internally by each flat cycle.'
                : (selectedPeriod?.label ?? 'No period selected')
            }}
          </span>
          <Button
            v-if="camRunFlow"
            label="Manage CAM advance coverage"
            icon="pi pi-calendar"
            severity="secondary"
            outlined
            as="router-link"
            to="/admin/billing/cam-advance"
          />
          <Button
            v-if="camRunFlow"
            label="Generate CAM bills"
            icon="pi pi-bolt"
            severity="secondary"
            outlined
            :loading="generating"
            :disabled="loadingCharges || camRunGenerationEntries.length === 0"
            @click="openGenerationDialog"
          />
          <Button
            v-else
            :label="saveButtonLabel"
            icon="pi pi-save"
            severity="secondary"
            outlined
            :loading="savingCharges"
            :disabled="
              !selectedPeriod ||
              selectedPeriod.isLocked ||
              invalidChargeEntries.length > 0
            "
            @click="saveVariableCharges"
          />
        </div>

        <Message v-if="invalidChargeEntries.length > 0" severity="warn">
          {{ formatUnit(invalidChargeEntries.length, 'flat') }} has closing
          reading below opening reading.
        </Message>

        <AppSkeletonState v-if="loadingCharges" />
        <AppDataTable
          v-else
          class="billing-variable-charge-table"
          :value="filteredChargeEntries"
          scrollable
          scroll-height="28rem"
          responsive-layout="scroll"
          size="small"
        >
          <Column header="Flat" style="min-width: 10rem">
            <template #body="{ data: row }">
              <div class="billing-period-cell">
                <strong>{{ row.blockName }} {{ row.flatNumber }}</strong>
                <span>{{ row.unitType }}</span>
              </div>
            </template>
          </Column>
          <Column v-if="showAreaRate" header="Area" style="min-width: 7rem">
            <template #body="{ data: row }">
              <strong>{{
                row.areaSqFt ? `${formatNumber(row.areaSqFt)} sq ft` : '-'
              }}</strong>
            </template>
          </Column>
          <Column
            v-if="showPerFlatCycle"
            header="Cycle"
            style="min-width: 9rem"
          >
            <template #body="{ data: row }">
              <Select
                :model-value="row.cycleMultiplier ?? defaultCycleMonths"
                :options="cycleOptions"
                option-label="label"
                option-value="value"
                fluid
                @update:model-value="(value) => updateEntryCycle(row, value)"
              />
            </template>
          </Column>
          <Column
            v-if="!showAreaRate"
            :header="meterLabel"
            style="min-width: 8rem"
          >
            <template #body="{ data: row }">
              <InputText v-model="row.meterNo" placeholder="Optional" fluid />
            </template>
          </Column>
          <Column
            v-if="!showAreaRate"
            header="Opening"
            style="min-width: 7.5rem"
          >
            <template #body="{ data: row }">
              <InputNumber
                v-model="row.openingReading"
                :min="0"
                :max-fraction-digits="2"
                placeholder="0"
                fluid
                @update:model-value="recalculateCharge(row)"
              />
            </template>
          </Column>
          <Column
            v-if="!showAreaRate"
            header="Closing"
            style="min-width: 7.5rem"
          >
            <template #body="{ data: row }">
              <InputNumber
                v-model="row.closingReading"
                :min="0"
                :max-fraction-digits="2"
                placeholder="0"
                fluid
                @update:model-value="recalculateCharge(row)"
              />
            </template>
          </Column>
          <Column v-if="!showAreaRate" header="Units" style="min-width: 7rem">
            <template #body="{ data: row }">
              <InputNumber
                v-model="row.consumedUnits"
                :min="0"
                :max-fraction-digits="2"
                placeholder="0"
                fluid
                :disabled="
                  row.openingReading != null && row.closingReading != null
                "
                @update:model-value="recalculateCharge(row)"
              />
            </template>
          </Column>
          <Column
            v-if="showAreaRate"
            header="Rate/sq ft/month"
            style="min-width: 9rem"
          >
            <template #body="{ data: row }">
              <InputNumber
                v-model="row.ratePerSqFt"
                :min="0"
                :max-fraction-digits="2"
                placeholder="0"
                fluid
                @update:model-value="recalculateCharge(row)"
              />
            </template>
          </Column>
          <Column v-else header="Rate/unit" style="min-width: 7.5rem">
            <template #body="{ data: row }">
              <InputNumber
                v-model="row.ratePerUnit"
                :min="0"
                :max-fraction-digits="2"
                placeholder="0"
                fluid
                @update:model-value="recalculateCharge(row)"
              />
            </template>
          </Column>
          <Column header="Amount" style="min-width: 8rem">
            <template #body="{ data: row }">
              <InputNumber
                v-if="allowManualAmount"
                v-model="row.amount"
                :min="0"
                :max-fraction-digits="2"
                placeholder="0"
                fluid
              />
              <div v-else>
                <strong>{{
                  formatMoney(
                    camRunFlow
                      ? getEntryNetBillableAmount(row)
                      : Number(row.amount ?? 0),
                  )
                }}</strong>
                <p
                  v-if="
                    camRunFlow && getEntryAdvanceAdjustmentAmount(row) > 0
                  "
                  class="table-muted"
                >
                  {{ formatMoney(Number(row.amount ?? 0)) }} gross -
                  {{ formatMoney(getEntryAdvanceAdjustmentAmount(row)) }}
                  advance
                </p>
                <p
                  v-if="camRunFlow && getEntryCamAdvanceLabel(row)"
                  class="table-muted"
                >
                  {{ getEntryCamAdvanceLabel(row) }}
                </p>
              </div>
            </template>
          </Column>
          <Column
            v-if="showConnectionLoad"
            header="Load"
            style="min-width: 8.5rem"
          >
            <template #body="{ data: row }">
              <InputText
                v-model="row.connectionLoad"
                placeholder="4 KW (5KVA)"
                fluid
              />
            </template>
          </Column>
          <Column header="Payment" style="width: 5rem">
            <template #body="{ data: row }">
              <Button
                as="router-link"
                :to="getRecordPaymentRoute(row)"
                icon="pi pi-credit-card"
                severity="secondary"
                text
                rounded
                :aria-label="getRecordPaymentTitle(row)"
                :title="getRecordPaymentTitle(row)"
                :disabled="!canRecordPaymentForEntry(row)"
              />
            </template>
          </Column>
        </AppDataTable>
      </section>
    </section>

    <Dialog
      v-if="!camRunFlow"
      v-model:visible="periodDialogVisible"
      :header="`Create ${chargeName} period`"
      modal
      :style="{ width: '520px' }"
    >
      <form class="admin-form-layout" @submit.prevent="createPeriod">
        <div class="billing-dialog-intro">
          <div>
            <p class="eyebrow">{{ chargeName }}</p>
            <h2>{{ periodForm.label || 'New charge period' }}</h2>
            <p>Choose the date range and due date for this charge run.</p>
          </div>
          <div class="billing-cycle-presets">
            <Button
              v-for="option in frequencyOptions.filter(
                (item) => item.value !== 'CUSTOM',
              )"
              :key="option.value"
              type="button"
              :label="option.label"
              icon="pi pi-calendar"
              severity="secondary"
              outlined
              @click="applySuggestedPeriod(option.value)"
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
              <AppHelpIcon
                text="Readable name shown on bills, such as CAM - July - September 2026."
              />
            </span>
            <InputText v-model="periodForm.label" required />
          </label>
          <label>
            <span class="field-label">
              Tenure
              <AppHelpIcon text="Default date span for this charge period." />
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
              <AppHelpIcon text="First date covered by this charge period." />
            </span>
            <InputText v-model="periodForm.startDate" type="date" required />
          </label>
          <label>
            <span class="field-label">
              End date
              <AppHelpIcon text="Last date covered by this charge period." />
            </span>
            <InputText v-model="periodForm.endDate" type="date" required />
          </label>
          <label>
            <span class="field-label">
              Due date
              <AppHelpIcon text="Payment deadline shown on generated bills." />
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
          <Button type="submit" label="Create period" :loading="savingPeriod" />
        </div>
      </form>
    </Dialog>

    <Dialog
      v-model:visible="generationDialogVisible"
      :header="`Generate ${chargeName} bills`"
      modal
      :closable="!generating"
      :close-on-escape="!generating"
      :style="{ width: 'min(940px, 96vw)' }"
    >
      <section
        v-if="generationProgressSteps.length > 0"
        class="billing-generation-progress"
        role="status"
        aria-live="polite"
      >
        <header>
          <div>
            <span>Generation status</span>
            <strong>{{ activeGenerationStep?.label ?? 'Ready' }}</strong>
            <p>{{ activeGenerationStep?.detail ?? 'Waiting to start.' }}</p>
          </div>
          <strong>{{ generationProgressPercent }}%</strong>
        </header>
        <div
          class="billing-generation-progress__bar"
          role="progressbar"
          :aria-valuemin="0"
          :aria-valuemax="100"
          :aria-valuenow="generationProgressPercent"
        >
          <span :style="{ width: `${generationProgressPercent}%` }" />
        </div>
        <ol>
          <li
            v-for="step in generationProgressSteps"
            :key="step.id"
            :class="[
              'billing-generation-progress__step',
              `billing-generation-progress__step--${step.status}`,
            ]"
          >
            <span class="billing-generation-progress__icon">
              <i :class="getGenerationStepIcon(step.status)" />
            </span>
            <div>
              <strong>{{ step.label }}</strong>
              <p>{{ step.detail }}</p>
            </div>
          </li>
        </ol>
      </section>

        <div v-if="camRunFlow" class="admin-form-layout">
          <div class="billing-generation-summary">
            <div>
              <span>Start date</span>
              <strong>{{ formatDate(camRunStartDate) }}</strong>
              <small>Due {{ camRunDueDateLabel }}</small>
              <small>Bill {{ camRunBillDateLabel }}</small>
            </div>
          <div>
            <span>Bills to create</span>
            <strong>{{ camBillableEntries.length }}</strong>
            <small
              >{{
                formatUnit(camAdvanceCoveredEntries.length, 'advance flat')
              }}
              fully covered ·
              {{ formatUnit(camAdvanceAdjustedEntries.length, 'advance flat') }}
              adjusted</small
            >
          </div>
          <div>
            <span>{{ amountSummaryLabel }}</span>
            <strong>{{ formatMoney(billableChargeTotal) }}</strong>
            <small>{{ cycleDistributionLabel }}</small>
          </div>
          <div>
            <span>Default cycle</span>
            <strong>{{ getCycleLabel(defaultCycleMonths) }}</strong>
            <small
              >{{ formatMoney(Number(defaultRatePerSqFt ?? 0)) }} / sq ft /
              month</small
            >
          </div>
        </div>

        <Message severity="info">
          CAM bills will be grouped internally by cycle. Monthly flats get a
          monthly period, quarterly flats get a 3 month period, and yearly
          advance flats get a 12 month period.
        </Message>

        <section class="billing-delivery-panel">
          <label class="admin-toggle-card">
            <span>
              <strong>Send bills after generation</strong>
              <small>Owner contacts only</small>
            </span>
            <ToggleSwitch
              v-model="sendBillsAfterGeneration"
              :disabled="generating"
            />
          </label>
          <div v-if="sendBillsAfterGeneration" class="admin-form-grid">
            <label>
              <span class="field-label">
                Channels
                <AppHelpIcon
                  text="Email includes the PDF attachment. WhatsApp, push, and in-app messages include the bill link."
                />
              </span>
              <MultiSelect
                v-model="billChannels"
                :options="billChannelOptions"
                option-label="label"
                option-value="value"
                display="chip"
                placeholder="Choose channels"
                :disabled="generating"
              />
            </label>
            <label class="admin-form-grid__full">
              <span class="field-label">
                Bills
                <AppHelpIcon
                  text="Bills are sent from due IDs resolved to owner contacts for the matching flat."
                />
              </span>
              <MultiSelect
                v-model="billDeliveryFlatIds"
                :options="billDeliveryFlatOptions"
                option-label="label"
                option-value="value"
                filter
                display="comma"
                :max-selected-labels="3"
                selected-items-label="{0} bills selected"
                placeholder="Choose bills to send"
                :disabled="generating"
              />
            </label>
          </div>
        </section>

        <div class="billing-cycle-guide">
          <div v-for="group in camRunGroups" :key="group.cycleMonths">
            <span>{{ group.cycleLabel }}</span>
            <strong>{{ formatMoney(group.totalAmount) }}</strong>
            <p>
              {{ formatUnit(group.billableCount, 'bill') }} -
              {{
                formatUnit(group.advanceCoveredCount, 'advance flat')
              }}
              fully covered -
              {{ formatUnit(group.advanceAdjustedCount, 'advance flat') }}
              adjusted - {{ formatDate(group.period.startDate) }} to
              {{ formatDate(group.period.endDate) }}
            </p>
          </div>
        </div>

        <div class="admin-inline-actions dialog-actions">
          <Button
            label="Cancel"
            severity="secondary"
            outlined
            :disabled="generating"
            @click="generationDialogVisible = false"
          />
          <Button
            label="Generate CAM bills"
            icon="pi pi-bolt"
            :loading="generating"
            :disabled="
              generating ||
              camRunGroups.length === 0 ||
              (sendBillsAfterGeneration &&
                (billChannels.length === 0 || selectedBillDeliveryCount === 0))
            "
            @click="generateDues"
          />
        </div>
      </div>
      <div v-else class="admin-form-layout">
        <AppSkeletonState v-if="loadingGenerationPreview" />
        <Message v-else-if="!generationPreview" severity="warn">
          Select at least one flat with saved charges to preview bill
          generation.
        </Message>
        <template v-else>
          <div class="billing-generation-summary">
            <div>
              <span>Period</span>
              <strong>{{ selectedPeriod?.label ?? '-' }}</strong>
              <small>{{ selectedCycleLabel }}</small>
            </div>
            <div>
              <span>Bills to create</span>
              <strong>{{ generationPreview.totalFlats }}</strong>
              <small>{{ generationPreview.skippedExisting }} skipped</small>
            </div>
            <div>
              <span>{{ amountSummaryLabel }}</span>
              <strong>{{ formatMoney(generationChargeTotal) }}</strong>
              <small>{{
                formatUnit(selectedFlatIds.length, 'selected flat')
              }}</small>
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
              <AppHelpIcon
                text="By default this includes flats with a saved amount on this page. Change the selection for a limited run."
              />
            </span>
            <MultiSelect
              v-model="selectedFlatIds"
              :options="flatOptions"
              option-label="label"
              option-value="value"
              filter
              display="chip"
              placeholder="Select flats"
              :disabled="generating"
            />
          </label>

          <Message v-if="selectedFlatIds.length === 0" severity="warn">
            Select at least one flat with saved charges before generating bills.
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

          <section class="billing-delivery-panel">
            <label class="admin-toggle-card">
              <span>
                <strong>Send bills after generation</strong>
                <small>Owner contacts only</small>
              </span>
              <ToggleSwitch
                v-model="sendBillsAfterGeneration"
                :disabled="generating"
              />
            </label>
            <div v-if="sendBillsAfterGeneration" class="admin-form-grid">
              <label>
                <span class="field-label">
                  Channels
                  <AppHelpIcon
                    text="Email includes the PDF attachment. WhatsApp, push, and in-app messages include the bill link."
                  />
                </span>
                <MultiSelect
                  v-model="billChannels"
                  :options="billChannelOptions"
                  option-label="label"
                  option-value="value"
                  display="chip"
                  placeholder="Choose channels"
                  :disabled="generating"
                />
              </label>
              <label class="admin-form-grid__full">
                <span class="field-label">
                  Bills
                  <AppHelpIcon
                    text="Bills are sent from due IDs resolved to owner contacts for the matching flat."
                  />
                </span>
                <MultiSelect
                  v-model="billDeliveryFlatIds"
                  :options="billDeliveryFlatOptions"
                  option-label="label"
                  option-value="value"
                  filter
                  display="comma"
                  :max-selected-labels="3"
                  selected-items-label="{0} bills selected"
                  placeholder="Choose bills to send"
                  :disabled="generating"
                />
              </label>
            </div>
          </section>
        </template>

        <div class="admin-inline-actions dialog-actions">
          <Button
            label="Cancel"
            severity="secondary"
            outlined
            :disabled="generating"
            @click="generationDialogVisible = false"
          />
          <Button
            :label="camRunFlow ? 'Generate CAM bills' : 'Generate bills'"
            icon="pi pi-bolt"
            :loading="generating"
            :disabled="
              camRunFlow
                ? generating || camRunGroups.length === 0
                : generating ||
                  !generationPreview ||
                  generationPreview.isLocked ||
                  generationPreview.totalFlats === 0 ||
                  selectedFlatIds.length === 0 ||
                  (sendBillsAfterGeneration &&
                    (billChannels.length === 0 ||
                      selectedBillDeliveryCount === 0))
            "
            @click="generateDues"
          />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
:deep(.billing-variable-charge-table),
:deep(.billing-variable-charge-table > .p-datatable),
:deep(.billing-variable-charge-table .p-datatable-table),
:deep(.billing-variable-charge-table .p-datatable-scrollable-table),
:deep(.billing-variable-charge-table .p-datatable-scrollable-wrapper),
:deep(.billing-variable-charge-table .p-datatable-wrapper) {
  width: 100%;
}

:deep(.billing-variable-charge-table .p-datatable-table-container),
:deep(.billing-variable-charge-table .p-datatable-scrollable-view) {
  width: 100%;
  max-width: 100%;
}
</style>
