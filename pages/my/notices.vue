<script setup lang="ts">
definePageMeta({
  layout: 'resident',
  middleware: ['protected'],
  title: 'Notices',
})

type Notice = {
  id: string
  title: string
  summary: string | null
  body: string
  priority: string
  isPinned: boolean
  publishedAt: string | null
  expiresAt: string | null
  attachmentFileId: string | null
  attachmentLabel: string | null
  attachmentUrl: string | null
  isRead: boolean
}

const api = useApi()
const route = useRoute()
const { data, pending, refresh } = await useAsyncData('my-notices', () => api<{ ok: true; data: { items: Notice[] } }>('/api/my/notices'))
const notices = computed(() => data.value?.data.items ?? [])
const selectedNotice = ref<Notice | null>(null)

watch(
  notices,
  (items) => {
    const id = typeof route.query.notice === 'string' ? route.query.notice : null
    selectedNotice.value = items.find((notice) => notice.id === id) ?? items[0] ?? null
  },
  { immediate: true },
)

const readNotice = async (notice: Notice) => {
  selectedNotice.value = notice
  if (!notice.isRead) {
    await api(`/api/my/notices/${notice.id}/read`, { method: 'POST' })
    await refresh()
  }
}
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Notices</h1>
          <p>Published society notices and pinned updates.</p>
        </div>
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined @click="() => refresh()" />
      </header>

      <AppSkeletonState v-if="pending" />
      <AppState v-else-if="notices.length === 0" variant="empty" title="No notices" message="Published notices will appear here." />

      <div v-else class="notice-layout">
        <nav class="notice-list">
          <button v-for="notice in notices" :key="notice.id" type="button" class="notice-list__item" :class="{ 'is-active': selectedNotice?.id === notice.id }" @click="readNotice(notice)">
            <span>
              <strong>{{ notice.title }}</strong>
              <small>{{ notice.summary || notice.body.slice(0, 110) }}</small>
            </span>
            <Tag v-if="notice.isPinned" value="Pinned" severity="warn" />
          </button>
        </nav>
        <article v-if="selectedNotice" class="notice-detail">
          <div class="admin-inline-actions">
            <Tag :value="selectedNotice.priority" :severity="selectedNotice.priority === 'EMERGENCY' ? 'danger' : selectedNotice.priority === 'HIGH' ? 'warn' : 'secondary'" />
            <Tag :value="selectedNotice.isRead ? 'Read' : 'Unread'" :severity="selectedNotice.isRead ? 'secondary' : 'success'" />
          </div>
          <h2>{{ selectedNotice.title }}</h2>
          <p v-if="selectedNotice.summary" class="table-muted">{{ selectedNotice.summary }}</p>
          <p class="notice-body">{{ selectedNotice.body }}</p>
          <Button
            v-if="selectedNotice.attachmentUrl"
            as="a"
            :href="selectedNotice.attachmentUrl"
            target="_blank"
            icon="pi pi-paperclip"
            :label="selectedNotice.attachmentLabel || 'Open attachment'"
            severity="secondary"
            outlined
          />
        </article>
      </div>
    </section>
  </div>
</template>
