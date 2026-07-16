<script setup lang="ts">
import type { BlockSummary, DefaulterSummary, FlatSummary, MaintenanceDue, ResidentSummary } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Admin Dashboard',
})

type Paginated<T> = {
  items: T[]
  total: number
  page?: number
  pageSize?: number
}

type DashboardStats = {
  blocks: number
  activeBlocks: number
  flats: number
  activeFlats: number
  vacantFlats: number
  tenantedFlats: number
  selfOccupiedFlats: number
  tenantRelationships: number
  ownerRelationships: number
  residents: number
  activeResidents: number
  outstandingDues: number
  overdueDues: number
  unpaidOwners: number
  unpaidFlats: number
  outstandingBalance: number
  riskPercent: number
}

type DashboardOverviewResponse = {
  stats: DashboardStats
  topDefaulters: DefaulterSummary[]
}

type DashboardResponse = {
  stats: DashboardStats
  blocks: Paginated<BlockSummary>
  flats: Paginated<FlatSummary>
  residents: Paginated<ResidentSummary>
  recentOutstanding: Paginated<MaintenanceDue>
  topDefaulters: DefaulterSummary[]
}

const api = useApi()
const authStore = useAuthStore()

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)

const formatNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value)

const formatDate = (value: string | null | undefined) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '-'

const formatContact = (value: string | null | undefined) => value || 'Not provided'

const urgencyBadge = (days: number) => {
  if (days >= 45) return 'danger'
  if (days >= 14) return 'warn'
  return 'info'
}

const overdueLabel = (days: number) =>
  days > 0 ? `${days} day${days === 1 ? '' : 's'} overdue` : 'Not overdue'

const statusBadge = (value: boolean) => (value ? 'success' : 'secondary')

const loadDashboard = async () => {
  const [overview, blocks, flats, residents, recentOutstanding] = await Promise.all([
    api<{ ok: true; data: DashboardOverviewResponse }>('/api/admin/dashboard'),
    api<{ ok: true; data: Paginated<BlockSummary> }>('/api/admin/blocks', {
      query: { page: 1, pageSize: 1000, sortBy: 'name', sortDirection: 'asc' },
    }),
    api<{ ok: true; data: Paginated<FlatSummary> }>('/api/admin/flats', {
      query: { page: 1, pageSize: 1000, sortBy: 'flatNumber', sortDirection: 'asc' },
    }),
    api<{ ok: true; data: Paginated<ResidentSummary> }>('/api/admin/residents', {
      query: { page: 1, pageSize: 1000, sortBy: 'fullName', sortDirection: 'asc' },
    }),
    api<{ ok: true; data: Paginated<MaintenanceDue> }>('/api/admin/billing/dues', {
      query: { page: 1, pageSize: 8, balance: 'outstanding', sortBy: 'dueDate', sortDirection: 'desc' },
    }),
  ])

  return {
    stats: overview.data.stats,
    blocks: blocks.data,
    flats: flats.data,
    residents: residents.data,
    recentOutstanding: recentOutstanding.data,
    topDefaulters: overview.data.topDefaulters,
  } as DashboardResponse
}

const { data: dashboardData, pending, refresh } = await useAsyncData('admin-dashboard', loadDashboard)

const dashboard = computed(() => dashboardData.value)

const emptyStats: DashboardStats = {
  blocks: 0,
  activeBlocks: 0,
  flats: 0,
  activeFlats: 0,
  vacantFlats: 0,
  tenantedFlats: 0,
  selfOccupiedFlats: 0,
  tenantRelationships: 0,
  ownerRelationships: 0,
  residents: 0,
  activeResidents: 0,
  outstandingDues: 0,
  overdueDues: 0,
  unpaidOwners: 0,
  unpaidFlats: 0,
  outstandingBalance: 0,
  riskPercent: 0,
}

const summary = computed(() => {
  const model = dashboard.value

  return model?.stats ?? emptyStats
})

