<script setup lang="ts">
import type { FinanceAuditEvent } from '~/types/domain'

defineProps<{
  events: FinanceAuditEvent[]
}>()

const { formatDateTime } = useFinanceFormatters()
</script>

<template>
  <div class="finance-audit-timeline">
    <div v-if="events.length === 0" class="finance-audit-timeline__empty">
      No audit events found.
    </div>
    <article
      v-for="event in events"
      :key="event.id"
      class="finance-audit-timeline__item"
    >
      <span aria-hidden="true" />
      <div>
        <strong>{{ event.eventKey }}</strong>
        <p>{{ event.action }} by {{ event.actorName ?? 'System' }}</p>
        <small>{{ formatDateTime(event.occurredAt) }}</small>
      </div>
    </article>
  </div>
</template>
