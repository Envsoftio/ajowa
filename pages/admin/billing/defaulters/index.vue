<script setup lang="ts">
import type { DefaulterSummary } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Defaulters',
})

type DefaulterResponse = { ok: true; data: DefaulterSummary[] }

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
const overdueFilter = ref('')
const contactFilter = ref('')
const sendingReminder = ref(false)
const selectedDefaulters = ref<DefaulterSummary[]>([])

const overdueOptions = [
  { label: 'All overdue', value: '' },
  { label: '1-13 days', value: 'recent' },
  { label: '14-44 days', value: 'aging' },
  { label: '45+ days', value: 'critical' },
]

const contactOptions = [
  { label: 'All contacts', value: '' },
  { label: 'Ready to remind', value: 'ready' },
  { label: 'Missing contact', value: 'missing' },
]

const { data, pending, refresh } = await useAsyncData(
  'admin-billing-defaulters',
  () => api<DefaulterResponse>('/api/admin/billing/defaulters'),
)

const defaulters = computed(() => data.value?.data ?? [])

const hasReminderContact = (row: DefaulterSummary) =>
  Boolean(row.residentEmail || row.residentMobileNumber)

const overdueBucketMatches = (row: DefaulterSummary) => {
  if (overdueFilter.value === 'recent') {
    return row.maxDaysOverdue >= 1 && row.maxDaysOverdue < 14
  }

  if (overdueFilter.value === 'aging') {
    return row.maxDaysOverdue >= 14 && row.maxDaysOverdue < 45
  }

  if (overdueFilter.value === 'critical') {
    return row.maxDaysOverdue >= 45
  }

  return true
}

