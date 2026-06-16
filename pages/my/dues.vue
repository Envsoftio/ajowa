<script setup lang="ts">
import type { MaintenanceDue } from '~/types/domain'

definePageMeta({
  layout: 'resident',
  middleware: ['protected'],
  title: 'My Dues',
})

type DuesResponse = { ok: true; data: MaintenanceDue[] }

const api = useApi()
const authStore = useAuthStore()

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)

const formatDate = (value: string | null | undefined) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '-'

const { data, pending, refresh } = await useAsyncData('my-dues', () => api<DuesResponse>('/api/my/dues'))

const dues = computed(() => data.value?.data ?? [])

const summary = computed(() => {
  const totalDue = dues.value.reduce((sum, due) => sum + due.totalAmount, 0)
  const totalPaid = dues.value.reduce((sum, due) => sum + due.paidAmount, 0)
  const totalBalance = dues.value.reduce((sum, due) => sum + due.balanceAmount, 0)
  const overdueCount = dues.value.filter((due) => due.status === 'OVERDUE').length

  return { totalDue, totalPaid, totalBalance, overdueCount }
})

const flatGroups = computed(() => {
  const groups = new Map<
    string,
    {
      flatId: string
      label: string
      relationshipType: string
      totalBalance: number
      openCount: number
      rows: MaintenanceDue[]
    }
  >()

  for (const due of dues.value) {
    const existing = groups.get(due.flatId)
    if (existing) {
      existing.totalBalance += due.balanceAmount
      existing.openCount += due.balanceAmount > 0 ? 1 : 0
      existing.rows.push(due)
    } else {
      groups.set(due.flatId, {
        flatId: due.flatId,
        label: `${due.blockName} ${due.flatNumber}`,
        relationshipType: due.relationshipType ?? 'RESIDENT',
        totalBalance: due.balanceAmount,
        openCount: due.balanceAmount > 0 ? 1 : 0,
        rows: [due],
      })
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label))
})

const selectedDue = ref<MaintenanceDue | null>(null)
const breakdownVisible = ref(false)

const openBreakdown = (due: MaintenanceDue) => {
  selectedDue.value = due
  breakdownVisible.value = true
}
</script>

<template>
  <div class="landing-page">
    <div class="surface-grid">
      <section class="surface-card">
        <p class="eyebrow">Current balance</p>
        <h3>{{ formatMoney(summary.totalBalance) }}</h3>
        <p>{{ summary.overdueCount }} overdue due rows across linked flats.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Total due</p>
        <h3>{{ formatMoney(summary.totalDue) }}</h3>
        <p>{{ formatMoney(summary.totalPaid) }} has been collected against these dues.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Linked flats</p>
        <h3>{{ authStore.me?.flatAccess.length ?? 0 }}</h3>
        <p>{{ authStore.me?.flatAccess.map((item) => `${item.blockName} ${item.flatNumber}`).join(', ') || 'No active flats' }}</p>
      </section>
    </div>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>My dues</h1>
          <p>Maintenance dues are shown for flats connected to your active resident relationships.</p>
        </div>
        <div class="list-page__exports">
          <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined @click="() => refresh()" />
        </div>
      </header>

      <AppSkeletonState v-if="pending" />
      <AppState
        v-else-if="dues.length === 0"
        variant="empty"
        title="No dues found"
        message="There are no generated maintenance dues for your linked flats yet."
      />

      <div v-else class="resident-due-groups">
        <section v-for="group in flatGroups" :key="group.flatId" class="resident-due-group">
          <header class="resident-due-group__header">
            <div>
              <h2>{{ group.label }}</h2>
              <p>{{ group.relationshipType }} · {{ group.openCount }} open dues</p>
            </div>
            <strong>{{ formatMoney(group.totalBalance) }}</strong>
          </header>

          <DataTable :value="group.rows" responsive-layout="scroll" class="list-page__table">
            <Column field="billingPeriodLabel" header="Period">
              <template #body="{ data: row }">
                <strong>{{ row.billingPeriodLabel }}</strong>
                <p class="table-muted">Due {{ formatDate(row.dueDate) }}</p>
              </template>
            </Column>
            <Column field="baseAmount" header="Base">
              <template #body="{ data: row }">
                {{ formatMoney(row.baseAmount) }}
              </template>
            </Column>
            <Column field="lateFeeAmount" header="Late fee">
              <template #body="{ data: row }">
                {{ formatMoney(row.lateFeeAmount) }}
              </template>
            </Column>
            <Column field="paidAmount" header="Paid">
              <template #body="{ data: row }">
                {{ formatMoney(row.paidAmount) }}
              </template>
            </Column>
            <Column field="balanceAmount" header="Balance">
              <template #body="{ data: row }">
                <strong>{{ formatMoney(row.balanceAmount) }}</strong>
              </template>
            </Column>
            <Column field="status" header="Status">
              <template #body="{ data: row }">
                <AppStatusBadge :status="row.status" />
              </template>
            </Column>
            <Column header="Actions" style="width: 150px">
              <template #body="{ data: row }">
                <div class="admin-inline-actions">
                  <Button
                    icon="pi pi-list"
                    severity="secondary"
                    text
                    rounded
                    aria-label="View charge breakdown"
                    title="View charge breakdown"
                    @click="openBreakdown(row)"
                  />
                  <Button
                    label="Pay"
                    icon="pi pi-credit-card"
                    severity="secondary"
                    outlined
                    size="small"
                    :disabled="!row.canPayNow || row.balanceAmount <= 0"
                  />
                </div>
              </template>
            </Column>
          </DataTable>
        </section>
      </div>
    </section>

    <Dialog v-model:visible="breakdownVisible" header="Charge breakdown" modal :style="{ width: '520px' }">
      <div v-if="selectedDue" class="admin-form-layout">
        <div>
          <h3>{{ selectedDue.billingPeriodLabel }}</h3>
          <p>{{ selectedDue.blockName }} {{ selectedDue.flatNumber }} · {{ formatDate(selectedDue.dueDate) }}</p>
        </div>
        <DataTable :value="selectedDue.chargeBreakdown" responsive-layout="scroll">
          <Column field="label" header="Charge" />
          <Column field="amount" header="Amount">
            <template #body="{ data: row }">
              {{ formatMoney(row.amount) }}
            </template>
          </Column>
        </DataTable>
        <div class="billing-total-line">
          <span>Balance</span>
          <strong>{{ formatMoney(selectedDue.balanceAmount) }}</strong>
        </div>
        <Message v-if="!selectedDue.canPayNow" severity="info">
          Payment access is limited to the billing contact and configured resident relationship policy.
        </Message>
      </div>
    </Dialog>
  </div>
</template>
