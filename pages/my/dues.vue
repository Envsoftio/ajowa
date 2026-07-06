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

const isCamDue = (due: MaintenanceDue) => due.billingPeriodChargeType === 'CAM'
const hasActionableBalance = (due: MaintenanceDue) => due.balanceAmount > 0 && !due.isCamAdvanceCovered
const camAdvanceAdjustmentAmount = (due: MaintenanceDue) =>
  due.chargeBreakdown.reduce((sum, item) => {
    const adjustment = Number(item.camAdvanceAdjustmentAmount ?? 0)
    return Number.isFinite(adjustment) && adjustment > 0
      ? sum + adjustment
      : sum
  }, 0)
const hasCamAdvanceAdjustment = (due: MaintenanceDue) =>
  camAdvanceAdjustmentAmount(due) > 0
const camAdvanceAdjustmentNote = (due: MaintenanceDue) =>
  due.chargeBreakdown.find((item) => item.camAdvanceNote)?.camAdvanceNote ?? null

const advanceStatusKind = (due: MaintenanceDue) => {
  if (due.isCamAdvanceCovered) return 'covered'
  if (hasCamAdvanceAdjustment(due)) return 'billable'
  if (isCamDue(due)) return 'billable'
  return 'not-cam'
}

const advanceStatusLabel = (due: MaintenanceDue) => {
  if (due.isCamAdvanceCovered) return 'Covered'
  if (hasCamAdvanceAdjustment(due)) return 'Advance deducted'
  if (isCamDue(due)) return 'Billable'
  return 'Not CAM'
}

const advanceStatusDetail = (due: MaintenanceDue) => {
  if (due.isCamAdvanceCovered) {
    return `Covered ${formatDate(due.camAdvanceCoveredFrom)} to ${formatDate(due.camAdvancePaidUntil)}. No payment is needed for this CAM period.`
  }
  if (hasCamAdvanceAdjustment(due)) {
    const note = camAdvanceAdjustmentNote(due)
    return `${formatMoney(camAdvanceAdjustmentAmount(due))} advance deducted${note ? ` (${note})` : ''}. Remaining due is payable.`
  }
  if (isCamDue(due)) return 'No advance coverage for this CAM period.'
  return 'Advance coverage applies only to CAM bills.'
}

const canPayDue = (due: MaintenanceDue) =>
  Boolean(due.canPayNow) && hasActionableBalance(due)

const getPayTitle = (due: MaintenanceDue) => {
  if (due.isCamAdvanceCovered) return 'No payment needed. CAM advance covers this period.'
  if (due.balanceAmount <= 0) return 'No balance pending.'
  if (!due.canPayNow) return 'Payment access is limited to the billing contact and society policy.'
  return 'Pay this due'
}

