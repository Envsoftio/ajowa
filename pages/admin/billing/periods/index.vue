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
  title: 'Bill Cycles',
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
type VariableChargeEntry = {
  flatId: string
  flatNumber: string
  blockName: string
  unitType: string
  meterNo: string | null
  openingReading: number | null
  closingReading: number | null
  consumedUnits: number | null
  ratePerUnit: number | null
  connectionLoad: string | null
  previousOutstanding: number | null
  interestAmount: number | null
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
type ChargePanel = 'FLAT' | 'COMMON' | 'POLICY'
type ChargeCalculationMethod = NonNullable<ChargeBreakdownItem['calculationMethod']>

const api = useApi()
const toast = useToast()

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

const periodsWithoutDues = computed(() =>
  periods.value.filter(
    (period) => !period.isLocked && (period.dueCount ?? 0) === 0,
  ),
)
const nextGenerationPeriod = computed(() => periodsWithoutDues.value[0] ?? null)

const openPeriodStepDetail = computed(() =>
  summary.value.open > 0
    ? `${formatUnit(summary.value.open, 'open bill cycle')} available`
    : 'Create a bill cycle before generating bills',
)

const generationStepDetail = computed(() =>
  periodsWithoutDues.value.length > 0
    ? `${formatUnit(periodsWithoutDues.value.length, 'bill cycle')} ready for bill generation`
    : 'No bill cycle is waiting',
)

const chargeCoverageLabel = computed(() => {
  if (chargeRuleSummary.value.overrideCount > 0) {
    return 'Flat-specific rates are active'
  }

  if (chargeRuleSummary.value.unitTypeCount > 0) {
    return 'Unit-type rates are active'
  }

  return 'Default rates apply to every flat'
})

const excessPolicyLabel = computed(() =>
  chargeForm.excessPaymentHandling
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' '),
)

const getFrequencyLabel = (frequency: BillingFrequency) =>
  frequencyOptions.find((item) => item.value === frequency)?.label ?? frequency

const canGenerateForPeriod = (period: BillingPeriod) => !period.isLocked

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

const applySuggestedMonthlyPeriod = () => {
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
  const monthEnd = endOfMonth(monthStart)
  const dueDate = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 10))

  periodForm.frequency = 'MONTHLY'
  periodForm.label = monthStart.toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  periodForm.startDate = toDateInput(monthStart)
  periodForm.endDate = toDateInput(monthEnd)
  periodForm.dueDate = toDateInput(dueDate)
}

const frequencyOptions = [
  { label: 'Monthly', value: 'MONTHLY' },
  { label: 'Quarterly', value: 'QUARTERLY' },
  { label: 'Half yearly', value: 'HALF_YEARLY' },
  { label: 'Yearly', value: 'YEARLY' },
  { label: 'Custom', value: 'CUSTOM' },
]

const chargeCalculationOptions: Array<{
  label: string
  value: ChargeCalculationMethod
}> = [
  { label: 'Fixed amount', value: 'FIXED' },
  { label: 'Per sq ft', value: 'AREA_RATE' },
]

const getChargeAmountLabel = (charge: ChargeBreakdownItem) =>
  charge.calculationMethod === 'AREA_RATE' ? 'Rate per sq ft' : 'Amount'

const getChargeAmountHelp = (charge: ChargeBreakdownItem) =>
  charge.calculationMethod === 'AREA_RATE'
    ? 'Rate multiplied by the flat area. Example: 1670 sq ft x 3.25.'
    : 'Fixed amount charged for this line item in the bill cycle.'

const setChargeCalculationMethod = (
  charge: ChargeBreakdownItem,
  method: ChargeCalculationMethod,
) => {
  charge.calculationMethod = method

  if (method === 'AREA_RATE') {
    const rate = Number(charge.ratePerSqFt ?? charge.amount)
    if (rate > 0) {
      charge.ratePerSqFt = rate
    } else {
      delete charge.ratePerSqFt
    }
  } else {
    delete charge.ratePerSqFt
    delete charge.areaSqFt
  }
}

const updateChargeCalculationMethod = (
  charge: ChargeBreakdownItem,
  value: unknown,
) => {
  if (value === 'FIXED' || value === 'AREA_RATE') {
    setChargeCalculationMethod(charge, value)
  }
}

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

