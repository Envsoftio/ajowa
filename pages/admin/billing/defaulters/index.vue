<script setup lang="ts">
import type {
  BillingPeriod,
  BillingPeriodChargeType,
  BlockSummary,
  DefaulterSummary,
} from '~/types/domain'
import ResidentAvatar from '~/components/residents/ResidentAvatar.vue'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Defaulters',
})

type DefaulterResponse = { ok: true; data: DefaulterSummary[] }
type PeriodResponse = { ok: true; data: { items: BillingPeriod[] } }
type BlockResponse = { ok: true; data: { items: BlockSummary[] } }
type DefaulterFlat = DefaulterSummary['flats'][number]

const api = useApi()
const toast = useToast()
const confirmAction = useAppConfirm()

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)

const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-IN').format(value)

const formatDate = (value: string | null | undefined) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
        dateStyle: 'medium',
      })
    : '-'

const formatPlural = (
  count: number,
  singular: string,
  plural = `${singular}s`,
) => `${formatNumber(count)} ${count === 1 ? singular : plural}`

const formatContact = (value: string | null | undefined) =>
  value || 'Not provided'

const search = ref('')
const billingPeriodFilter = ref('')
const blockFilter = ref('')
const chargeTypeFilter = ref('')
const overdueFilter = ref('')
const balanceFilter = ref('')
const contactFilter = ref('')
const sendingReminder = ref(false)
const selectedDefaulters = ref<DefaulterSummary[]>([])

const overdueOptions = [
  { label: 'All unpaid', value: '' },
  { label: 'Not overdue yet', value: 'not_overdue' },
  { label: 'Any overdue', value: 'overdue' },
  { label: '1-13 days', value: 'recent' },
  { label: '14-29 days', value: 'aging' },
  { label: '30-44 days', value: 'escalated' },
  { label: '45+ days', value: 'critical' },
]

const balanceOptions = [
  { label: 'All balances', value: '' },
  { label: 'Up to 5k', value: 'small' },
  { label: '5k-15k', value: 'medium' },
  { label: '15k+', value: 'large' },
]

const chargeTypeOptions: Array<{
  label: string
  value: '' | BillingPeriodChargeType
}> = [
  { label: 'All bill types', value: '' },
  { label: 'CAM', value: 'CAM' },
  { label: 'DG Set', value: 'DG_SET' },
  { label: 'General', value: 'GENERAL' },
]

const contactOptions = [
  { label: 'All email states', value: '' },
  { label: 'Email ready', value: 'ready' },
  { label: 'Missing email', value: 'missing' },
]

const [
  defaultersAsyncData,
  periodsAsyncData,
  blocksAsyncData,
] = await Promise.all([
  useAsyncData(
    'admin-billing-defaulters',
    () => api<DefaulterResponse>('/api/admin/billing/defaulters'),
  ),
  useAsyncData('defaulter-period-options', () =>
    api<PeriodResponse>('/api/admin/billing/periods', {
      query: {
        page: 1,
        pageSize: 2000,
        sortBy: 'startDate',
        sortDirection: 'desc',
      },
    }),
  ),
  useAsyncData('defaulter-block-options', () =>
    api<BlockResponse>('/api/admin/blocks', {
      query: {
        page: 1,
        pageSize: 2000,
        sortBy: 'sortOrder',
        sortDirection: 'asc',
      },
    }),
  ),
])

const { data, pending, refresh } = defaultersAsyncData
const { data: periodsData } = periodsAsyncData
const { data: blocksData } = blocksAsyncData

const defaulters = computed(() => data.value?.data ?? [])

const billingPeriodOptions = computed(() => [
  { label: 'All periods', value: '' },
  ...(periodsData.value?.data.items ?? []).map((period) => ({
    label: period.label,
    value: period.id,
  })),
])

const blockOptions = computed(() => [
  { label: 'All towers', value: '' },
  ...(blocksData.value?.data.items ?? []).map((block) => ({
    label: block.name,
    value: block.id,
  })),
])

const hasReminderContact = (row: DefaulterSummary) =>
  Boolean(row.residentEmail)

const chargeTypeLabel = (value: string | null | undefined) => {
  if (value === 'CAM') return 'CAM'
  if (value === 'DG_SET') return 'DG Set'
  return 'General'
}

