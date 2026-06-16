<script setup lang="ts">
import type { ServiceRequestComment, ServiceRequestEvent } from '~/types/domain'
import { statusLabels } from '~/shared/service-requests'

const props = defineProps<{
  events: ServiceRequestEvent[]
  comments: ServiceRequestComment[]
}>()

const timelineItems = computed(() => [
  ...props.events.map((event) => ({
    id: `event-${event.id}`,
    at: event.occurredAt,
    title: event.eventType.replace('_', ' '),
    body: event.toStatus ? `Status: ${statusLabels[event.toStatus]}` : String(event.metadata?.message ?? ''),
    actor: event.actorName || 'System',
    type: 'event',
  })),
  ...props.comments.map((comment) => ({
    id: `comment-${comment.id}`,
    at: comment.createdAt,
    title: comment.visibility === 'INTERNAL_NOTE' ? 'Internal note' : 'Update',
    body: comment.commentBody,
    actor: comment.authorName || 'Team',
    type: 'comment',
  })),
].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()))

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
</script>

<template>
  <div class="ticket-timeline">
    <article v-for="item in timelineItems" :key="item.id" class="ticket-timeline__item">
      <span class="ticket-timeline__dot" />
      <div>
        <div class="ticket-timeline__head">
          <strong>{{ item.title }}</strong>
          <span>{{ formatDate(item.at) }}</span>
        </div>
        <p v-if="item.body">{{ item.body }}</p>
        <small>{{ item.actor }}</small>
      </div>
    </article>
    <AppState
      v-if="timelineItems.length === 0"
      variant="empty"
      title="No timeline yet"
      message="Ticket activity will appear here."
    />
  </div>
</template>

<style scoped>
.ticket-timeline {
  display: grid;
  gap: 0.85rem;
}

.ticket-timeline__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.75rem;
}

.ticket-timeline__dot {
  width: 0.7rem;
  height: 0.7rem;
  margin-top: 0.35rem;
  border-radius: 50%;
  background: var(--color-brand);
}

.ticket-timeline__head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.ticket-timeline p {
  margin: 0.3rem 0;
  color: var(--color-muted);
}

.ticket-timeline small,
.ticket-timeline__head span {
  color: var(--color-muted);
}
</style>