const openCreatePeriod = () => {
  resetPeriodForm()
  applySuggestedMonthlyPeriod()
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
      summary: 'Use a cycle name',
      detail: 'Use a month name like June 2026 here. Add CAM or DG Set under charge lines.',
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
      detail: 'Bill cycle saved.',
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
const previewLoading = ref(false)
const generating = ref(false)
const variableChargeName = ref('DG Set')
const variableChargeEntries = ref<VariableChargeEntry[]>([])
const variableChargeSearch = ref('')
const variableChargesLoading = ref(false)
const savingVariableCharges = ref(false)
const dgDefaultRatePerUnit = ref<number | null>(29)
const dgDefaultConnectionLoad = ref('4 KW (5KVA)')

const filteredVariableChargeEntries = computed(() => {
  const term = variableChargeSearch.value.trim().toLowerCase()
  if (!term) return variableChargeEntries.value

  return variableChargeEntries.value.filter((entry) =>
    [entry.blockName, entry.flatNumber, entry.unitType]
      .join(' ')
      .toLowerCase()
      .includes(term),
  )
})

const variableChargeFilledCount = computed(
  () =>
    variableChargeEntries.value.filter((entry) => Number(entry.amount ?? 0) > 0)
      .length,
)

const variableChargeTotal = computed(() =>
  variableChargeEntries.value.reduce(
    (sum, entry) => sum + Number(entry.amount ?? 0),
    0,
  ),
)

const variableChargeUnitsTotal = computed(() =>
  variableChargeEntries.value.reduce(
    (sum, entry) => sum + Number(entry.consumedUnits ?? 0),
    0,
  ),
)

const roundVariableChargeValue = (value: number) => Math.round(value * 100) / 100

const normalizeVariableChargeNumber = (value: number | null | undefined) => {
  if (value == null) return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const normalizeVariableChargeEntry = (
  entry: VariableChargeEntry,
): VariableChargeEntry => ({
  ...entry,
  meterNo: entry.meterNo ?? null,
  openingReading: normalizeVariableChargeNumber(entry.openingReading),
  closingReading: normalizeVariableChargeNumber(entry.closingReading),
  consumedUnits: normalizeVariableChargeNumber(entry.consumedUnits),
  ratePerUnit:
    normalizeVariableChargeNumber(entry.ratePerUnit) ??
    normalizeVariableChargeNumber(dgDefaultRatePerUnit.value),
  connectionLoad: entry.connectionLoad ?? dgDefaultConnectionLoad.value,
  previousOutstanding: normalizeVariableChargeNumber(entry.previousOutstanding) ?? 0,
  interestAmount: normalizeVariableChargeNumber(entry.interestAmount) ?? 0,
  amount: normalizeVariableChargeNumber(entry.amount),
})

const recalculateVariableCharge = (entry: VariableChargeEntry) => {
  const openingReading = normalizeVariableChargeNumber(entry.openingReading)
  const closingReading = normalizeVariableChargeNumber(entry.closingReading)

  if (openingReading != null && closingReading != null) {
    if (closingReading < openingReading) {
      entry.consumedUnits = null
      entry.amount = null
      return
    }

    entry.consumedUnits = roundVariableChargeValue(closingReading - openingReading)
  }

  const units = normalizeVariableChargeNumber(entry.consumedUnits)
  const rate = normalizeVariableChargeNumber(entry.ratePerUnit)

  entry.amount =
    units != null && rate != null
      ? roundVariableChargeValue(units * rate)
      : null
}

const applyVariableChargeDefaults = () => {
  for (const entry of variableChargeEntries.value) {
    if (!entry.ratePerUnit) {
      entry.ratePerUnit = dgDefaultRatePerUnit.value
    }

    if (!entry.connectionLoad) {
      entry.connectionLoad = dgDefaultConnectionLoad.value
    }

    recalculateVariableCharge(entry)
  }
}

const loadVariableCharges = async () => {
  if (!generationTarget.value) return
  variableChargesLoading.value = true

  try {
    const response = await api<VariableChargesResponse>(
      `/api/admin/billing/periods/${generationTarget.value.id}/variable-charges`,
      {
        query: {
          chargeName: variableChargeName.value,
        },
      },
    )
    variableChargeName.value = response.data.chargeName
    variableChargeEntries.value = response.data.items.map(normalizeVariableChargeEntry)
  } finally {
    variableChargesLoading.value = false
  }
}

const saveVariableCharges = async (
  options: { refreshPreview?: boolean; silent?: boolean } = {},
) => {
  if (!generationTarget.value) return
  savingVariableCharges.value = true

  try {
    const response = await api<VariableChargesSaveResponse>(
      `/api/admin/billing/periods/${generationTarget.value.id}/variable-charges`,
      {
        method: 'PUT',
        body: {
          chargeName: variableChargeName.value,
          entries: variableChargeEntries.value.map((entry) => ({
            flatId: entry.flatId,
            meterNo: entry.meterNo || null,
            openingReading: entry.openingReading,
            closingReading: entry.closingReading,
            consumedUnits: entry.consumedUnits,
            ratePerUnit: entry.ratePerUnit,
            connectionLoad: entry.connectionLoad || null,
            previousOutstanding: entry.previousOutstanding ?? 0,
            interestAmount: entry.interestAmount ?? 0,
            amount: Number(entry.amount ?? 0),
          })),
        },
      },
    )

    if (!options.silent) {
      toast.add({
        severity: 'success',
        summary: 'DG charges saved',
        detail: `${response.data.saved} flat charge${
          response.data.saved === 1 ? '' : 's'
        } saved for this cycle.`,
        life: 10000,
      })
    }

    if (options.refreshPreview !== false) {
      await loadGenerationPreview()
    }
  } finally {
    savingVariableCharges.value = false
  }
}

const openGenerationDialog = async (period: BillingPeriod) => {
  generationTarget.value = period
  selectedFlatIds.value = []
  variableChargeSearch.value = ''
  generationDialogVisible.value = true
  await loadVariableCharges()
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
    await saveVariableCharges({ refreshPreview: false, silent: true })
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
      summary: 'Bills generated',
      detail: `${response.data.generated} created, ${response.data.skipped} skipped.`,
      life: 10000,
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

const chargeRuleSummary = computed(() => {
  const defaultFixedCharges = chargeForm.defaultCharges.filter(
    (charge) => charge.calculationMethod !== 'AREA_RATE',
  )
  const defaultAreaRateCharges = chargeForm.defaultCharges.filter(
    (charge) => charge.calculationMethod === 'AREA_RATE',
  )
  const defaultFixedTotal = defaultFixedCharges.reduce(
    (sum, charge) => sum + Number(charge.amount || 0),
    0,
  )

  return {
    defaultCount: chargeForm.defaultCharges.length,
    defaultFixedCount: defaultFixedCharges.length,
    defaultAreaRateCount: defaultAreaRateCharges.length,
    defaultFixedTotal,
    unitTypeCount: chargeForm.flatTypeCharges.length,
    overrideCount: chargeForm.flatOverrideCharges.length,
    graceDays: chargeForm.graceDays,
    lateFeePerDay: chargeForm.lateFeePerDay,
  }
})

const normalizeChargeLabel = (label: string) => {
  const cleanLabel = label.trim().replace(/\s+/g, ' ')

  if (/^dg\s*set$/i.test(cleanLabel) || /^dgset$/i.test(cleanLabel)) {
    return 'DG Set'
  }

  if (/^cam(?:\s+charges?)?$/i.test(cleanLabel)) {
    return 'CAM Charges'
  }

  return cleanLabel
}

const configuredChargeLabels = computed(() => {
  const labels = new Map<string, string>()
  const addCharges = (charges: ChargeBreakdownItem[]) => {
    for (const charge of charges) {
      const label = normalizeChargeLabel(charge.label || '')
      if (label) {
        labels.set(label.toLowerCase(), label)
      }
    }
  }

  addCharges(chargeForm.defaultCharges)
  chargeForm.flatTypeCharges.forEach((item) => addCharges(item.charges))
  chargeForm.flatOverrideCharges.forEach((item) => addCharges(item.charges))

  return Array.from(labels.values())
})

const chargeLineSummary = computed(() => {
  if (configuredChargeLabels.value.length === 0) {
    return 'Add CAM Charges, DG Set, or other charge lines'
  }

  const visibleLabels = configuredChargeLabels.value.slice(0, 3)
  const extraCount = configuredChargeLabels.value.length - visibleLabels.length

  return [
    visibleLabels.join(', '),
    extraCount > 0 ? `+${extraCount} more` : '',
  ]
    .filter(Boolean)
    .join(' ')
})

const chargeRuleDetail = computed(() => {
  const parts = [
    formatUnit(chargeRuleSummary.value.defaultCount, 'default line'),
  ]

  if (chargeRuleSummary.value.unitTypeCount > 0) {
    parts.push(
      formatUnit(chargeRuleSummary.value.unitTypeCount, 'unit template'),
    )
  }

  if (chargeRuleSummary.value.overrideCount > 0) {
    parts.push(formatUnit(chargeRuleSummary.value.overrideCount, 'flat override'))
  }

  return parts.join(' · ')
})

const configuredChargeRuleCount = computed(
  () =>
    chargeRuleSummary.value.defaultCount +
    chargeRuleSummary.value.unitTypeCount +
    chargeRuleSummary.value.overrideCount,
)

const billAmountStepDetail = computed(() =>
  configuredChargeRuleCount.value > 0
    ? `${formatUnit(configuredChargeRuleCount.value, 'charge rule')} ready for bill generation`
    : 'Add CAM, DG Set, or other charge lines first',
)

const defaultBillBasisLabel = computed(() =>
  chargeRuleSummary.value.defaultFixedCount > 0
    ? formatMoney(chargeRuleSummary.value.defaultFixedTotal)
    : 'No fixed default',
)

const defaultBillBasisDetail = computed(() => {
  const parts: string[] = []

  if (chargeRuleSummary.value.defaultFixedCount > 0) {
    parts.push(formatUnit(chargeRuleSummary.value.defaultFixedCount, 'fixed line'))
  }

  if (chargeRuleSummary.value.defaultAreaRateCount > 0) {
    parts.push(
      `${formatUnit(chargeRuleSummary.value.defaultAreaRateCount, 'per-sq-ft line')} calculated from each flat area`,
    )
  }

  return parts.join(' · ') || 'Add common charges before generating bills'
})

const generationQueueLabel = computed(() =>
  periodsWithoutDues.value.length > 0
    ? formatUnit(periodsWithoutDues.value.length, 'month')
    : 'Clear',
)

const generationQueueDetail = computed(() =>
  nextGenerationPeriod.value
    ? `${formatDate(nextGenerationPeriod.value.startDate)} - ${formatDate(nextGenerationPeriod.value.endDate)} is first in queue`
    : 'Every open month already has bills',
)

const loadedPeriodScopeLabel = computed(() => {
  const loaded = periods.value.length
  const total = summary.value.total

  if (total > loaded) {
    return `${formatUnit(loaded, 'loaded cycle')} of ${formatNumber(total)} matching`
  }

  return formatUnit(loaded, 'bill cycle')
})

const paymentFollowUpDetail = computed(() =>
  summary.value.dueCount > 0
    ? `${formatUnit(summary.value.dueCount, 'generated bill')} across ${loadedPeriodScopeLabel.value}`
    : `No bills generated across ${loadedPeriodScopeLabel.value}`,
)

const syncChargeForm = (config: BillingChargeConfig) => {
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
}

watch(
  chargeConfig,
  (config) => {
    if (!config) return
    syncChargeForm(config)
  },
  { immediate: true },
)

const addCharge = (charges: ChargeBreakdownItem[]) => {
  charges.push({ label: '', amount: 0, calculationMethod: 'FIXED' })
}

const removeCharge = (charges: ChargeBreakdownItem[], index: number) => {
  charges.splice(index, 1)
}

const addFlatTypeConfig = () => {
  chargeForm.flatTypeCharges.push({
    flatType: '',
    label: 'Unit type charge',
    charges: [{ label: 'Maintenance Charges', amount: 0, calculationMethod: 'FIXED' }],
  })
}

const addFlatOverride = () => {
  chargeForm.flatOverrideCharges.push({
    flatId: '',
    flatNumber: '',
    blockName: '',
    charges: [{ label: 'Maintenance Charges', amount: 0, calculationMethod: 'FIXED' }],
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
const chargeDialogVisible = ref(false)
const chargePanel = ref<ChargePanel>('FLAT')

const chargePanelOptions: Array<{ label: string; value: ChargePanel; icon: string }> = [
  { label: 'Flat amounts', value: 'FLAT', icon: 'pi pi-building' },
  { label: 'Common charges', value: 'COMMON', icon: 'pi pi-receipt' },
  { label: 'Policy', value: 'POLICY', icon: 'pi pi-cog' },
]

const chargePanelTitle = computed(() => {
  if (chargePanel.value === 'FLAT') return 'Enter per-flat bill amounts'
  if (chargePanel.value === 'COMMON') return 'Set common charges'
  return 'Billing policy'
})

const chargePanelDescription = computed(() => {
  if (chargePanel.value === 'FLAT') {
    return 'Flat-specific bill line items and amount overrides.'
  }
  if (chargePanel.value === 'COMMON') {
    return 'Default charges, plus optional unit-type templates.'
  }
  return 'Late fee, grace period, tenure, and excess payment rules.'
})

const openChargeDialog = (panel: ChargePanel = 'FLAT') => {
  chargePanel.value = panel
  if (chargeConfig.value) {
    syncChargeForm(chargeConfig.value)
  }
  chargeDialogVisible.value = true
}

const closeChargeDialog = () => {
  if (chargeConfig.value) {
    syncChargeForm(chargeConfig.value)
  }
  chargeDialogVisible.value = false
}

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
      life: 10000,
    })
    await refreshCharges()
    chargeDialogVisible.value = false
  } finally {
    savingCharges.value = false
  }
}
</script>

<template>
  <div class="landing-page">
    <section class="billing-command-panel">
      <header class="billing-command-header">
        <div>
          <p class="eyebrow">Monthly billing</p>
          <h1>Generate flat bills</h1>
          <p>
            Add charge lines like CAM or DG Set, create the monthly bill cycle,
            then generate bills for residents.
          </p>
        </div>
        <div class="billing-command-actions">
          <Button
            label="Edit charge lines"
            icon="pi pi-building"
            @click="openChargeDialog('FLAT')"
          />
          <Button
            label="Create bill cycle"
            icon="pi pi-calendar-plus"
            severity="secondary"
            outlined
            @click="openCreatePeriod"
          />
        </div>
      </header>

      <div class="billing-cycle-guide" aria-label="Billing setup guide">
        <div>
          <span>Bill cycle</span>
          <strong>Month and date range</strong>
          <p>Example: June 2026, 01 Jun - 30 Jun.</p>
        </div>
        <div>
          <span>Charge lines</span>
          <strong>{{ chargeLineSummary }}</strong>
          <p>CAM and DG Set belong here, not in the cycle name.</p>
        </div>
      </div>

      <div class="billing-command-steps">
        <article class="billing-command-step billing-command-step--active">
          <span>1</span>
          <div>
            <h2>Configure charge lines</h2>
            <p>{{ billAmountStepDetail }}</p>
          </div>
          <Button
            label="Edit charge lines"
            icon="pi pi-pencil"
            size="small"
            severity="secondary"
            outlined
            @click="openChargeDialog('FLAT')"
          />
        </article>
        <article class="billing-command-step">
          <span>2</span>
          <div>
            <h2>Create bill cycle</h2>
            <p>{{ openPeriodStepDetail }}</p>
          </div>
          <Button
            label="New cycle"
            icon="pi pi-plus"
            size="small"
            severity="secondary"
            outlined
            @click="openCreatePeriod"
          />
        </article>
        <article
          class="billing-command-step"
          :class="{ 'billing-command-step--active': Boolean(nextGenerationPeriod) }"
        >
          <span>3</span>
          <div>
            <h2>Generate bills</h2>
            <p>{{ generationStepDetail }}</p>
          </div>
          <Button
            v-if="nextGenerationPeriod"
            label="Generate"
            icon="pi pi-bolt"
            size="small"
            @click="openGenerationDialog(nextGenerationPeriod)"
          />
          <Button
            v-else
            label="Done"
            icon="pi pi-check"
            size="small"
            severity="secondary"
            outlined
            disabled
          />
        </article>
        <article class="billing-command-step">
          <span>4</span>
          <div>
            <h2>Send bills</h2>
            <p>{{ summary.dueCount }} generated bills</p>
          </div>
          <Button
            as="a"
            href="/admin/billing/dues"
            label="Open bills"
            icon="pi pi-send"
            size="small"
            severity="secondary"
            outlined
          />
        </article>
      </div>

      <dl class="billing-command-kpis" aria-label="Billing snapshot">
        <div>
          <dt>Charge rules</dt>
          <dd>
            <strong>{{ chargeCoverageLabel }}</strong>
            <span>{{ chargeRuleDetail }}</span>
          </dd>
        </div>
        <div>
          <dt>Default bill basis</dt>
          <dd>
            <strong>{{ defaultBillBasisLabel }}</strong>
            <span>{{ defaultBillBasisDetail }}</span>
          </dd>
        </div>
        <div>
          <dt>Late payment rule</dt>
          <dd>
            <strong>{{ formatMoney(chargeRuleSummary.lateFeePerDay) }}/day</strong>
            <span>
              Starts after
              {{ formatUnit(chargeRuleSummary.graceDays, 'grace day') }}
            </span>
          </dd>
        </div>
        <div>
          <dt>Generation queue</dt>
          <dd>
            <strong>{{ generationQueueLabel }}</strong>
            <span>{{ generationQueueDetail }}</span>
          </dd>
        </div>
        <div>
          <dt>Payment follow-up</dt>
          <dd>
            <strong>{{ formatUnit(summary.unpaidDueCount, 'unpaid bill') }}</strong>
            <span>{{ paymentFollowUpDetail }}</span>
          </dd>
        </div>
      </dl>
    </section>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Bill cycles</h1>
          <p>
            Use cycles for month/date ranges. CAM and DG Set stay inside charge
            lines.
          </p>
        </div>
        <div class="list-page__exports">
          <Button
            label="Common charges"
            icon="pi pi-sliders-h"
            severity="secondary"
            outlined
            :loading="chargePending"
            @click="openChargeDialog('COMMON')"
          />
          <Button
            label="Policy"
            icon="pi pi-cog"
            severity="secondary"
            outlined
            :loading="chargePending"
            @click="openChargeDialog('POLICY')"
          />
        </div>
      </header>

      <div class="list-page__toolbar">
        <label class="list-page__search">
          <span class="field-label">
            Search
            <AppHelpIcon text="Find bill cycles by their visible cycle name." />
          </span>
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText
              v-model="periodQuery.search"
              placeholder="Search by cycle name"
            />
          </IconField>
        </label>
        <div class="list-page__filters">
          <label>
            <span class="field-label">
              State
              <AppHelpIcon
                text="Show all bill cycles, only editable open cycles, or locked cycles."
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
              <AppHelpIcon
                text="Filter months by billing frequency, such as monthly or quarterly."
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

      <AppDataTable
        :value="periods"
        :loading="periodsPending"
        responsive-layout="scroll"
        class="list-page__table"
        data-key="id"
      >
        <Column field="label" header="Cycle name">
          <template #body="{ data: row }">
            <div class="billing-period-cell">
              <strong>{{ row.label }}</strong>
              <span>Bill cycle · {{ getFrequencyLabel(row.frequency) }}</span>
            </div>
          </template>
        </Column>
        <Column header="Date range">
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
        <Column header="Actions" style="width: 320px">
          <template #body="{ data: row }">
            <div class="admin-inline-actions billing-table-actions">
              <Button
                label="Generate bills"
                icon="pi pi-bolt"
                severity="secondary"
                outlined
                size="small"
                :disabled="row.isLocked"
                aria-label="Generate bills for cycle"
                title="Generate bills for cycle"
                @click="openGenerationDialog(row)"
              />
              <Button
                label="Edit"
                icon="pi pi-pencil"
                severity="secondary"
                outlined
                size="small"
                :disabled="row.isLocked"
                aria-label="Edit bill cycle"
                title="Edit bill cycle"
                @click="editPeriod(row)"
              />
              <Button
                :label="row.isLocked ? 'Unlock' : 'Lock'"
                :icon="row.isLocked ? 'pi pi-lock-open' : 'pi pi-lock'"
                severity="secondary"
                outlined
                size="small"
                :aria-label="row.isLocked ? 'Unlock cycle' : 'Lock cycle'"
                :title="row.isLocked ? 'Unlock cycle' : 'Lock cycle'"
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
            <strong>
              {{ formatDate(period.startDate) }} -
              {{ formatDate(period.endDate) }}
            </strong>
          </div>
          <div class="list-card__row">
            <span>Due date</span>
            <strong>{{ formatDate(period.dueDate) }}</strong>
          </div>
          <div class="list-card__row">
            <span>Bills generated</span>
            <strong>{{ period.dueCount ?? 0 }}</strong>
          </div>
          <div class="list-card__row">
            <span>Unpaid bills</span>
            <strong>{{ period.unpaidDueCount ?? 0 }}</strong>
          </div>
          <div class="admin-inline-actions">
            <Button
              label="Generate bills"
              icon="pi pi-bolt"
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
            <Button
              :label="period.isLocked ? 'Unlock' : 'Lock'"
              :icon="period.isLocked ? 'pi pi-lock-open' : 'pi pi-lock'"
              size="small"
              severity="secondary"
              outlined
              @click="openLockDialog(period)"
            />
          </div>
        </article>
      </div>
    </section>

    <Dialog
      v-model:visible="chargeDialogVisible"
      :header="chargePanelTitle"
      modal
      class="billing-charge-dialog"
      :style="{ width: 'min(980px, 96vw)' }"
      @hide="closeChargeDialog"
    >
      <AppSkeletonState v-if="chargePending" />
      <form v-else class="admin-form-layout" @submit.prevent="saveCharges">
        <div class="billing-charge-tabs">
          <Button
            v-for="option in chargePanelOptions"
            :key="option.value"
            type="button"
            :label="option.label"
            :icon="option.icon"
            size="small"
            :severity="chargePanel === option.value ? undefined : 'secondary'"
            :outlined="chargePanel !== option.value"
            @click="chargePanel = option.value"
          />
        </div>

        <div class="billing-dialog-intro">
          <div>
            <p class="eyebrow">Bill setup</p>
            <h2>{{ chargePanelTitle }}</h2>
            <p>{{ chargePanelDescription }}</p>
          </div>
          <p>
            {{ chargeCoverageLabel }} · {{ excessPolicyLabel }}
          </p>
        </div>

        <div v-if="chargePanel === 'POLICY'" class="admin-form-grid">
          <label>
            <span class="field-label">
              Billing tenure pack
              <AppHelpIcon
                text="Default billing frequency used when preparing maintenance cycles."
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
              <AppHelpIcon
                text="Decides what to do when a resident pays more than the balance amount."
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
              <AppHelpIcon
                text="Number of days after the due date before late fee calculation starts."
              />
            </span>
            <InputNumber v-model="chargeForm.graceDays" :min="0" fluid />
          </label>
          <label>
            <span class="field-label">
              Late fee per day
              <AppHelpIcon
                text="Daily late fee added after grace days expire for unpaid balances."
              />
            </span>
            <InputNumber v-model="chargeForm.lateFeePerDay" :min="0" fluid />
          </label>
        </div>

        <div v-if="chargePanel === 'COMMON'" class="admin-charge-section">
          <div class="admin-form-section__header">
            <div>
              <h2>Default charges</h2>
              <p>Used unless a flat amount or unit-type template exists.</p>
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
          <Message severity="info">
            For CAM, choose <strong>Per sq ft</strong> and enter the rate. A
            1670 sq ft flat at 3.25 is calculated as 1670 x 3.25.
          </Message>
          <div
            v-for="(charge, index) in chargeForm.defaultCharges"
            :key="index"
            class="admin-charge-row"
          >
            <label>
              <span class="field-label">
                Charge label
                <AppHelpIcon
                  text="Name shown in the resident charge breakdown, such as Maintenance Charges."
                />
              </span>
              <InputText v-model="charge.label" placeholder="Charge label" />
            </label>
            <label>
              <span class="field-label">
                Calculation
                <AppHelpIcon
                  text="Use fixed amount for one amount per flat, or per sq ft for CAM-style area billing."
                />
              </span>
              <Select
                :model-value="charge.calculationMethod ?? 'FIXED'"
                :options="chargeCalculationOptions"
                option-label="label"
                option-value="value"
                @update:model-value="
                  (value) => updateChargeCalculationMethod(charge, value)
                "
              />
            </label>
            <label>
              <span class="field-label">
                {{ getChargeAmountLabel(charge) }}
                <AppHelpIcon :text="getChargeAmountHelp(charge)" />
              </span>
              <InputNumber
                v-model="charge.amount"
                :min="0"
                :min-fraction-digits="
                  charge.calculationMethod === 'AREA_RATE' ? 2 : 0
                "
                :max-fraction-digits="2"
                :suffix="
                  charge.calculationMethod === 'AREA_RATE' ? ' / sq ft' : ''
                "
                fluid
              />
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

        <div v-if="chargePanel === 'COMMON'" class="admin-charge-section">
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
                  <AppHelpIcon
                    text="Flat unit type this charge template applies to, for example 2BHK."
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
                  <AppHelpIcon
                    text="Name shown in the resident charge breakdown for this unit type."
                  />
                </span>
                <InputText v-model="charge.label" placeholder="Charge label" />
              </label>
              <label>
                <span class="field-label">
                  Calculation
                  <AppHelpIcon
                    text="Use fixed amount for one amount per flat, or per sq ft for CAM-style area billing."
                  />
                </span>
                <Select
                  :model-value="charge.calculationMethod ?? 'FIXED'"
                  :options="chargeCalculationOptions"
                  option-label="label"
                  option-value="value"
                  @update:model-value="
                    (value) => updateChargeCalculationMethod(charge, value)
                  "
                />
              </label>
              <label>
                <span class="field-label">
                  {{ getChargeAmountLabel(charge) }}
                  <AppHelpIcon :text="getChargeAmountHelp(charge)" />
                </span>
                <InputNumber
                  v-model="charge.amount"
                  :min="0"
                  :min-fraction-digits="
                    charge.calculationMethod === 'AREA_RATE' ? 2 : 0
                  "
                  :max-fraction-digits="2"
                  :suffix="
                    charge.calculationMethod === 'AREA_RATE' ? ' / sq ft' : ''
                  "
                  fluid
                />
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

        <div v-if="chargePanel === 'FLAT'" class="admin-charge-section">
          <div class="admin-form-section__header">
            <div>
              <h2>Flat bill amounts</h2>
              <p>
                Highest-priority amounts for selected flats.
              </p>
            </div>
            <Button
              type="button"
              label="Add flat"
              icon="pi pi-plus"
              severity="secondary"
              outlined
              @click="addFlatOverride"
            />
          </div>
          <Message
            v-if="chargeForm.flatOverrideCharges.length === 0"
            severity="info"
          >
            No flat-specific amounts are saved yet.
          </Message>
          <div
            v-for="(config, configIndex) in chargeForm.flatOverrideCharges"
            :key="configIndex"
            class="admin-charge-card"
          >
            <div class="admin-form-section__header">
              <label>
                <span class="field-label">
                  Flat
                  <AppHelpIcon
                    text="Specific flat that should use this amount instead of default or unit-type charges."
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
                  <AppHelpIcon
                    text="Name shown in the resident charge breakdown for this flat."
                  />
                </span>
                <InputText v-model="charge.label" placeholder="Charge label" />
              </label>
              <label>
                <span class="field-label">
                  Calculation
                  <AppHelpIcon
                    text="Use fixed amount for one amount per flat, or per sq ft for CAM-style area billing."
                  />
                </span>
                <Select
                  :model-value="charge.calculationMethod ?? 'FIXED'"
                  :options="chargeCalculationOptions"
                  option-label="label"
                  option-value="value"
                  @update:model-value="
                    (value) => updateChargeCalculationMethod(charge, value)
                  "
                />
              </label>
              <label>
                <span class="field-label">
                  {{ getChargeAmountLabel(charge) }}
                  <AppHelpIcon :text="getChargeAmountHelp(charge)" />
                </span>
                <InputNumber
                  v-model="charge.amount"
                  :min="0"
                  :min-fraction-digits="
                    charge.calculationMethod === 'AREA_RATE' ? 2 : 0
                  "
                  :max-fraction-digits="2"
                  :suffix="
                    charge.calculationMethod === 'AREA_RATE' ? ' / sq ft' : ''
                  "
                  fluid
                />
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

        <div class="admin-inline-actions dialog-actions billing-dialog-actions">
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            outlined
            @click="closeChargeDialog"
          />
          <Button
            type="submit"
            label="Save bill setup"
            icon="pi pi-save"
            :loading="savingCharges"
          />
        </div>
      </form>
    </Dialog>

    <Dialog
      v-model:visible="periodDialogVisible"
      :header="selectedPeriod ? 'Edit bill cycle' : 'Create bill cycle'"
      modal
      :style="{ width: '520px' }"
    >
      <form class="admin-form-layout" @submit.prevent="savePeriod">
        <div class="billing-dialog-intro">
          <div>
            <p class="eyebrow">Bill cycle</p>
            <h2>{{ periodForm.label || 'New bill cycle' }}</h2>
            <p>
              Use this for the billing month/date range. Add CAM and DG Set as
              charge lines.
            </p>
          </div>
          <Button
            v-if="!selectedPeriod"
            type="button"
            label="Use next cycle"
            icon="pi pi-calendar"
            severity="secondary"
            outlined
            @click="applySuggestedMonthlyPeriod"
          />
        </div>
        <div class="admin-form-grid">
          <label class="admin-form-grid__full">
            <span class="field-label">
              Cycle name
              <AppHelpIcon
                text="Readable month or cycle name shown to admins and residents, such as June 2026. Charge names like CAM or DG Set go under charge lines."
              />
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
            here; add CAM or DG Set under charge lines.
          </Message>
          <label>
            <span class="field-label">
              Tenure
              <AppHelpIcon
                text="Billing frequency for this cycle. It helps categorize monthly, quarterly, and custom cycles."
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
              <AppHelpIcon
                text="First calendar date covered by this bill cycle."
              />
            </span>
            <InputText v-model="periodForm.startDate" type="date" required />
          </label>
          <label>
            <span class="field-label">
              End date
              <AppHelpIcon
                text="Last calendar date covered by this bill cycle."
              />
            </span>
            <InputText v-model="periodForm.endDate" type="date" required />
          </label>
          <label>
            <span class="field-label">
              Due date
              <AppHelpIcon
                text="Payment deadline shown to residents. Late fees start after this date plus grace days."
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
          <Button type="submit" label="Save cycle" :loading="savingPeriod" />
        </div>
      </form>
    </Dialog>

    <Dialog
      v-model:visible="lockDialogVisible"
      header="Bill cycle lock"
      modal
      :style="{ width: '480px' }"
    >
      <div class="admin-form-layout">
        <p>
          {{
            lockTarget?.isLocked
              ? 'Unlock this bill cycle for corrections.'
              : 'Lock this bill cycle to block later bills, payments, and journal writes.'
          }}
        </p>
        <label v-if="!lockTarget?.isLocked" class="admin-form-grid__full">
          <span class="field-label">
            Lock reason
            <AppHelpIcon
              text="Short audit note explaining why the bill cycle is being locked."
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
            :label="lockTarget?.isLocked ? 'Unlock cycle' : 'Lock cycle'"
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
      :style="{ width: 'min(1180px, 96vw)' }"
    >
      <div class="admin-form-layout">
        <label>
          <span class="field-label">
            Flats
            <AppHelpIcon
              text="Leave empty to generate bills for all active flats, or select specific flats for a limited run."
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

        <section class="billing-variable-charge-panel">
          <header>
            <div>
              <p class="eyebrow">Monthly variable charge</p>
              <h3>{{ variableChargeName }} charges</h3>
              <p>
                Enter opening and closing DG readings for each flat. Units and
                amount are calculated from the rate before bills are generated.
              </p>
            </div>
            <div>
              <strong>{{ formatMoney(variableChargeTotal) }}</strong>
              <span>
                {{ formatUnit(variableChargeFilledCount, 'flat') }} with DG
                charge · {{ formatNumber(variableChargeUnitsTotal) }} units
              </span>
            </div>
          </header>

          <div class="billing-variable-charge-defaults">
            <label>
              <span class="field-label">
                DG rate per unit
                <AppHelpIcon
                  text="Used when a flat row does not already have its own DG rate."
                />
              </span>
              <InputNumber
                v-model="dgDefaultRatePerUnit"
                :min="0"
                :max-fraction-digits="2"
                fluid
              />
            </label>
            <label>
              <span class="field-label">
                Connection load
                <AppHelpIcon
                  text="Printed on the DG bill notice for rows that do not have a custom load."
                />
              </span>
              <InputText v-model="dgDefaultConnectionLoad" />
            </label>
            <Button
              label="Apply defaults"
              icon="pi pi-clone"
              severity="secondary"
              outlined
              @click="applyVariableChargeDefaults"
            />
          </div>

          <div class="billing-variable-charge-toolbar">
            <IconField>
              <InputIcon class="pi pi-search" />
              <InputText
                v-model="variableChargeSearch"
                placeholder="Find flat"
              />
            </IconField>
            <Button
              label="Save DG readings"
              icon="pi pi-save"
              severity="secondary"
              outlined
              :loading="savingVariableCharges"
              @click="saveVariableCharges()"
            />
          </div>

          <AppSkeletonState v-if="variableChargesLoading" />
          <AppDataTable
            v-else
            :value="filteredVariableChargeEntries"
            scrollable
            scroll-height="18rem"
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
            <Column header="Meter no." style="min-width: 8rem">
              <template #body="{ data: row }">
                <InputText
                  v-model="row.meterNo"
                  placeholder="Optional"
                  fluid
                />
              </template>
            </Column>
            <Column header="Opening" style="min-width: 7.5rem">
              <template #body="{ data: row }">
                <InputNumber
                  v-model="row.openingReading"
                  :min="0"
                  :max-fraction-digits="2"
                  placeholder="0"
                  fluid
                  @update:model-value="recalculateVariableCharge(row)"
                />
              </template>
            </Column>
            <Column header="Closing" style="min-width: 7.5rem">
              <template #body="{ data: row }">
                <InputNumber
                  v-model="row.closingReading"
                  :min="0"
                  :max-fraction-digits="2"
                  placeholder="0"
                  fluid
                  @update:model-value="recalculateVariableCharge(row)"
                />
              </template>
            </Column>
            <Column header="Units" style="min-width: 7rem">
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
                  @update:model-value="recalculateVariableCharge(row)"
                />
              </template>
            </Column>
            <Column header="Rate/unit" style="min-width: 7.5rem">
              <template #body="{ data: row }">
                <InputNumber
                  v-model="row.ratePerUnit"
                  :min="0"
                  :max-fraction-digits="2"
                  placeholder="29"
                  fluid
                  @update:model-value="recalculateVariableCharge(row)"
                />
              </template>
            </Column>
            <Column header="Amount" style="min-width: 7.5rem">
              <template #body="{ data: row }">
                <strong>{{ formatMoney(Number(row.amount ?? 0)) }}</strong>
              </template>
            </Column>
            <Column header="Load" style="min-width: 8.5rem">
              <template #body="{ data: row }">
                <InputText
                  v-model="row.connectionLoad"
                  placeholder="4 KW (5KVA)"
                  fluid
                />
              </template>
            </Column>
          </AppDataTable>
        </section>

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
          <AppDataTable
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
          </AppDataTable>
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
            :loading="generating || savingVariableCharges"
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