const overdueBucketMatches = (daysOverdue: number) => {
  if (overdueFilter.value === 'not_overdue') {
    return daysOverdue === 0
  }

  if (overdueFilter.value === 'overdue') {
    return daysOverdue > 0
  }

  if (overdueFilter.value === 'recent') {
    return daysOverdue >= 1 && daysOverdue < 14
  }

  if (overdueFilter.value === 'aging') {
    return daysOverdue >= 14 && daysOverdue < 30
  }

  if (overdueFilter.value === 'escalated') {
    return daysOverdue >= 30 && daysOverdue < 45
  }

  if (overdueFilter.value === 'critical') {
    return daysOverdue >= 45
  }

  return true
}

const balanceBucketMatches = (balanceAmount: number) => {
  if (balanceFilter.value === 'small') {
    return balanceAmount <= 5000
  }

  if (balanceFilter.value === 'medium') {
    return balanceAmount > 5000 && balanceAmount <= 15000
  }

  if (balanceFilter.value === 'large') {
    return balanceAmount > 15000
  }

  return true
}

const flatSearchText = (flat: DefaulterFlat) =>
  [
    flat.blockName,
    flat.flatNumber,
    flat.billingPeriodLabel,
    chargeTypeLabel(flat.billingPeriodChargeType),
  ]
    .join(' ')
    .toLowerCase()

const flatMatchesFilters = (flat: DefaulterFlat) => {
  if (billingPeriodFilter.value && flat.billingPeriodId !== billingPeriodFilter.value) {
    return false
  }

  if (blockFilter.value && flat.blockId !== blockFilter.value) {
    return false
  }

  if (chargeTypeFilter.value && flat.billingPeriodChargeType !== chargeTypeFilter.value) {
    return false
  }

  return overdueBucketMatches(flat.daysOverdue) && balanceBucketMatches(flat.balanceAmount)
}

const summarizeDefaulter = (
  row: DefaulterSummary,
  flats: DefaulterFlat[],
): DefaulterSummary => ({
  ...row,
  flatCount: new Set(flats.map((flat) => flat.flatId)).size,
  flats,
  totalDue: flats.reduce((sum, flat) => sum + flat.totalAmount, 0),
  totalPaid: flats.reduce((sum, flat) => sum + flat.paidAmount, 0),
  totalBalance: flats.reduce((sum, flat) => sum + flat.balanceAmount, 0),
  maxDaysOverdue: flats.reduce((max, flat) => Math.max(max, flat.daysOverdue), 0),
})

const filteredDefaulters = computed(() => {
  const term = search.value.trim().toLowerCase()

  return defaulters.value
    .map((row) => {
      if (contactFilter.value === 'ready' && !hasReminderContact(row)) {
        return null
      }

      if (contactFilter.value === 'missing' && hasReminderContact(row)) {
        return null
      }

      const matchingFlats = row.flats.filter(flatMatchesFilters)
      if (matchingFlats.length === 0) {
        return null
      }

      if (!term) return summarizeDefaulter(row, matchingFlats)

      const flatText = matchingFlats
        .map(flatSearchText)
        .join(' ')
      const ownerText = [
        row.residentName,
        row.residentEmail,
        row.residentMobileNumber,
      ]
        .join(' ')
        .toLowerCase()

      return `${ownerText} ${flatText}`.includes(term)
        ? summarizeDefaulter(row, matchingFlats)
        : null
    })
    .filter((row): row is DefaulterSummary => Boolean(row))
    .sort(
      (a, b) =>
        b.maxDaysOverdue - a.maxDaysOverdue ||
        b.totalBalance - a.totalBalance ||
        a.residentName.localeCompare(b.residentName),
    )
})

const summary = computed(() => {
  const rows = filteredDefaulters.value
  const balance = rows.reduce((sum, row) => sum + row.totalBalance, 0)
  const paid = rows.reduce((sum, row) => sum + row.totalPaid, 0)
  const flats = rows.reduce((sum, row) => sum + row.flatCount, 0)
  const dues = rows.reduce((sum, row) => sum + row.flats.length, 0)
  const maxDays = rows.reduce(
    (max, row) => Math.max(max, row.maxDaysOverdue),
    0,
  )
  const critical = rows.filter((row) => row.maxDaysOverdue >= 45).length
  const remindable = rows.filter(hasReminderContact).length

  return { balance, paid, flats, dues, maxDays, critical, remindable }
})

const selectedReminderRows = computed(() =>
  selectedDefaulters.value.filter(hasReminderContact),
)

