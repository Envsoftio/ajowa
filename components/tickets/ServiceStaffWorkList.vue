<script setup lang="ts">
import type { ServiceRequestSummary } from '~/types/domain'

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
      <article v-for="ticket in tickets" :key="ticket.id" class="service-staff-work-list__item">
        <TicketSummaryCard :ticket="ticket" compact />
        <div class="service-staff-work-list__actions">
          <Button label="Open" icon="pi pi-eye" severity="secondary" outlined @click="emit('open', ticket)" />
          <Button label="Acknowledge" icon="pi pi-check" severity="secondary" outlined @click="emit('acknowledge', ticket)" />
          <Button label="Start" icon="pi pi-play" @click="emit('start', ticket)" />
          <Button label="Resolve" icon="pi pi-verified" severity="success" outlined @click="emit('resolve', ticket)" />
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
}

.service-staff-work-list__actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
}

@media (max-width: 700px) {
  .service-staff-work-list__actions {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
