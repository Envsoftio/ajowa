<script setup lang="ts">
import type { BillingFrequency, BillingPeriod } from '~/types/domain'

type ChargeType = 'CAM' | 'DG_SET' | 'OTHER'

type PeriodResponse = {
  ok: true
  data: { items: BillingPeriod[]; total: number }
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

const props = withDefaults(
  defineProps<{
    mode: 'CAM' | 'DG'
    title: string
    eyebrow: string
    description: string
    chargeName: string
    chargeLabel: string
    chargeType: ChargeType
    source: string
    electricityType?: string | null
    defaultRatePerUnit?: number | null
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
  }>(),
  {
    electricityType: null,
    defaultRatePerUnit: null,
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

const getFrequencyMonthCount = (period: BillingPeriod | null) =>
  period
    ? frequencyMonthMultipliers[period.frequency] ??
      getBillingPeriodMonthSpan(period.startDate, period.endDate)
    : 1

const getFrequencyLabel = (frequency: BillingFrequency) =>
  frequency
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ')

const asyncKey = `billing-${props.mode.toLowerCase()}-charge-entry`

const {
  data: periodsData,
  pending: periodsPending,
  refresh: refreshPeriods,
} = await useAsyncData(`${asyncKey}-periods`, () =>
  api<PeriodResponse>('/api/admin/billing/periods', {
    query: {
      page: 1,
      pageSize: 200,
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
const defaultFlatAmount = ref<number | null>(props.defaultFlatAmount)
const defaultConnectionLoad = ref(props.defaultConnectionLoad)
const loadingCharges = ref(false)
const savingCharges = ref(false)

const selectedPeriod = computed(
  () => periods.value.find((period) => period.id === selectedPeriodId.value) ?? null,
)

const selectedCycleMonths = computed(() => getFrequencyMonthCount(selectedPeriod.value))

const selectedCycleLabel = computed(() =>
  selectedPeriod.value
    ? `${getFrequencyLabel(selectedPeriod.value.frequency)} - ${formatDate(selectedPeriod.value.startDate)} to ${formatDate(selectedPeriod.value.endDate)}`
    : 'Select a cycle',
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

const filledChargeCount = computed(
  () => chargeEntries.value.filter((entry) => Number(entry.amount ?? 0) > 0).length,
)

const chargeTotal = computed(() =>
  chargeEntries.value.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
)

const chargeUnitsTotal = computed(() =>
  chargeEntries.value.reduce((sum, entry) => sum + Number(entry.consumedUnits ?? 0), 0),
)

const invalidChargeEntries = computed(() =>
  chargeEntries.value.filter(
    (entry) =>
      entry.openingReading != null &&
      entry.closingReading != null &&
      Number(entry.closingReading) < Number(entry.openingReading),
  ),
)

const finalGenerationHref = computed(() =>
  selectedPeriod.value
    ? `/admin/billing/periods?generatePeriodId=${selectedPeriod.value.id}`
    : '/admin/billing/periods',
)

const normalizeChargeNumber = (value: number | null | undefined) => {
  if (value == null) return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const roundChargeValue = (value: number) => Math.round(value * 100) / 100

const normalizeChargeEntry = (entry: VariableChargeEntry): VariableChargeEntry => ({
  ...entry,
  meterNo: entry.meterNo ?? null,
  openingReading: normalizeChargeNumber(entry.openingReading),
  closingReading: normalizeChargeNumber(entry.closingReading),
  consumedUnits: normalizeChargeNumber(entry.consumedUnits),
  ratePerUnit:
    normalizeChargeNumber(entry.ratePerUnit) ??
    normalizeChargeNumber(defaultRatePerUnit.value),
  connectionLoad: entry.connectionLoad ?? (defaultConnectionLoad.value || null),
  previousOutstanding: normalizeChargeNumber(entry.previousOutstanding) ?? 0,
  interestAmount: normalizeChargeNumber(entry.interestAmount) ?? 0,
  amount: normalizeChargeNumber(entry.amount),
})

const hasReadingInput = (entry: VariableChargeEntry) =>
  entry.openingReading != null || entry.closingReading != null || entry.consumedUnits != null

const recalculateCharge = (entry: VariableChargeEntry) => {
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
  const defaultAmount = normalizeChargeNumber(defaultFlatAmount.value)

  for (const entry of chargeEntries.value) {
    if (!entry.ratePerUnit) {
      entry.ratePerUnit = defaultRatePerUnit.value
    }

    if (props.showConnectionLoad && !entry.connectionLoad) {
      entry.connectionLoad = defaultConnectionLoad.value
    }

    if (
      props.allowManualAmount &&
      defaultAmount != null &&
      defaultAmount > 0 &&
      !hasReadingInput(entry) &&
      !entry.amount
    ) {
      entry.amount = defaultAmount
    }

    recalculateCharge(entry)
  }
}

const loadVariableCharges = async () => {
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

    toast.add({
      severity: 'success',
      summary: props.savedSummary,
      detail: `${response.data.saved} flat charge${response.data.saved === 1 ? '' : 's'} saved for this cycle.`,
      life: 10000,
    })
    await refreshPeriods()
    await loadVariableCharges()
  } finally {
    savingCharges.value = false
  }
}

watch(
  periods,
  (items) => {
    if (items.length === 0) {
      selectedPeriodId.value = ''
      return
    }

    if (!selectedPeriodId.value || !items.some((period) => period.id === selectedPeriodId.value)) {
      selectedPeriodId.value = items.find((period) => !period.isLocked)?.id ?? items[0]?.id ?? ''
    }
  },
  { immediate: true },
)

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
            as="a"
            href="/admin/billing/periods"
            label="Bill cycles"
            icon="pi pi-calendar"
            severity="secondary"
            outlined
          />
          <Button
            as="a"
            :href="finalGenerationHref"
            label="Generate bills"
            icon="pi pi-bolt"
          />
        </div>
      </header>

      <div class="billing-cycle-guide" aria-label="Charge entry summary">
        <div>
          <span>Selected cycle</span>
          <strong>{{ selectedPeriod?.label ?? 'No cycle selected' }}</strong>
          <p>{{ selectedCycleLabel }}</p>
        </div>
        <div>
          <span>{{ amountSummaryLabel }}</span>
          <strong>{{ formatMoney(chargeTotal) }}</strong>
          <p>{{ formatUnit(filledChargeCount, 'flat') }} with saved amount.</p>
        </div>
        <div>
          <span>Readings</span>
          <strong>{{ formatNumber(chargeUnitsTotal) }} {{ unitsSummaryLabel }}</strong>
          <p>{{ selectedCycleMonths }} {{ selectedCycleMonths === 1 ? 'month' : 'months' }} in this cycle.</p>
        </div>
      </div>
    </section>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>{{ title }}</h1>
          <p>Select a billing cycle, enter per-flat readings or amounts, then save.</p>
        </div>
        <div class="list-page__exports">
          <Button
            as="a"
            href="/admin/billing/periods"
            label="Create cycle"
            icon="pi pi-calendar-plus"
            severity="secondary"
            outlined
          />
        </div>
      </header>

      <div class="list-page__toolbar">
        <label class="list-page__search">
          <span class="field-label">
            Billing cycle
            <AppHelpIcon text="Select the monthly, quarterly, half-yearly, yearly, or custom bill cycle for this charge entry." />
          </span>
          <Select
            v-model="selectedPeriodId"
            :options="periodOptions"
            option-label="label"
            option-value="value"
            :loading="periodsPending"
            placeholder="Select cycle"
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

      <Message v-if="selectedPeriod?.isLocked" severity="warn">
        This billing cycle is locked. Unlock it before changing saved charges.
      </Message>
      <Message v-else-if="(selectedPeriod?.dueCount ?? 0) > 0" severity="warn">
        Bills already exist for this cycle. Saved changes will not alter already-generated dues.
      </Message>

      <section class="billing-variable-charge-panel">
        <header>
          <div>
            <p class="eyebrow">{{ chargeName }}</p>
            <h3>Per-flat entries</h3>
            <p>
              Opening and closing readings calculate units automatically. You can also enter direct amounts where applicable.
            </p>
          </div>
          <div>
            <strong>{{ formatMoney(chargeTotal) }}</strong>
            <span>
              {{ formatUnit(filledChargeCount, 'flat') }} -
              {{ formatNumber(chargeUnitsTotal) }} {{ unitsSummaryLabel }}
            </span>
          </div>
        </header>

        <div class="billing-variable-charge-defaults">
          <label v-if="allowManualAmount">
            <span class="field-label">
              {{ defaultAmountLabel }}
              <AppHelpIcon text="Applied to rows without readings or an existing amount." />
            </span>
            <InputNumber
              v-model="defaultFlatAmount"
              :min="0"
              :max-fraction-digits="2"
              fluid
            />
          </label>
          <label>
            <span class="field-label">
              {{ defaultRateLabel }}
              <AppHelpIcon text="Used when a flat row does not already have its own rate." />
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
              <AppHelpIcon text="Printed on rows that do not have a custom connection load." />
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
            {{ selectedPeriod?.label ?? 'No cycle selected' }}
          </span>
          <Button
            :label="saveButtonLabel"
            icon="pi pi-save"
            severity="secondary"
            outlined
            :loading="savingCharges"
            :disabled="!selectedPeriod || selectedPeriod.isLocked || invalidChargeEntries.length > 0"
            @click="saveVariableCharges"
          />
        </div>

        <Message v-if="invalidChargeEntries.length > 0" severity="warn">
          {{ formatUnit(invalidChargeEntries.length, 'flat') }} has closing reading below opening reading.
        </Message>

        <AppSkeletonState v-if="loadingCharges" />
        <AppDataTable
          v-else
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
          <Column :header="meterLabel" style="min-width: 8rem">
            <template #body="{ data: row }">
              <InputText v-model="row.meterNo" placeholder="Optional" fluid />
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
                @update:model-value="recalculateCharge(row)"
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
                @update:model-value="recalculateCharge(row)"
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
                :disabled="row.openingReading != null && row.closingReading != null"
                @update:model-value="recalculateCharge(row)"
              />
            </template>
          </Column>
          <Column header="Rate/unit" style="min-width: 7.5rem">
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
              <strong v-else>{{ formatMoney(Number(row.amount ?? 0)) }}</strong>
            </template>
          </Column>
          <Column v-if="showConnectionLoad" header="Load" style="min-width: 8.5rem">
            <template #body="{ data: row }">
              <InputText v-model="row.connectionLoad" placeholder="4 KW (5KVA)" fluid />
            </template>
          </Column>
        </AppDataTable>
      </section>
    </section>
  </div>
</template>
