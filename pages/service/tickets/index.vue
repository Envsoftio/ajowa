<script setup lang="ts">
import type { ServiceRequestQueueSummary, ServiceRequestStatus, ServiceRequestSummary } from '~/types/domain'

definePageMeta({
  layout: 'service-staff',
  middleware: ['protected'],
  title: 'Service Tickets',
})

const api = useApi()
const router = useRouter()
const toast = useToast()
const serviceRequests = useServiceRequests('service')
const filter = ref('active')
const savingId = ref<string | null>(null)

const query = computed(() => {
  const filters: Record<string, string> = {}
  if (filter.value === 'queue') {
    filters.unassigned = 'true'
  }
  if (filter.value === 'progress') {
    filters.status = 'IN_PROGRESS'
  }
  if (filter.value === 'overdue') {
    filters.overdue = 'true'
  }
  if (filter.value === 'resolved') {
    filters.status = 'RESOLVED'
  }
  if (filter.value === 'closed') {
    filters.closedOnly = 'true'
  }
  if (filter.value === 'active') {
    filters.activeOnly = 'true'
  }
  return {
    page: 1,
    pageSize: 50,
    sortBy: 'dueByAt',
    sortDirection: 'asc',
    ...filters,
  }
})

const { data, pending, refresh } = await useAsyncData('service-tickets', () =>
  api<{ ok: true; data: { items: ServiceRequestSummary[]; total: number; summary: ServiceRequestQueueSummary } }>('/api/service/tickets', {
    query: query.value,
  }),
  { watch: [query] },
)

const tickets = computed(() => data.value?.data.items ?? [])

const updateTicketStatus = async (ticket: ServiceRequestSummary, status: ServiceRequestStatus) => {
  savingId.value = ticket.id
  try {
    await serviceRequests.updateStatus(ticket.id, {
      status,
      comment: status === 'RESOLVED' ? 'Work completed.' : null,
    })
    toast.add({ severity: 'success', summary: 'Ticket updated', detail: ticket.requestNumber, life: 10000 })
    await refresh()
  } finally {
    savingId.value = null
  }
}
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Service tickets</h1>
          <p>Focused view of tickets assigned to you or visible in your department queue.</p>
        </div>
      </header>
      <div class="ticket-chip-row">
        <Button label="Active" size="small" :outlined="filter !== 'active'" @click="filter = 'active'" />
        <Button label="Department queue" size="small" :outlined="filter !== 'queue'" @click="filter = 'queue'" />
        <Button label="In progress" size="small" :outlined="filter !== 'progress'" @click="filter = 'progress'" />
        <Button label="Overdue" size="small" severity="danger" :outlined="filter !== 'overdue'" @click="filter = 'overdue'" />
        <Button label="Resolved today" size="small" severity="success" :outlined="filter !== 'resolved'" @click="filter = 'resolved'" />
        <Button
          label="Closed"
          size="small"
          :outlined="filter !== 'closed'"
          @click="filter = 'closed'"
        />
      </div>
      <ServiceStaffWorkList
        :tickets="tickets"
        :loading="pending"
        @open="router.push(`/service/tickets/${$event.id}`)"
        @acknowledge="updateTicketStatus($event, 'ACKNOWLEDGED')"
        @start="updateTicketStatus($event, 'IN_PROGRESS')"
        @resolve="updateTicketStatus($event, 'RESOLVED')"
      />
    </section>
  </div>
</template>

<style scoped>
.ticket-chip-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
</style>