const selectedDueIds = computed(() =>
  selectedReminderRows.value.flatMap((row) =>
    row.flats.map((flat) => flat.dueId),
  ),
)

const hasActiveFilters = computed(
  () =>
    Boolean(search.value) ||
    Boolean(billingPeriodFilter.value) ||
    Boolean(blockFilter.value) ||
    Boolean(chargeTypeFilter.value) ||
    Boolean(overdueFilter.value) ||
    Boolean(balanceFilter.value) ||
    Boolean(contactFilter.value),
)

const exportQuery = computed(() => {
  const query: Record<string, string> = {}

  if (search.value.trim()) query.search = search.value.trim()
  if (billingPeriodFilter.value) {
    query.billingPeriodId = billingPeriodFilter.value
  }
  if (blockFilter.value) query.blockId = blockFilter.value
  if (chargeTypeFilter.value) query.chargeType = chargeTypeFilter.value
  if (overdueFilter.value) query.overdue = overdueFilter.value
  if (balanceFilter.value) query.balance = balanceFilter.value
  if (contactFilter.value) query.contact = contactFilter.value

  return query
})

const exportUrl = (format: 'pdf' | 'xlsx') => {
  const params = new URLSearchParams({
    ...exportQuery.value,
    export: format,
  })

  return `/api/admin/billing/defaulters?${params.toString()}`
}

const topDefaulter = computed(() => filteredDefaulters.value[0] ?? null)

const queueTitle = computed(() => {
  if (filteredDefaulters.value.length === 0) return 'No owners in this queue'
  if (overdueFilter.value === 'critical') return 'Critical follow-ups'
  if (overdueFilter.value === 'escalated') return 'Escalated follow-ups'
  if (overdueFilter.value === 'aging') return 'Aging follow-ups'
  if (overdueFilter.value === 'recent') return 'Recently overdue'
  if (overdueFilter.value === 'overdue') return 'Overdue follow-ups'
  if (overdueFilter.value === 'not_overdue') return 'Not-yet-overdue dues'
  return 'Unpaid follow-ups'
})

const overdueSeverity = (days: number) => {
  if (days >= 45) return 'danger'
  if (days >= 14) return 'warn'
  return 'info'
}

const overdueLabel = (days: number) =>
  days > 0 ? `Overdue by: ${formatPlural(days, 'day')}` : 'Not overdue'

const balanceStatusLabel = (daysOverdue: number) =>
  daysOverdue > 0 ? 'Overdue' : 'Outstanding'

const paymentSummaryLabel = (paidAmount: number, totalAmount: number) => {
  if (paidAmount <= 0) {
    return `No payment received: ${formatMoney(paidAmount)} of ${formatMoney(totalAmount)}`
  }

  return `${paidAmount < totalAmount ? 'Partial payment received' : 'Payment received'}: ${formatMoney(paidAmount)} of ${formatMoney(totalAmount)}`
}

const paymentProgress = (row: DefaulterSummary) =>
  row.totalDue > 0
    ? Math.min(100, Math.round((row.totalPaid / row.totalDue) * 100))
    : 0

const resetFilters = () => {
  search.value = ''
  billingPeriodFilter.value = ''
  blockFilter.value = ''
  chargeTypeFilter.value = ''
  overdueFilter.value = ''
  balanceFilter.value = ''
  contactFilter.value = ''
}

const sendReminders = async (
  dueIds: string[],
  ownerCount: number,
  ownerUserIds: string[],
) => {
  if (dueIds.length === 0) return
  const confirmed = await confirmAction({
    header: 'Send payment reminders?',
    message: `Queue reminders for ${formatPlural(dueIds.length, 'due')} across ${formatPlural(ownerCount, 'owner')}?`,
    icon: 'pi pi-send',
    acceptLabel: 'Send reminders',
    acceptSeverity: 'warn',
  })

  if (!confirmed) {
    return
  }

  sendingReminder.value = true

  try {
    const response = await api<{
      ok: true
      data: { eligible: number; jobCount: number }
    }>('/api/admin/billing/dues/reminders', {
      method: 'POST',
      body: {
        dueIds,
        recipientUserIds: ownerUserIds,
        recipientRelationshipTypes: ['OWNER'],
      },
    })
    toast.add({
      severity: 'success',
      summary: 'Reminders queued',
      detail: `${response.data.eligible} dues matched and ${response.data.jobCount} delivery jobs were queued.`,
      life: 10000,
    })
    selectedDefaulters.value = []
  } finally {
    sendingReminder.value = false
  }
}

