<script setup lang="ts">
import type { ServiceRequestAttachment } from '~/types/domain'

defineProps<{
  attachments: ServiceRequestAttachment[]
}>()
</script>

<template>
  <section class="ticket-attachment-gallery">
    <article v-for="attachment in attachments" :key="attachment.id" class="ticket-attachment-gallery__item">
      <i class="pi pi-paperclip" />
      <div>
        <strong>{{ attachment.fileName }}</strong>
        <p>{{ attachment.mimeType }} · {{ Math.ceil(attachment.sizeBytes / 1024) }} KB</p>
      </div>
    </article>
    <AppState
      v-if="attachments.length === 0"
      variant="empty"
      title="No attachments"
      message="Evidence and completion proof metadata will appear here."
    />
  </section>
</template>

<style scoped>
.ticket-attachment-gallery {
  display: grid;
  gap: 0.75rem;
}

.ticket-attachment-gallery__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.75rem;
  align-items: center;
  padding: 0.85rem;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
}

.ticket-attachment-gallery__item p {
  margin: 0.15rem 0 0;
  color: var(--color-muted);
}
</style>