const kpiCards = computed(() => [
  {
    title: 'Towers',
    value: formatNumber(summary.value.blocks),
    note: `${formatNumber(summary.value.activeBlocks)} active towers`,
  },
  {
    title: 'Flats',
    value: formatNumber(summary.value.flats),
    note: `${formatNumber(summary.value.activeFlats)} active flats`,
  },
  {
    title: 'Vacant flats',
    value: formatNumber(summary.value.vacantFlats),
    note: `Of ${formatNumber(summary.value.activeFlats)} active flats`,
  },
  {
    title: 'Tenanted flats',
    value: formatNumber(summary.value.tenantedFlats),
    note: `${formatNumber(summary.value.tenantRelationships)} active tenant records`,
  },
  {
    title: 'Self occupied',
    value: formatNumber(summary.value.selfOccupiedFlats),
    note: `${formatNumber(summary.value.ownerRelationships)} active owner records`,
  },
  {
    title: 'Residents',
    value: formatNumber(summary.value.residents),
    note: `${formatNumber(summary.value.activeResidents)} active residents`,
  },
  {
    title: 'Outstanding dues',
    value: formatNumber(summary.value.outstandingDues),
    note: `${summary.value.riskPercent}% are overdue`,
  },
  {
    title: 'Overdue dues',
    value: formatNumber(summary.value.overdueDues),
    note: `${summary.value.overdueDues > 0 ? 'Needs immediate follow-up' : 'No overdue rows'}`,
  },
  {
    title: 'Unpaid owners',
    value: formatNumber(summary.value.unpaidOwners),
    note: `${formatNumber(summary.value.unpaidFlats)} flats · ${formatMoney(summary.value.outstandingBalance)}`,
    isAmount: true,
  },
])

const topDefaulters = computed(() => dashboard.value?.topDefaulters ?? [])

const recentOutstanding = computed(() => (dashboard.value?.recentOutstanding?.items ?? []).slice(0, 5))
const recentFlats = computed(() => (dashboard.value?.flats?.items ?? []).slice(0, 5))
const recentResidents = computed(() => (dashboard.value?.residents?.items ?? []).slice(0, 5))
const recentBlocks = computed(() => (dashboard.value?.blocks?.items ?? []).slice(0, 5))

const hasWelcomeName = computed(() => authStore.me?.user?.fullName || authStore.me?.authUser?.name || 'Manager')
</script>

