<script setup lang="ts">
import type { ServiceRequestQueueSummary, ServiceRequestSummary, ServiceRequestStatus } from '~/types/domain'

definePageMeta({
  layout: 'service-staff',
  middleware: ['protected'],
  title: 'Service Dashboard',
})

const api = useApi()
const router = useRouter()
const toast = useToast()
const serviceRequests = useServiceRequests('service')
const savingId = ref<string | null>(null)

const { data: dashboardData, pending: dashboardPending, refresh: refreshDashboard } = await useAsyncData('service-dashboard', () =>
  api<{ ok: true; data: { summary: ServiceRequestQueueSummary } }>('/api/service/dashboard'),
)

const { data: ticketsData, pending: ticketsPending, refresh: refreshTickets } = await useAsyncData('service-dashboard-tickets', () =>
  api<{ ok: true; data: { items: ServiceRequestSummary[]; total: number } }>('/api/service/tickets', {
    query: {
      page: 1,
      pageSize: 8,
      activeOnly: 'true',
      sortBy: 'dueByAt',
      sortDirection: 'asc',
    },
  }),
)

const summary = computed(() => dashboardData.value?.data.summary)
const tickets = computed(() => ticketsData.value?.data.items ?? [])
const summaryCards = computed(() => [
  { title: 'Assigned today', value: summary.value?.assignedToday ?? 0 },
  { title: 'Department queue', value: summary.value?.departmentQueue ?? 0 },
  { title: 'In progress', value: summary.value?.inProgress ?? 0 },
  { title: 'Overdue', value: summary.value?.overdue ?? 0 },
  { title: 'Resolved today', value: summary.value?.resolvedToday ?? 0 },
])

const updateTicketStatus = async (ticket: ServiceRequestSummary, status: ServiceRequestStatus, comment?: string) => {
  savingId.value = ticket.id
  try {
    await serviceRequests.updateStatus(ticket.id, {
      status,
      comment: comment ?? (status === 'RESOLVED' ? 'Work completed.' : null),
    })
    toast.add({ severity: 'success', summary: 'Ticket updated', detail: ticket.requestNumber, life: 2500 })
    await Promise.all([refreshDashboard(), refreshTickets()])
  } finally {
    savingId.value = null
  }
}
</script>

<template>
  <div class="landing-page">
    <section class="hero-panel dashboard-hero">
      <div>
        <Tag severity="warning" value="Service Console" rounded />
        <h1>Today’s work queue</h1>
        <p>Assigned tickets, department queue work, and overdue jobs are prioritized for quick mobile action.</p>
      </div>
      <div class="hero-actions">
        <Button label="All tickets" icon="pi pi-list" as="a" href="/service/tickets" />
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined @click="() => { refreshDashboard(); refreshTickets(); }" />
      </div>
    </section>

    <section class="surface-grid dashboard-kpis service-summary-grid">
      <template v-if="dashboardPending">
        <AppSkeletonState v-for="item in 5" :key="item" />
      </template>
      <template v-else>
        <section v-for="card in summaryCards" :key="card.title" class="surface-card">
          <p class="eyebrow">{{ card.title }}</p>
          <h3>{{ card.value }}</h3>
        </section>
      </template>
    </section>

    <section class="surface-card">
      <div class="service-panel__header">
        <div>
          <p class="eyebrow">Action list</p>
          <h2>Assigned and queue tickets</h2>
        </div>
      </div>
      <ServiceStaffWorkList
        :tickets="tickets"
        :loading="ticketsPending"
        @open="router.push(`/service/tickets/${$event.id}`)"
        @acknowledge="updateTicketStatus($event, 'ACKNOWLEDGED')"
        @start="updateTicketStatus($event, 'IN_PROGRESS')"
        @resolve="updateTicketStatus($event, 'RESOLVED')"
      />
    </section>

    <section class="surface-card">
      <div class="service-panel__header">
        <div>
          <p class="eyebrow">Departments</p>
          <h2>Queue backlog</h2>
        </div>
      </div>
      <DepartmentQueueWidget :backlog="summary?.departmentBacklog ?? []" />
    </section>
  </div>
</template>

<style scoped>
.service-summary-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

@media (max-width: 900px) {
  .service-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