const sendOwnerReminder = (row: DefaulterSummary) =>
  sendReminders(
    row.flats.map((flat) => flat.dueId),
    1,
    [row.userId],
  )

const sendSelectedReminders = () =>
  sendReminders(
    selectedDueIds.value,
    selectedReminderRows.value.length,
    selectedReminderRows.value.map((row) => row.userId),
  )

watch(filteredDefaulters, (rows) => {
  const visibleById = new Map(rows.map((row) => [row.userId, row]))
  selectedDefaulters.value = selectedDefaulters.value.flatMap((row) => {
    const visibleRow = visibleById.get(row.userId)
    return visibleRow ? [visibleRow] : []
  })
})
</script>

<template>
  <div class="landing-page">
    <div class="surface-grid">
      <section class="surface-card">
        <p class="eyebrow">Owners unpaid</p>
        <h3>{{ formatNumber(filteredDefaulters.length) }}</h3>
        <p>{{ formatPlural(summary.flats, 'flat') }} with pending balances.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Outstanding</p>
        <h3>{{ formatMoney(summary.balance) }}</h3>
        <p>{{ formatMoney(summary.paid) }} already collected.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Oldest due</p>
        <h3>
          {{ summary.maxDays > 0 ? formatPlural(summary.maxDays, 'day') : 'Not overdue' }}
        </h3>
        <p v-if="summary.maxDays > 0">
          {{ formatPlural(summary.critical, 'owner') }} past 45 days.
        </p>
        <p v-else>No dues past their due date.</p>
      </section>
    </div>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Owner unpaid follow-ups</h1>
          <p>
            Flat owners with unpaid maintenance dues, sorted by urgency and
            balance.
          </p>
        </div>
        <div class="list-page__exports">
          <AppDocumentLink
            :href="exportUrl('pdf')"
            viewer-title="Defaulters PDF"
            label="PDF"
            icon="pi pi-file-pdf"
            severity="secondary"
            outlined
          />
          <Button
            as="a"
            :href="exportUrl('xlsx')"
            label="Excel"
            icon="pi pi-file-excel"
            severity="secondary"
            outlined
            target="_blank"
            rel="noopener"
          />
          <Button
            label="Refresh"
            icon="pi pi-refresh"
            severity="secondary"
            outlined
            @click="() => refresh()"
          />
          <Button
            :label="
              selectedReminderRows.length > 0
                ? `Remind ${selectedReminderRows.length}`
                : 'Remind selected'
            "
            icon="pi pi-send"
            severity="secondary"
            outlined
            :loading="sendingReminder"
            :disabled="selectedDueIds.length === 0"
            @click="sendSelectedReminders"
          />
          <Button
            label="Clear filters"
            icon="pi pi-filter-slash"
            severity="secondary"
            outlined
            :disabled="!hasActiveFilters"
            @click="resetFilters"
          />
        </div>
      </header>

      <div class="billing-workflow-panel billing-workflow-panel--dues">
        <div>
          <p class="eyebrow">Current queue</p>
          <h2>{{ queueTitle }}</h2>
          <p v-if="topDefaulter">
            Top pending balance is {{ topDefaulter.residentName }} with
            {{ formatMoney(topDefaulter.totalBalance) }} pending across
            {{ formatPlural(topDefaulter.flatCount, 'flat') }}.
          </p>
          <p v-else>No unpaid balances match the current filters.</p>
        </div>
        <dl>
          <div>
            <dt>Dues shown</dt>
            <dd>{{ formatNumber(summary.dues) }}</dd>
          </div>
          <div>
            <dt>Selected</dt>
            <dd>{{ formatNumber(selectedDefaulters.length) }}</dd>
          </div>
          <div>
            <dt>Email ready</dt>
            <dd>{{ formatNumber(summary.remindable) }}</dd>
          </div>
        </dl>
      </div>

      <div class="list-page__toolbar">
        <label class="list-page__search">
          <span class="field-label">
            Search
            <AppHelpIcon
              text="Find owners by name, email, mobile number, tower, flat, or billing period."
            />
          </span>
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText
              v-model="search"
              placeholder="Owner, contact, flat, or period"
            />
          </IconField>
        </label>
        <div class="list-page__filters">
          <label>
            <span class="field-label">
              Period
              <AppHelpIcon
                text="Limit the queue to unpaid dues from one billing period."
              />
            </span>
            <Select
              v-model="billingPeriodFilter"
              :options="billingPeriodOptions"
              option-label="label"
              option-value="value"
              placeholder="Period"
            />
          </label>
          <label>
            <span class="field-label">
              Tower
              <AppHelpIcon
                text="Show unpaid dues for flats in one tower."
              />
            </span>
            <Select
              v-model="blockFilter"
              :options="blockOptions"
              option-label="label"
              option-value="value"
              placeholder="Tower"
            />
          </label>
          <label>
            <span class="field-label">
              Bill type
              <AppHelpIcon
                text="Filter unpaid dues by billing charge type."
              />
            </span>
            <Select
              v-model="chargeTypeFilter"
              :options="chargeTypeOptions"
              option-label="label"
              option-value="value"
              placeholder="Bill type"
            />
          </label>
          <label>
            <span class="field-label">
              Overdue age
              <AppHelpIcon
                text="Filter the list by whether dues are overdue and how long they have been overdue."
              />
            </span>
            <Select
              v-model="overdueFilter"
              :options="overdueOptions"
              option-label="label"
              option-value="value"
              placeholder="Overdue age"
            />
          </label>
          <label>
            <span class="field-label">
              Balance
              <AppHelpIcon
                text="Filter by outstanding balance for each unpaid due."
              />
            </span>
            <Select
              v-model="balanceFilter"
              :options="balanceOptions"
              option-label="label"
              option-value="value"
              placeholder="Balance"
            />
          </label>
          <label>
            <span class="field-label">
              Email
              <AppHelpIcon
                text="Show owners with email reminder details or owners missing email."
              />
            </span>
            <Select
              v-model="contactFilter"
              :options="contactOptions"
              option-label="label"
              option-value="value"
              placeholder="Email"
            />
          </label>
        </div>
      </div>

      <AppState
        v-if="!pending && filteredDefaulters.length === 0"
        title="No unpaid owners found"
        message="This queue updates from generated maintenance dues when owner-linked flats have unpaid balances."
        icon="pi pi-check-circle"
      />

      <AppDataTable
        v-else
        v-model:selection="selectedDefaulters"
        :value="filteredDefaulters"
        :loading="pending"
        paginator
        :rows="25"
        :rows-per-page-options="[10, 25, 50]"
        responsive-layout="scroll"
        class="list-page__table"
        data-key="userId"
      >
        <Column selection-mode="multiple" header-style="width: 3rem" />
        <Column field="residentName" header="Flat owner">
          <template #body="{ data: row }">
            <div class="defaulter-owner">
              <ResidentAvatar
                :name="row.residentName"
                :resident-id="row.userId"
                :profile-image-path="row.residentProfileImagePath"
                :updated-at="row.residentProfileUpdatedAt"
                :size="40"
                previewable
              />
              <div>
                <strong>
                  <NuxtLink
                    :to="`/admin/residents/${row.userId}`"
                    class="table-link-button"
                  >
                    {{ row.residentName }}
                  </NuxtLink>
                </strong>
                <p class="table-muted">
                  {{ formatContact(row.residentEmail) }} ·
                  {{ formatContact(row.residentMobileNumber) }}
                </p>
              </div>
            </div>
          </template>
        </Column>
        <Column field="maxDaysOverdue" header="Priority">
          <template #body="{ data: row }">
            <Tag
              :severity="overdueSeverity(row.maxDaysOverdue)"
              :value="overdueLabel(row.maxDaysOverdue)"
              rounded
            />
            <p v-if="!hasReminderContact(row)" class="table-muted">
              Missing owner email
            </p>
          </template>
        </Column>
        <Column field="totalBalance" header="Balance">
          <template #body="{ data: row }">
            <div class="billing-balance-cell">
              <strong>
                {{ balanceStatusLabel(row.maxDaysOverdue) }}:
                {{ formatMoney(row.totalBalance) }}
              </strong>
              <span>
                {{ paymentSummaryLabel(row.totalPaid, row.totalDue) }}
              </span>
              <div class="billing-progress-track">
                <span :style="{ width: `${paymentProgress(row)}%` }" />
              </div>
            </div>
          </template>
        </Column>
        <Column header="Pending dues">
          <template #body="{ data: row }">
            <div class="defaulter-flat-list">
              <div
                v-for="flat in row.flats"
                :key="flat.dueId"
                class="defaulter-flat-pill"
              >
                <div class="defaulter-flat-pill__header">
                  <span>{{ flat.blockName }} {{ flat.flatNumber }}</span>
                  <strong>{{ formatMoney(flat.balanceAmount) }}</strong>
                </div>
                <small>
                  {{ flat.billingPeriodLabel }} ·
                  {{ chargeTypeLabel(flat.billingPeriodChargeType) }} · Due
                  {{ formatDate(flat.dueDate) }} ·
                  {{ overdueLabel(flat.daysOverdue) }}
                </small>
                <p v-if="flat.camAdvanceNote" class="table-muted">
                  CAM advance: {{ flat.camAdvanceNote }}
                </p>
              </div>
            </div>
          </template>
        </Column>
        <Column header="Actions" style="width: 120px">
          <template #body="{ data: row }">
            <div class="admin-inline-actions">
              <Button
                as="a"
                :href="`/admin/residents/${row.userId}`"
                icon="pi pi-user"
                severity="secondary"
                text
                rounded
                :aria-label="`Open owner ${row.residentName}`"
                :title="`Open owner ${row.residentName}`"
              />
              <Button
                icon="pi pi-send"
                severity="secondary"
                text
                rounded
                :aria-label="`Send reminder to owner ${row.residentName}`"
                :title="`Send reminder to owner ${row.residentName}`"
                :loading="sendingReminder"
                :disabled="!hasReminderContact(row)"
                @click="sendOwnerReminder(row)"
              />
            </div>
          </template>
        </Column>
      </AppDataTable>

      <div v-if="filteredDefaulters.length > 0" class="list-page__cards">
        <article
          v-for="row in filteredDefaulters"
          :key="row.userId"
          class="list-card"
        >
          <div class="list-card__header">
            <div class="defaulter-owner">
              <ResidentAvatar
                :name="row.residentName"
                :resident-id="row.userId"
                :profile-image-path="row.residentProfileImagePath"
                :updated-at="row.residentProfileUpdatedAt"
                :size="44"
                previewable
              />
              <div>
                <h3>{{ row.residentName }}</h3>
                <p>
                  {{ formatContact(row.residentEmail) }} ·
                  {{ formatContact(row.residentMobileNumber) }}
                </p>
              </div>
            </div>
            <Tag
              :severity="overdueSeverity(row.maxDaysOverdue)"
              :value="overdueLabel(row.maxDaysOverdue)"
              rounded
            />
          </div>
          <div class="billing-balance-cell billing-balance-cell--card">
            <strong>
              {{ balanceStatusLabel(row.maxDaysOverdue) }}:
              {{ formatMoney(row.totalBalance) }}
            </strong>
            <span>
              {{ paymentSummaryLabel(row.totalPaid, row.totalDue) }}
            </span>
            <div class="billing-progress-track">
              <span :style="{ width: `${paymentProgress(row)}%` }" />
            </div>
          </div>
          <div class="defaulter-flat-list">
            <div
              v-for="flat in row.flats"
              :key="flat.dueId"
              class="defaulter-flat-pill"
            >
              <div class="defaulter-flat-pill__header">
                <span>{{ flat.blockName }} {{ flat.flatNumber }}</span>
                <strong>{{ formatMoney(flat.balanceAmount) }}</strong>
              </div>
              <small>
                {{ flat.billingPeriodLabel }} ·
                {{ chargeTypeLabel(flat.billingPeriodChargeType) }} · Due
                {{ formatDate(flat.dueDate) }} ·
                {{ overdueLabel(flat.daysOverdue) }}
              </small>
              <p v-if="flat.camAdvanceNote" class="table-muted">
                CAM advance: {{ flat.camAdvanceNote }}
              </p>
            </div>
          </div>
          <div class="admin-inline-actions">
            <Button
              as="a"
              :href="`/admin/residents/${row.userId}`"
              label="Owner"
              icon="pi pi-user"
              size="small"
              severity="secondary"
              outlined
            />
            <Button
              label="Remind"
              icon="pi pi-send"
              size="small"
              severity="secondary"
              outlined
              :loading="sendingReminder"
              :disabled="!hasReminderContact(row)"
              @click="sendOwnerReminder(row)"
            />
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.defaulter-owner {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}
</style>
