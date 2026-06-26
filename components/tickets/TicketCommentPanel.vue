<script setup lang="ts">
import type { ServiceCommentVisibility, ServiceRequestComment } from '~/types/domain'

const props = defineProps<{
  comments: ServiceRequestComment[]
  allowInternal?: boolean
  saving?: boolean
}>()

const emit = defineEmits<{
  add: [payload: { visibility: ServiceCommentVisibility; commentBody: string }]
}>()

const authStore = useAuthStore()
const commentBody = ref('')
const visibility = ref<ServiceCommentVisibility>('RESIDENT_VISIBLE')

const currentUserId = computed(() => authStore.me?.user.id ?? null)
const thread = computed(() =>
  props.comments.map((comment) => ({
    ...comment,
    isMine: Boolean(currentUserId.value && comment.authorUserId === currentUserId.value),
  })),
)

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

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
    <div class="ticket-comment-panel__thread">
      <article
        v-for="comment in thread"
        :key="comment.id"
        class="ticket-comment-panel__item"
        :class="{ 'ticket-comment-panel__item--mine': comment.isMine }"
      >
        <div
          class="ticket-comment-panel__bubble"
          :class="{
            'ticket-comment-panel__bubble--mine': comment.isMine,
            'ticket-comment-panel__bubble--internal': comment.visibility === 'INTERNAL_NOTE',
          }"
        >
          <div class="ticket-comment-panel__meta">
            <strong>{{ comment.authorName || 'Team' }}</strong>
            <Tag
              v-if="allowInternal || comment.visibility === 'INTERNAL_NOTE'"
              :severity="comment.visibility === 'INTERNAL_NOTE' ? 'warn' : 'info'"
              :value="comment.visibility === 'INTERNAL_NOTE' ? 'Internal' : 'Resident visible'"
              rounded
            />
          </div>
          <p>{{ comment.commentBody }}</p>
          <small>{{ formatDate(comment.createdAt) }}</small>
        </div>
      </article>
    </div>
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
      <Textarea v-model="commentBody" rows="2" auto-resize placeholder="Add an update or work note" fluid />
      <Button label="Add note" icon="pi pi-comment" :loading="saving" @click="submit" />
    </div>
  </section>
</template>

<style scoped>
.ticket-comment-panel {
  display: grid;
  gap: 0.65rem;
}

.ticket-comment-panel__thread {
  display: grid;
  gap: 0.6rem;
  max-height: 28rem;
  overflow-y: auto;
  padding-right: 0.2rem;
}

.ticket-comment-panel__item {
  display: flex;
  justify-content: flex-start;
}

.ticket-comment-panel__item--mine {
  justify-content: flex-end;
}

.ticket-comment-panel__bubble {
  display: grid;
  gap: 0.35rem;
  width: min(100%, 26rem);
  padding: 0.6rem 0.72rem;
  border: 1px solid color-mix(in srgb, var(--color-border) 85%, transparent);
  border-radius: 0.9rem 0.9rem 0.9rem 0.25rem;
  background: linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 88%, white), var(--color-bg));
  box-shadow: var(--shadow-sm);
}

.ticket-comment-panel__bubble--mine {
  border-radius: 0.9rem 0.9rem 0.25rem 0.9rem;
  border-color: color-mix(in srgb, var(--color-brand) 28%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--color-brand-soft) 78%, white), color-mix(in srgb, var(--color-brand-soft) 42%, var(--color-surface)));
}

.ticket-comment-panel__bubble--internal {
  border-color: color-mix(in srgb, var(--color-warning) 28%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--color-warning-soft) 88%, white), color-mix(in srgb, var(--color-warning-soft) 50%, var(--color-surface)));
}

.ticket-comment-panel__meta {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
  font-size: 0.8rem;
}

.ticket-comment-panel__bubble p {
  margin: 0;
  color: var(--color-text);
  line-height: 1.35;
  white-space: pre-wrap;
  font-size: 0.86rem;
}

.ticket-comment-panel__bubble small {
  color: var(--color-muted);
  font-size: 0.68rem;
}

.ticket-comment-panel__form {
  display: grid;
  gap: 0.5rem;
}
</style>