<template>
  <div class="landing-page">
    <section class="hero-panel dashboard-hero">
      <div class="dashboard-hero__head">
        <Tag severity="contrast" value="Admin Command Center" rounded />
        <h1>Operations dashboard</h1>
        <p>Welcome back, {{ hasWelcomeName }}. Monitor dues health, resident progress, and service readiness from one place.</p>
      </div>
      <div class="hero-actions">
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined :loading="pending" @click="refresh()" />
        <Button label="Manage dues" icon="pi pi-wallet" as="a" href="/admin/billing/dues" />
        <Button label="Record payment" icon="pi pi-credit-card" as="a" href="/admin/payments/new" severity="secondary" outlined />
        <Button label="View unpaid owners" icon="pi pi-exclamation-triangle" severity="secondary" as="a" href="/admin/billing/defaulters" outlined />
      </div>
    </section>

    <div class="surface-grid dashboard-kpis">
      <template v-if="pending">
        <section v-for="item in 9" :key="`kpi-skeleton-${item}`" class="surface-card">
          <AppSkeletonState :lines="2" />
        </section>
      </template>
      <template v-else>
        <section v-for="card in kpiCards" :key="card.title" class="surface-card">
          <p class="eyebrow">{{ card.title }}</p>
          <h3>{{ card.value }}</h3>
          <p>{{ card.note }}</p>
        </section>
      </template>
    </div>

    <section class="admin-two-column--wide">
      <section class="surface-card">
        <div class="dashboard-panel__header">
          <div>
            <p class="eyebrow">Priority queue</p>
            <h2>Top unpaid owners</h2>
            <p>Flat owners with highest current unpaid exposure.</p>
          </div>
          <Button label="Open list" as="a" href="/admin/billing/defaulters" severity="secondary" outlined size="small" />
        </div>

        <AppState
          v-if="!pending && topDefaulters.length === 0"
          variant="empty"
          title="No unpaid owners currently"
          message="Outstanding dues are clean for now. Keep monitoring once new periods are generated."
        />

        <div v-else-if="pending" class="dashboard-priority">
          <AppSkeletonState v-for="item in 5" :key="`top-skeleton-${item}`" />
        </div>
        <article v-else class="dashboard-priority">
          <section v-for="person in topDefaulters" :key="person.userId" class="dashboard-priority-item">
            <div class="dashboard-priority-item__copy">
              <h3>
                <NuxtLink :to="`/admin/residents/${person.userId}`" class="table-link-button">
                  {{ person.residentName }}
                </NuxtLink>
              </h3>
              <p>{{ formatContact(person.residentEmail) }} · {{ person.residentMobileNumber || 'No phone' }}</p>
              <div class="dashboard-priority-item__meta">
                <Tag severity="info" :value="`${person.flatCount} flat${person.flatCount === 1 ? '' : 's'}`" rounded />
                <Tag :severity="urgencyBadge(person.maxDaysOverdue)" :value="overdueLabel(person.maxDaysOverdue)" rounded />
                <AppStatusBadge :status="person.totalBalance > 0 ? 'open' : 'paid'" />
              </div>
            </div>
            <strong>{{ formatMoney(person.totalBalance) }}</strong>
          </section>
        </article>
      </section>

      <section class="surface-card">
        <div class="dashboard-panel__header">
          <div>
            <p class="eyebrow">Quick actions</p>
            <h2>Admin shortcuts</h2>
            <p>Jump straight to the workflows you use every day.</p>
          </div>
        </div>

        <div class="dashboard-action-grid">
          <Button label="Residents" icon="pi pi-users" as="a" href="/admin/residents" outlined />
          <Button label="Flats" icon="pi pi-home" as="a" href="/admin/flats" outlined />
          <Button label="Towers" icon="pi pi-th-large" as="a" href="/admin/blocks" outlined />
          <Button label="Staff" icon="pi pi-id-card" as="a" href="/admin/staff" outlined />
          <Button label="Generate dues" icon="pi pi-calendar" as="a" href="/admin/billing/periods" outlined />
          <Button label="Record payment" icon="pi pi-credit-card" as="a" href="/admin/payments/new" severity="secondary" outlined />
          <Button label="Add expense" icon="pi pi-minus-circle" as="a" href="/admin/finance/transactions/new?type=expense" severity="secondary" outlined />
          <Button label="Send notice" icon="pi pi-send" as="a" href="/admin/notices" severity="secondary" outlined />
        </div>
      </section>
    </section>

    <section class="surface-grid">
      <section class="surface-card">
        <div class="dashboard-panel__header">
          <div>
            <p class="eyebrow">Outstanding dues</p>
            <h2>Latest rows</h2>
          </div>
          <Button label="All dues" as="a" href="/admin/billing/dues" severity="secondary" outlined size="small" />
        </div>

        <div v-if="pending" class="dashboard-mini-list">
          <AppSkeletonState v-for="item in 5" :key="`due-skeleton-${item}`" />
        </div>
        <div v-else class="dashboard-mini-list">
          <article v-for="due in recentOutstanding" :key="due.id" class="dashboard-mini-list-item">
            <div class="dashboard-mini-list-item__copy">
              <h3>{{ due.blockName }} {{ due.flatNumber }}</h3>
              <p>{{ due.billingPeriodLabel }} · {{ due.primaryResidentName || 'No billing contact' }}</p>
              <p>Due {{ formatDate(due.dueDate) }}</p>
            </div>
            <div class="dashboard-mini-list-item__right">
              <AppStatusBadge :status="due.status" />
              <strong>{{ formatMoney(due.balanceAmount) }}</strong>
            </div>
          </article>
        </div>
      </section>

      <section class="surface-card">
        <div class="dashboard-panel__header">
          <div>
            <p class="eyebrow">Latest towers</p>
            <h2>Inventory sample</h2>
          </div>
        </div>
        <div class="dashboard-mini-list">
          <article v-for="block in recentBlocks" :key="block.id" class="dashboard-mini-list-item">
            <div class="dashboard-mini-list-item__copy">
              <h3>{{ block.code }} {{ block.name }}</h3>
              <p>Flat count: {{ formatNumber(block.flatCount ?? 0) }}</p>
            </div>
            <Tag :severity="statusBadge(block.isActive)" :value="block.isActive ? 'Active' : 'Inactive'" />
          </article>
          <AppState
            v-if="recentBlocks.length === 0 && !pending"
            variant="empty"
            title="No towers available"
            message="Configure towers from your society setup to start management."
          />
        </div>
      </section>

      <section class="surface-card">
        <div class="dashboard-panel__header">
          <div>
            <p class="eyebrow">Latest residents</p>
            <h2>People snapshot</h2>
          </div>
          <Button label="Open residents" as="a" href="/admin/residents" severity="secondary" outlined size="small" />
        </div>
        <div class="dashboard-mini-list">
          <NuxtLink
            v-for="resident in recentResidents"
            :key="resident.id"
            :to="`/admin/residents/${resident.id}`"
            class="dashboard-mini-list-item dashboard-mini-list-item--link"
            :aria-label="`View ${resident.fullName}`"
          >
            <div class="dashboard-mini-list-item__copy">
              <h3>{{ resident.fullName }}</h3>
              <p>{{ formatContact(resident.email) }} · {{ resident.role }}</p>
              <p>{{ formatContact(resident.mobileNumber) }}</p>
            </div>
            <Tag :severity="statusBadge(resident.isActive)" :value="resident.isActive ? 'Active' : 'Disabled'" />
          </NuxtLink>
          <AppState
            v-if="recentResidents.length === 0 && !pending"
            variant="empty"
            title="No residents"
            message="Resident records will appear once users join the platform."
          />
        </div>
      </section>
    </section>

    <section class="surface-card dashboard-flats-panel">
      <div class="dashboard-panel__header">
        <div>
          <p class="eyebrow">Active flats</p>
          <h2>Latest flat-level snapshot</h2>
        </div>
        <Button label="Open all flats" as="a" href="/admin/flats" severity="secondary" outlined size="small" />
      </div>

      <div class="dashboard-mini-list dashboard-flat-grid">
        <article v-for="flat in recentFlats" :key="flat.id" class="dashboard-mini-list-item">
          <div class="dashboard-mini-list-item__copy">
            <h3>{{ flat.blockName }} {{ flat.flatNumber }}</h3>
            <p>{{ flat.unitType }} · {{ flat.occupancyStatus }}</p>
            <p>{{ flat.areaSqFt ? `${flat.areaSqFt} sq ft` : 'Area not set' }}</p>
          </div>
          <Tag :severity="statusBadge(flat.isActive)" :value="flat.isActive ? 'Active' : 'Inactive'" />
        </article>
        <AppState
          v-if="recentFlats.length === 0 && !pending"
          variant="empty"
          title="No flats available"
          message="Configure flats before assigning residents."
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard-hero {
  padding: 1rem 1.1rem;
}

