<script setup lang="ts">
import type { FinancialPeriodClose } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Financial Period Close',
})

type PeriodsResponse = { ok: true; data: { items: FinancialPeriodClose[] } }

const api = useApi()
const toast = useToast()

const saving = ref(false)
const form = reactive({
  startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10),
  endDate: new Date().toISOString().slice(0, 10),
  notes: '',
})

const { data, pending, refresh } = await useAsyncData(
  'admin-finance-period-close',
  () => api<PeriodsResponse>('/api/admin/finance/period-close'),
)

const periods = computed(() => data.value?.data.items ?? [])

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    value,
  )

const formatDate = (value: string | null | undefined) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
        dateStyle: 'medium',
      })
    : '-'

const summary = computed(() => {
  const rows = periods.value
  const activeClosed = rows.filter((period) => !period.isReopened)
  const latest = activeClosed[0] ?? rows[0]

  return {
    closed: activeClosed.length,
    reopened: rows.filter((period) => period.isReopened).length,
    latestLabel: latest
      ? `${formatDate(latest.startDate)} - ${formatDate(latest.endDate)}`
      : 'No period closed yet',
  }
})

const closePeriod = async () => {
  if (
    !window.confirm(
      `Close financial period ${form.startDate} to ${form.endDate}?`,
    )
  )
    return
  saving.value = true
  try {
    await api('/api/admin/finance/period-close', {
      method: 'POST',
      body: {
        startDate: form.startDate,
        endDate: form.endDate,
        notes: form.notes || null,
      },
    })
    toast.add({
      severity: 'success',
      summary: 'Closed',
      detail: 'Financial period closed and locked.',
      life: 3000,
    })
    form.notes = ''
    await refresh()
  } finally {
    saving.value = false
  }
}

const reopen = async (period: FinancialPeriodClose) => {
  const reason = window.prompt(
    `Reason for reopening ${period.startDate} to ${period.endDate}?`,
  )
  if (!reason) return
  await api(`/api/admin/finance/period-close/${period.id}/reopen`, {
    method: 'POST',
    body: { reason },
  })
  toast.add({
    severity: 'success',
    summary: 'Reopened',
    detail: 'Financial period reopened.',
    life: 3000,
  })
  await refresh()
}
</script>

<template>
  <div class="landing-page">
    <div class="surface-grid">
      <section class="surface-card">
        <p class="eyebrow">Closed periods</p>
        <h3>{{ summary.closed }}</h3>
        <p>Currently locked financial date ranges.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Reopened</p>
        <h3>{{ summary.reopened }}</h3>
        <p>Periods reopened for audited corrections.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Latest range</p>
        <h3>{{ summary.latestLabel }}</h3>
        <p>Most recent close or reopen record in history.</p>
      </section>
    </div>

    <section class="surface-card">
      <p class="eyebrow">Period close</p>
      <h1>Financial period close</h1>
      <p>
        Closing a period stores opening, income, expense, and closing totals and
        locks finance mutations in that date range.
      </p>

      <div class="admin-page-guide" style="margin-top: 1rem">
        <h2>How to use this form</h2>
        <p>
          Close a period only after journal review and reconciliation are
          complete for the date range.
        </p>
        <ol>
          <li>
            Select the start and end dates for the financial window to lock.
          </li>
          <li>
            Add notes that explain the review or committee approval reference.
          </li>
          <li>
            Use reopen only for audited corrections, because it allows finance
            changes in that range again.
          </li>
        </ol>
      </div>

      <form
        class="admin-form-layout"
        style="margin-top: 1.5rem"
        @submit.prevent="closePeriod"
      >
        <div class="admin-form-grid">
          <label>
            <span class="field-label">
              Start date
              <i
                class="pi pi-info-circle"
                title="First transaction date included in the financial close."
                aria-label="First transaction date included in the financial close."
              />
            </span>
            <InputText v-model="form.startDate" type="date" required />
          </label>
          <label>
            <span class="field-label">
              End date
              <i
                class="pi pi-info-circle"
                title="Last transaction date included in the financial close."
                aria-label="Last transaction date included in the financial close."
              />
            </span>
            <InputText v-model="form.endDate" type="date" required />
          </label>
          <label style="grid-column: 1 / -1">
            <span class="field-label">
              Notes
              <i
                class="pi pi-info-circle"
                title="Optional audit note, approval reference, or reason for closing this period."
                aria-label="Optional audit note, approval reference, or reason for closing this period."
              />
            </span>
            <Textarea v-model="form.notes" rows="3" auto-resize />
          </label>
        </div>
        <div
          class="admin-inline-actions"
          style="justify-content: flex-end; margin-top: 1.25rem"
        >
          <Button
            type="submit"
            label="Close period"
            icon="pi pi-lock"
            severity="danger"
            :loading="saving"
          />
        </div>
      </form>
    </section>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h2>Close history</h2>
          <p>
            Reopened periods are retained for audit and no longer block finance
            changes.
          </p>
        </div>
      </header>

      <DataTable
        :value="periods"
        :loading="pending"
        responsive-layout="scroll"
        class="list-page__table"
      >
        <Column field="startDate" header="Start" />
        <Column field="endDate" header="End" />
        <Column field="openingBalance" header="Opening">
          <template #body="{ data: row }">
            {{ formatMoney(row.openingBalance) }}
          </template>
        </Column>
        <Column field="incomeTotal" header="Income">
          <template #body="{ data: row }">
            {{ formatMoney(row.incomeTotal) }}
          </template>
        </Column>
        <Column field="expenseTotal" header="Expense">
          <template #body="{ data: row }">
            {{ formatMoney(row.expenseTotal) }}
          </template>
        </Column>
        <Column field="closingBalance" header="Closing">
          <template #body="{ data: row }">
            {{ formatMoney(row.closingBalance) }}
          </template>
        </Column>
        <Column field="isReopened" header="State">
          <template #body="{ data: row }">
            <Tag
              :value="row.isReopened ? 'Reopened' : 'Closed'"
              :severity="row.isReopened ? 'warn' : 'success'"
              rounded
            />
          </template>
        </Column>
        <Column field="closedByName" header="Closed by" />
        <Column header="Actions" style="width: 110px">
          <template #body="{ data: row }">
            <Button
              v-if="!row.isReopened"
              icon="pi pi-lock-open"
              severity="danger"
              text
              rounded
              aria-label="Reopen closed period"
              title="Reopen closed period"
              @click="reopen(row)"
            />
          </template>
        </Column>
      </DataTable>
    </section>
  </div>
</template>
