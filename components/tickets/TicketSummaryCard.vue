<script setup lang="ts">
import { computed } from 'vue'
import type { ServiceRequestSummary } from '~/types/domain'
import { closedTicketStatuses } from '~/shared/service-requests'

const props = defineProps<{
  ticket: ServiceRequestSummary
  compact?: boolean
}>()

const locationLabel = (ticket: ServiceRequestSummary) =>
  ticket.locationType === 'FLAT'
    ? (ticket.flatLabel ?? 'Flat')
    : ticket.assetReference ||
      ticket.areaName ||
      ticket.locationType.replace('_', ' ')

const isClosedTicket = computed(() =>
  closedTicketStatuses.includes(props.ticket.status),
)
</script>

<template>
  <article
    class="ticket-summary-card"
    :class="{
      'ticket-summary-card--compact': compact,
      'ticket-summary-card--closed': isClosedTicket,
      'ticket-summary-card--open': !isClosedTicket,
    }"
  >
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
        <dd>
          <SlaBadge
            :due-by-at="ticket.dueByAt"
            :is-overdue="ticket.isOverdue"
          />
        </dd>
      </div>
    </dl>
  </article>
</template>

<style scoped>
.ticket-summary-card {
  display: grid;
  min-width: 0;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.ticket-summary-card--open {
  border-left: 0.4rem solid var(--color-info);
}

.ticket-summary-card--closed {
  border-left: 0.4rem solid var(--color-muted);
  opacity: 0.92;
}

.ticket-summary-card__main,
.ticket-summary-card__tags {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
}

.ticket-summary-card__main > div:first-child,
.ticket-summary-card dl > div {
  min-width: 0;
}

.ticket-summary-card h3,
.ticket-summary-card p {
  margin: 0;
  overflow-wrap: anywhere;
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
  overflow-wrap: anywhere;
}

.ticket-summary-card--compact {
  gap: 0.7rem;
}

.ticket-summary-card--compact > p {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.ticket-summary-card--compact dl {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 700px) {
  .ticket-summary-card {
    gap: 0.7rem;
    padding: 0.85rem;
    border-radius: var(--radius-md);
  }

  .ticket-summary-card__main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.6rem;
  }

  .ticket-summary-card__main h3 {
    margin-top: 0.15rem;
    font-size: 1rem;
    line-height: 1.3;
  }

  .ticket-summary-card__tags {
    justify-content: flex-end;
    gap: 0.35rem;
  }

  .ticket-summary-card__tags :deep(.p-tag) {
    padding: 0.25rem 0.5rem;
    font-size: 0.7rem;
  }

  .ticket-summary-card > p {
    font-size: 0.86rem;
    line-height: 1.45;
  }

  .ticket-summary-card dl {
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
    padding-top: 0.65rem;
    border-top: 1px solid
      color-mix(in srgb, var(--color-border) 75%, transparent);
  }

  .ticket-summary-card dt {
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .ticket-summary-card dd {
    font-size: 0.82rem;
    line-height: 1.3;
  }
}

@media (max-width: 430px) {
  .ticket-summary-card__main {
    grid-template-columns: 1fr;
  }

  .ticket-summary-card__tags {
    justify-content: flex-start;
  }
}
</style>