const summary = computed(() => {
  const billRows = dues.value.filter((due) => !due.isAdvanceCoverageRow)
  const totalDue = billRows.reduce((sum, due) => sum + due.totalAmount, 0)
  const totalPaid = billRows.reduce((sum, due) => sum + due.paidAmount, 0)
  const totalBalance = billRows
    .filter((due) => !due.isCamAdvanceCovered)
    .reduce((sum, due) => sum + due.balanceAmount, 0)
  const overdueCount = billRows.filter((due) => due.status === 'OVERDUE').length
  const advanceCoveredCount = dues.value.filter((due) => due.isCamAdvanceCovered).length

  return { totalDue, totalPaid, totalBalance, overdueCount, advanceCoveredCount }
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
      existing.totalBalance += due.isCamAdvanceCovered ? 0 : due.balanceAmount
      existing.openCount += hasActionableBalance(due) ? 1 : 0
      existing.rows.push(due)
    } else {
      groups.set(due.flatId, {
        flatId: due.flatId,
        label: `${due.blockName} ${due.flatNumber}`,
        relationshipType: due.relationshipType ?? 'RESIDENT',
        totalBalance: due.isCamAdvanceCovered ? 0 : due.balanceAmount,
        openCount: hasActionableBalance(due) ? 1 : 0,
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
        <p>
          {{ summary.overdueCount }} overdue bills across linked flats.
          {{ summary.advanceCoveredCount }} CAM advance-covered records are already covered.
        </p>
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

          <AppDataTable :value="group.rows" responsive-layout="scroll" class="list-page__table">
            <Column field="billingPeriodLabel" header="Period">
              <template #body="{ data: row }">
                <strong>{{ row.billingPeriodLabel }}</strong>
                <p class="table-muted">Due {{ formatDate(row.dueDate) }}</p>
              </template>
            </Column>
            <Column header="Advance">
              <template #body="{ data: row }">
                <div
                  class="billing-advance-state"
                  :class="`billing-advance-state--${advanceStatusKind(row)}`"
                >
                  <span class="billing-advance-pill">
                    {{ advanceStatusLabel(row) }}
                  </span>
                  <p>{{ advanceStatusDetail(row) }}</p>
                </div>
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
                <p v-if="hasCamAdvanceAdjustment(row)" class="table-muted">
                  {{ formatMoney(camAdvanceAdjustmentAmount(row)) }} advance deducted
                </p>
              </template>
            </Column>
            <Column field="status" header="Status">
              <template #body="{ data: row }">
                <span v-if="row.isCamAdvanceCovered" class="billing-advance-pill">
                  Covered
                </span>
                <AppStatusBadge v-else :status="row.status" />
              </template>
            </Column>
            <Column header="Actions" style="width: 150px">
              <template #body="{ data: row }">
                <div class="admin-inline-actions">
                  <AppDocumentLink
                    v-if="!row.isAdvanceCoverageRow"
                    :href="`/api/my/dues/${row.id}/bill`"
                    viewer-title="Bill PDF"
                    icon="pi pi-file-pdf"
                    severity="secondary"
                    text
                    rounded
                    aria-label="Open bill PDF"
                    title="Open bill PDF"
                  />
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
                    :title="getPayTitle(row)"
                    :disabled="!canPayDue(row)"
                  />
                </div>
              </template>
            </Column>
          </AppDataTable>

          <div class="list-page__cards resident-due-cards">
            <article v-for="row in group.rows" :key="row.id" class="list-card resident-due-card">
              <div class="list-card__header resident-due-card__header">
                <div>
                  <h3>{{ row.billingPeriodLabel }}</h3>
                  <p>Due {{ formatDate(row.dueDate) }}</p>
                </div>
                <span v-if="row.isCamAdvanceCovered" class="billing-advance-pill">
                  Covered
                </span>
                <AppStatusBadge v-else :status="row.status" />
              </div>

              <div
                class="billing-advance-state billing-advance-state--card"
                :class="`billing-advance-state--${advanceStatusKind(row)}`"
              >
                <span class="billing-advance-pill">
                  {{ advanceStatusLabel(row) }}
                </span>
                <p>{{ advanceStatusDetail(row) }}</p>
              </div>

              <div class="list-card__row">
                <span>Base</span>
                <strong>{{ formatMoney(row.baseAmount) }}</strong>
              </div>
              <div class="list-card__row">
                <span>Late fee</span>
                <strong>{{ formatMoney(row.lateFeeAmount) }}</strong>
              </div>
              <div class="list-card__row">
                <span>Paid</span>
                <strong>{{ formatMoney(row.paidAmount) }}</strong>
              </div>
              <div class="list-card__row">
                <span>Balance</span>
                <strong>
                  {{ formatMoney(row.balanceAmount) }}
                  <small v-if="hasCamAdvanceAdjustment(row)">
                    {{ formatMoney(camAdvanceAdjustmentAmount(row)) }} advance deducted
                  </small>
                </strong>
              </div>

              <div class="resident-mobile-actions">
                <AppDocumentLink
                  v-if="!row.isAdvanceCoverageRow"
                  :href="`/api/my/dues/${row.id}/bill`"
                  viewer-title="Bill PDF"
                  label="Bill"
                  icon="pi pi-file-pdf"
                  severity="secondary"
                  outlined
                  size="small"
                />
                <Button
                  label="Breakdown"
                  icon="pi pi-list"
                  severity="secondary"
                  outlined
                  size="small"
                  @click="openBreakdown(row)"
                />
                <Button
                  label="Pay"
                  icon="pi pi-credit-card"
                  severity="secondary"
                  outlined
                  size="small"
                  :title="getPayTitle(row)"
                  :disabled="!canPayDue(row)"
                />
              </div>
            </article>
          </div>
        </section>
      </div>
    </section>

    <Dialog
      v-model:visible="breakdownVisible"
      header="Charge breakdown"
      modal
      class="p-dialog-custom"
      :style="{ width: '520px' }"
    >
      <div v-if="selectedDue" class="admin-form-layout">
        <div>
          <h3>{{ selectedDue.billingPeriodLabel }}</h3>
          <p>{{ selectedDue.blockName }} {{ selectedDue.flatNumber }} · {{ formatDate(selectedDue.dueDate) }}</p>
        </div>
        <AppDataTable :value="selectedDue.chargeBreakdown" responsive-layout="scroll">
          <Column field="label" header="Charge" />
          <Column field="amount" header="Amount">
            <template #body="{ data: row }">
              {{ formatMoney(row.amount) }}
            </template>
          </Column>
        </AppDataTable>
        <div class="billing-total-line">
          <span>Balance</span>
          <strong>{{ formatMoney(selectedDue.balanceAmount) }}</strong>
        </div>
        <Message v-if="selectedDue.isCamAdvanceCovered" severity="success" :closable="false">
          CAM advance covers this period from {{ formatDate(selectedDue.camAdvanceCoveredFrom) }}
          through {{ formatDate(selectedDue.camAdvancePaidUntil) }}.
          No payment is needed for this CAM period.
        </Message>
        <Message v-else-if="hasCamAdvanceAdjustment(selectedDue)" severity="info" :closable="false">
          {{ formatMoney(camAdvanceAdjustmentAmount(selectedDue)) }} CAM advance was deducted.
          The remaining balance is {{ formatMoney(selectedDue.balanceAmount) }}.
        </Message>
        <Message v-else-if="!selectedDue.canPayNow" severity="info">
          Payment access is limited to the billing contact and configured resident relationship policy.
        </Message>
      </div>
    </Dialog>
  </div>
</template>
