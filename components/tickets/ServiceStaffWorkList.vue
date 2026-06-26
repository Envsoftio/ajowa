<script setup lang="ts">
import type { ServiceRequestSummary } from '~/types/domain'
import { closedTicketStatuses } from '~/shared/service-requests'

const isClosedTicket = (status: ServiceRequestSummary['status']) => closedTicketStatuses.includes(status)

defineProps<{
  tickets: ServiceRequestSummary[]
  loading?: boolean
}>()

const emit = defineEmits<{
  open: [ticket: ServiceRequestSummary]
  acknowledge: [ticket: ServiceRequestSummary]
  start: [ticket: ServiceRequestSummary]
  resolve: [ticket: ServiceRequestSummary]
}>()
</script>

<template>
  <section class="service-staff-work-list">
    <template v-if="loading">
      <AppSkeletonState v-for="item in 3" :key="item" />
    </template>
    <template v-else>
      <article
        v-for="ticket in tickets"
        :key="ticket.id"
        :class="[
          'service-staff-work-list__item',
          { 'service-staff-work-list__item--closed': isClosedTicket(ticket.status) },
        ]"
      >
        <TicketSummaryCard :ticket="ticket" compact />
        <Tag
          :severity="isClosedTicket(ticket.status) ? 'secondary' : 'info'"
          :value="isClosedTicket(ticket.status) ? 'Closed ticket' : 'Open ticket'"
          rounded
        />
        <div class="service-staff-work-list__actions">
          <Button label="Open" icon="pi pi-eye" severity="secondary" outlined @click="emit('open', ticket)" />
          <template v-if="!isClosedTicket(ticket.status)">
            <Button
              label="Acknowledge"
              icon="pi pi-check"
              severity="secondary"
              outlined
              @click="emit('acknowledge', ticket)"
            />
            <Button label="Start" icon="pi pi-play" @click="emit('start', ticket)" />
            <Button
              label="Resolve"
              icon="pi pi-verified"
              severity="success"
              outlined
              @click="emit('resolve', ticket)"
            />
          </template>
        </div>
      </article>
    </template>
    <AppState
      v-if="!loading && tickets.length === 0"
      variant="empty"
      title="No tickets"
      message="Assigned and department-queue work will appear here."
    />
  </section>
</template>

<style scoped>
.service-staff-work-list {
  display: grid;
  gap: 0.85rem;
}

.service-staff-work-list__item {
  display: grid;
  gap: 0.75rem;
  padding: 0.35rem;
  border-left: 0.35rem solid var(--color-info);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.service-staff-work-list__item--closed {
  border-left-color: var(--color-muted);
  opacity: 0.92;
}

.service-staff-work-list__actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
}

.service-staff-work-list__item--closed .service-staff-work-list__actions {
  grid-template-columns: 1fr;
}

@media (max-width: 700px) {
  .service-staff-work-list__actions {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