const filteredDefaulters = computed(() => {
  const term = search.value.trim().toLowerCase()

  return defaulters.value
    .filter((row) => {
      if (!overdueBucketMatches(row)) return false

      if (contactFilter.value === 'ready' && !hasReminderContact(row)) {
        return false
      }

      if (contactFilter.value === 'missing' && hasReminderContact(row)) {
        return false
      }

      if (!term) return true

      const flatText = row.flats
        .map(
          (flat) =>
            `${flat.blockName} ${flat.flatNumber} ${flat.billingPeriodLabel}`,
        )
        .join(' ')
      return [
        row.residentName,
        row.residentEmail,
        row.residentMobileNumber,
        flatText,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
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
    Boolean(overdueFilter.value) ||
    Boolean(contactFilter.value),
)

const topDefaulter = computed(() => filteredDefaulters.value[0] ?? null)

const queueTitle = computed(() => {
  if (filteredDefaulters.value.length === 0) return 'No residents in this queue'
  if (overdueFilter.value === 'critical') return 'Critical follow-ups'
  if (overdueFilter.value === 'aging') return 'Aging follow-ups'
  if (overdueFilter.value === 'recent') return 'Recently overdue'
  return 'Overdue follow-ups'
})

const overdueSeverity = (days: number) => {
  if (days >= 45) return 'danger'
  if (days >= 14) return 'warn'
  return 'info'
}

const paymentProgress = (row: DefaulterSummary) =>
  row.totalDue > 0
    ? Math.min(100, Math.round((row.totalPaid / row.totalDue) * 100))
    : 0

const resetFilters = () => {
  search.value = ''
  overdueFilter.value = ''
  contactFilter.value = ''
}

const sendReminders = async (dueIds: string[], residentCount: number) => {
  if (dueIds.length === 0) return
  const confirmed = await confirmAction({
    header: 'Send payment reminders?',
    message: `Queue reminders for ${formatPlural(dueIds.length, 'due')} across ${formatPlural(residentCount, 'resident')}?`,
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
      body: { dueIds },
    })
    toast.add({
      severity: 'success',
      summary: 'Reminders queued',
      detail: `${response.data.eligible} dues matched and ${response.data.jobCount} delivery jobs were queued.`,
      life: 10000,
    })
    selectedDefaulters.value = []
    await refresh()
  } finally {
    sendingReminder.value = false
  }
}

const sendResidentReminder = (row: DefaulterSummary) =>
  sendReminders(
    row.flats.map((flat) => flat.dueId),
    1,
  )

const sendSelectedReminders = () =>
  sendReminders(selectedDueIds.value, selectedReminderRows.value.length)

watch(filteredDefaulters, (rows) => {
  const visibleIds = new Set(rows.map((row) => row.userId))
  selectedDefaulters.value = selectedDefaulters.value.filter((row) =>
    visibleIds.has(row.userId),
  )
})
</script>

<template>
  <div class="landing-page">
    <div class="surface-grid">
      <section class="surface-card">
        <p class="eyebrow">Residents overdue</p>
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
        <h3>{{ formatPlural(summary.maxDays, 'day') }}</h3>
        <p>{{ formatPlural(summary.critical, 'resident') }} past 45 days.</p>
      </section>
    </div>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Defaulter follow-ups</h1>
          <p>
            Billing contacts with overdue maintenance dues, sorted by urgency
            and balance.
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
            Highest priority is {{ topDefaulter.residentName }} with
            {{ formatMoney(topDefaulter.totalBalance) }} pending across
            {{ formatPlural(topDefaulter.flatCount, 'flat') }}.
          </p>
          <p v-else>No overdue balances match the current filters.</p>
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
            <dt>Remindable</dt>
            <dd>{{ formatNumber(summary.remindable) }}</dd>
          </div>
        </dl>
      </div>

      <div class="list-page__toolbar">
        <label class="list-page__search">
          <span class="field-label">
            Search
            <AppHelpIcon
              text="Find residents by name, email, mobile number, block, flat, or billing period."
            />
          </span>
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText
              v-model="search"
              placeholder="Resident, contact, flat, or period"
            />
          </IconField>
        </label>
        <div class="list-page__filters">
          <label>
            <span class="field-label">
              Overdue age
              <AppHelpIcon
                text="Filter the list by how long dues have been overdue."
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
              Contact
              <AppHelpIcon
                text="Show residents with reminder contact details or residents missing both email and mobile."
              />
            </span>
            <Select
              v-model="contactFilter"
              :options="contactOptions"
              option-label="label"
              option-value="value"
              placeholder="Contact"
            />
          </label>
        </div>
      </div>

      <AppState
        v-if="!pending && filteredDefaulters.length === 0"
        title="No overdue defaulters found"
        message="This queue updates from generated maintenance dues once their due dates pass."
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
        <Column field="residentName" header="Billing contact">
          <template #body="{ data: row }">
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
          </template>
        </Column>
        <Column field="maxDaysOverdue" header="Priority">
          <template #body="{ data: row }">
            <Tag
              :severity="overdueSeverity(row.maxDaysOverdue)"
              :value="`${row.maxDaysOverdue} day${row.maxDaysOverdue === 1 ? '' : 's'}`"
              rounded
            />
            <p v-if="!hasReminderContact(row)" class="table-muted">
              Missing reminder contact
            </p>
          </template>
        </Column>
        <Column field="totalBalance" header="Balance">
          <template #body="{ data: row }">
            <div class="billing-balance-cell">
              <strong>{{ formatMoney(row.totalBalance) }}</strong>
              <span>
                {{ formatMoney(row.totalPaid) }} paid of
                {{ formatMoney(row.totalDue) }}
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
                  {{ flat.billingPeriodLabel }} · Due
                  {{ formatDate(flat.dueDate) }} · {{ flat.daysOverdue }} days
                </small>
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
                :aria-label="`Open ${row.residentName}`"
                :title="`Open ${row.residentName}`"
              />
              <Button
                icon="pi pi-send"
                severity="secondary"
                text
                rounded
                :aria-label="`Send reminder to ${row.residentName}`"
                :title="`Send reminder to ${row.residentName}`"
                :loading="sendingReminder"
                :disabled="!hasReminderContact(row)"
                @click="sendResidentReminder(row)"
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
            <div>
              <h3>{{ row.residentName }}</h3>
              <p>
                {{ formatContact(row.residentEmail) }} ·
                {{ formatContact(row.residentMobileNumber) }}
              </p>
            </div>
            <Tag
              :severity="overdueSeverity(row.maxDaysOverdue)"
              :value="`${row.maxDaysOverdue} day${row.maxDaysOverdue === 1 ? '' : 's'}`"
              rounded
            />
          </div>
          <div class="billing-balance-cell billing-balance-cell--card">
            <strong>{{ formatMoney(row.totalBalance) }}</strong>
            <span>
              {{ formatMoney(row.totalPaid) }} paid of
              {{ formatMoney(row.totalDue) }}
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
                {{ flat.billingPeriodLabel }} · Due
                {{ formatDate(flat.dueDate) }} · {{ flat.daysOverdue }} days
              </small>
            </div>
          </div>
          <div class="admin-inline-actions">
            <Button
              as="a"
              :href="`/admin/residents/${row.userId}`"
              label="Resident"
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
              @click="sendResidentReminder(row)"
            />
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
