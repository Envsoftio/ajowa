<script setup lang="ts">
import type { ServiceCommentVisibility, ServiceRequestComment } from '~/types/domain'

defineProps<{
  comments: ServiceRequestComment[]
  allowInternal?: boolean
  saving?: boolean
}>()

const emit = defineEmits<{
  add: [payload: { visibility: ServiceCommentVisibility; commentBody: string }]
}>()

const commentBody = ref('')
const visibility = ref<ServiceCommentVisibility>('RESIDENT_VISIBLE')

const submit = () => {
  if (!commentBody.value.trim()) {
    return
  }

  emit('add', {
    visibility: visibility.value,
    commentBody: commentBody.value.trim(),
  })
  commentBody.value = ''
}
</script>

<template>
  <section class="ticket-comment-panel">
    <article v-for="comment in comments" :key="comment.id" class="ticket-comment-panel__item">
      <div>
        <strong>{{ comment.authorName || 'Team' }}</strong>
        <Tag :severity="comment.visibility === 'INTERNAL_NOTE' ? 'warn' : 'info'" :value="comment.visibility === 'INTERNAL_NOTE' ? 'Internal' : 'Resident visible'" rounded />
      </div>
      <p>{{ comment.commentBody }}</p>
    </article>
    <div class="ticket-comment-panel__form">
      <Select
        v-if="allowInternal"
        v-model="visibility"
        :options="[
          { label: 'Resident visible', value: 'RESIDENT_VISIBLE' },
          { label: 'Internal note', value: 'INTERNAL_NOTE' }
        ]"
        option-label="label"
        option-value="value"
      />
      <Textarea v-model="commentBody" rows="3" auto-resize placeholder="Add an update or work note" fluid />
      <Button label="Add note" icon="pi pi-comment" :loading="saving" @click="submit" />
    </div>
  </section>
</template>

<style scoped>
.ticket-comment-panel {
  display: grid;
  gap: 0.85rem;
}

.ticket-comment-panel__item {
  display: grid;
  gap: 0.35rem;
  padding: 0.85rem;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
}

.ticket-comment-panel__item > div {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.ticket-comment-panel__item p {
  margin: 0;
  color: var(--color-muted);
}

.ticket-comment-panel__form {
  display: grid;
  gap: 0.65rem;
}
</style>
