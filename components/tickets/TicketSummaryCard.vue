<script setup lang="ts">
import type { ServiceRequestSummary } from '~/types/domain'

defineProps<{
  ticket: ServiceRequestSummary
  compact?: boolean
}>()

const locationLabel = (ticket: ServiceRequestSummary) =>
  ticket.locationType === 'FLAT'
    ? ticket.flatLabel ?? 'Flat'
    : ticket.assetReference || ticket.areaName || ticket.locationType.replace('_', ' ')
</script>

<template>
  <article class="ticket-summary-card" :class="{ 'ticket-summary-card--compact': compact }">
    <div class="ticket-summary-card__main">
      <div>
        <p class="eyebrow">{{ ticket.requestNumber }}</p>
        <h3>{{ ticket.title }}</h3>
      </div>
      <div class="ticket-summary-card__tags">
        <PriorityTag :priority="ticket.priority" />
        <TicketStatusTag :status="ticket.status" />
      </div>
    </div>
    <p>{{ ticket.description }}</p>
    <dl>
      <div>
        <dt>Location</dt>
        <dd>{{ locationLabel(ticket) }}</dd>
      </div>
      <div>
        <dt>Department</dt>
        <dd>{{ ticket.departmentName || 'Unassigned' }}</dd>
      </div>
      <div>
        <dt>Assignee</dt>
        <dd>{{ ticket.assigneeName || 'Queue' }}</dd>
      </div>
      <div>
        <dt>SLA</dt>
        <dd><SlaBadge :due-by-at="ticket.dueByAt" :is-overdue="ticket.isOverdue" /></dd>
      </div>
    </dl>
  </article>
</template>

<style scoped>
.ticket-summary-card {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.ticket-summary-card__main,
.ticket-summary-card__tags {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
}

.ticket-summary-card h3,
.ticket-summary-card p {
  margin: 0;
}

.ticket-summary-card p {
  color: var(--color-muted);
}

.ticket-summary-card dl {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 0;
}

.ticket-summary-card dt {
  color: var(--color-muted);
  font-size: 0.78rem;
}

.ticket-summary-card dd {
  margin: 0.15rem 0 0;
  font-weight: 700;
}

.ticket-summary-card--compact dl {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 700px) {
  .ticket-summary-card dl {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
