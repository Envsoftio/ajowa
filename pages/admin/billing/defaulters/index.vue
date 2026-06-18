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

const formatContact = (value: string | null | undefined) => value || 'Not provided'

const search = ref('')
const sendingReminder = ref(false)

const { data, pending, refresh } = await useAsyncData(
  'admin-billing-defaulters',
  () => api<DefaulterResponse>('/api/admin/billing/defaulters'),
)

const defaulters = computed(() => data.value?.data ?? [])

const filteredDefaulters = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return defaulters.value

  return defaulters.value.filter((row) => {
    const flatText = row.flats
      .map((flat) => `${flat.blockName} ${flat.flatNumber}`)
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
})

const summary = computed(() => {
  const rows = filteredDefaulters.value
  const balance = rows.reduce((sum, row) => sum + row.totalBalance, 0)
  const paid = rows.reduce((sum, row) => sum + row.totalPaid, 0)
  const flats = rows.reduce((sum, row) => sum + row.flatCount, 0)
  const maxDays = rows.reduce(
    (max, row) => Math.max(max, row.maxDaysOverdue),
    0,
  )

  return { balance, paid, flats, maxDays }
})

const sendReminders = async (dueIds: string[]) => {
  if (dueIds.length === 0) return
  const confirmed = await confirmAction({
    header: 'Send payment reminders?',
    message: `Queue reminders for ${dueIds.length} due${dueIds.length === 1 ? '' : 's'}?`,
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
  } finally {
    sendingReminder.value = false
  }
}

const sendResidentReminder = (row: DefaulterSummary) =>
  sendReminders(row.flats.map((flat) => flat.dueId))

const sendFilteredReminders = () =>
  sendReminders(
    filteredDefaulters.value.flatMap((row) =>
      row.flats.map((flat) => flat.dueId),
    ),
  )
</script>

<template>
  <div class="landing-page">
    <div class="surface-grid">
      <section class="surface-card">
        <p class="eyebrow">Defaulters</p>
        <h3>{{ filteredDefaulters.length }}</h3>
        <p>{{ summary.flats }} flat-level outstanding dues.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Outstanding</p>
        <h3>{{ formatMoney(summary.balance) }}</h3>
        <p>
          {{ formatMoney(summary.paid) }} already collected from these dues.
        </p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Oldest overdue</p>
        <h3>{{ summary.maxDays }}</h3>
        <p>Maximum days overdue in the filtered list.</p>
      </section>
    </div>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Defaulters</h1>
          <p>
            Residents with unpaid maintenance dues, sorted by outstanding
            balance.
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
            label="Remind filtered"
            icon="pi pi-send"
            severity="secondary"
            outlined
            :loading="sendingReminder"
            :disabled="filteredDefaulters.length === 0"
            @click="sendFilteredReminders"
          />
        </div>
      </header>

      <div class="admin-page-guide">
        <h2>How to use this page</h2>
        <p>
          This page groups unpaid dues by resident so the admin can follow up on
          total outstanding balances.
        </p>
        <ol>
          <li>
            Search by resident, email, mobile number, block, or flat to narrow
            the list.
          </li>
          <li>Review the flat dues column to see which periods are pending.</li>
          <li>
            Use Remind filtered only after checking the filtered list, because
            it sends reminders for all visible residents.
          </li>
        </ol>
      </div>

      <div class="list-page__toolbar">
        <label class="list-page__search">
          <span class="field-label">
            Search
            <i
              class="pi pi-info-circle"
              title="Filter residents by name, email, mobile number, block, or flat before sending reminders."
              aria-label="Filter residents by name, email, mobile number, block, or flat before sending reminders."
            />
          </span>
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText
              v-model="search"
              placeholder="Search resident, email, mobile, or flat"
            />
          </IconField>
        </label>
      </div>

      <DataTable
        :value="filteredDefaulters"
        :loading="pending"
        paginator
        :rows="25"
        :rows-per-page-options="[10, 25, 50]"
        responsive-layout="scroll"
        class="list-page__table"
        data-key="userId"
      >
        <Column field="residentName" header="Resident">
          <template #body="{ data: row }">
            <strong>
              <NuxtLink :to="`/admin/residents/${row.userId}`" class="table-link-button">
                {{ row.residentName }}
              </NuxtLink>
            </strong>
            <p class="table-muted">
              {{ formatContact(row.residentEmail) }} · {{ formatContact(row.residentMobileNumber) }}
            </p>
          </template>
        </Column>
        <Column field="flatCount" header="Flats" />
        <Column field="totalDue" header="Total due">
          <template #body="{ data: row }">
            {{ formatMoney(row.totalDue) }}
          </template>
        </Column>
        <Column field="totalPaid" header="Paid">
          <template #body="{ data: row }">
            {{ formatMoney(row.totalPaid) }}
          </template>
        </Column>
        <Column field="totalBalance" header="Balance">
          <template #body="{ data: row }">
            <strong>{{ formatMoney(row.totalBalance) }}</strong>
          </template>
        </Column>
        <Column field="maxDaysOverdue" header="Max overdue">
          <template #body="{ data: row }">
            {{ row.maxDaysOverdue }} days
          </template>
        </Column>
        <Column header="Flat dues">
          <template #body="{ data: row }">
            <div class="defaulter-flat-list">
              <div
                v-for="flat in row.flats"
                :key="flat.dueId"
                class="defaulter-flat-pill"
              >
                <span>{{ flat.blockName }} {{ flat.flatNumber }}</span>
                <strong>{{ formatMoney(flat.balanceAmount) }}</strong>
                <small
                  >{{ flat.billingPeriodLabel }} ·
                  {{ flat.daysOverdue }} days</small
                >
              </div>
            </div>
          </template>
        </Column>
        <Column header="Actions" style="width: 90px">
          <template #body="{ data: row }">
            <Button
              icon="pi pi-send"
              severity="secondary"
              text
              rounded
              :aria-label="`Send reminder to ${row.residentName}`"
              :title="`Send reminder to ${row.residentName}`"
              :loading="sendingReminder"
              @click="sendResidentReminder(row)"
            />
          </template>
        </Column>
      </DataTable>
    </section>
  </div>
</template>