.dashboard-hero__head h1 {
  margin: 0.5rem 0 0.6rem;
  font-family: var(--font-display);
}

.dashboard-kpis .surface-card {
  min-height: 6rem;
}

.dashboard-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  flex-wrap: wrap;
}

.dashboard-priority {
  display: grid;
  gap: 0.75rem;
  margin-top: 1rem;
}

.dashboard-priority-item {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.9rem 1rem;
  background: var(--color-surface-strong);
  box-shadow: var(--shadow-sm);
}

.dashboard-priority-item h3 {
  margin: 0;
}

.dashboard-priority-item p,
.dashboard-mini-list-item p {
  margin: 0.2rem 0 0;
  color: var(--color-muted);
}

.dashboard-priority-item__copy,
.dashboard-mini-list-item__copy {
  min-width: 0;
}

.dashboard-priority-item strong {
  color: var(--color-brand-strong);
}

:global(.app-theme-dark) .dashboard-priority-item strong {
  color: #f8fafc;
}

.dashboard-priority-item__meta,
.dashboard-action-grid,
.dashboard-mini-list {
  display: grid;
  gap: 0.55rem;
}

.dashboard-priority-item__meta {
  grid-template-columns: auto auto auto;
  margin-top: 0.65rem;
}

.dashboard-action-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 1rem;
}

.dashboard-mini-list {
  margin-top: 1rem;
}

.dashboard-mini-list-item {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.85rem 1rem;
  background: var(--color-surface-strong);
}

.dashboard-mini-list-item--link {
  color: inherit;
  text-decoration: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.dashboard-mini-list-item--link:hover,
.dashboard-mini-list-item--link:focus-visible {
  border-color: color-mix(in srgb, var(--color-brand) 45%, var(--color-border));
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.dashboard-mini-list-item h3 {
  margin: 0;
}

.dashboard-mini-list-item__right {
  text-align: right;
  min-width: 9rem;
  display: grid;
  justify-items: end;
  gap: 0.45rem;
}

.dashboard-flat-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.dashboard-flats-panel {
  border-top: 1px solid var(--color-border);
}

@media (max-width: 768px) {
  .dashboard-hero {
    padding: 0.9rem;
  }

  .dashboard-action-grid,
  .dashboard-priority-item,
  .dashboard-priority-item__meta,
  .dashboard-mini-list-item,
  .dashboard-mini-list-item__right,
  .dashboard-flat-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-priority-item,
  .dashboard-mini-list-item {
    align-items: stretch;
    gap: 0.75rem;
  }

  .dashboard-mini-list-item__right {
    justify-items: start;
    text-align: left;
    min-width: 0;
  }
}
</style>
