<script setup lang="ts">
definePageMeta({
  layout: 'resident',
  middleware: ['protected'],
  title: 'Notifications',
})

type NotificationItem = {
  id: string
  title: string
  body: string
  deepLinkUrl: string | null
  priority: string
  isRead: boolean
  createdAt: string
  category: string | null
}

type NotificationResponse = {
  ok: true
  data: {
    items: NotificationItem[]
    total: number
    unreadCount: number
    page: number
    pageSize: number
  }
}

const api = useApi()
const toast = useToast()
const query = reactive({ status: '', priority: '', category: '' })

const { data, pending, refresh } = await useAsyncData('my-notifications', () =>
  api<NotificationResponse>('/api/my/notifications', {
    query: {
      page: 1,
      pageSize: 100,
      filters: {
        status: query.status || undefined,
        priority: query.priority || undefined,
        category: query.category || undefined,
      },
    },
  }),
  { watch: [query] },
)

const notifications = computed(() => data.value?.data.items ?? [])
const unreadCount = computed(() => data.value?.data.unreadCount ?? 0)

const markRead = async (item: NotificationItem) => {
  await api(`/api/my/notifications/${item.id}/read`, { method: 'POST' })
  if (item.deepLinkUrl) {
    await navigateTo(item.deepLinkUrl)
  }
  await refresh()
}

const markAllRead = async () => {
  const response = await api<{ ok: true; data: { updated: number } }>('/api/my/notifications/read-all', {
    method: 'POST',
  })
  toast.add({
    severity: 'success',
    summary: 'Notifications updated',
    detail: `${response.data.updated} unread notifications were marked as read.`,
    life: 3000,
  })
  await refresh()
}

const formatDate = (value: string) => new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Notifications</h1>
          <p>{{ unreadCount }} unread notifications.</p>
        </div>
        <div class="list-page__exports">
          <Button label="Mark all read" icon="pi pi-check" severity="secondary" outlined :disabled="unreadCount === 0" @click="markAllRead" />
          <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined @click="() => refresh()" />
        </div>
      </header>

      <div class="list-page__toolbar">
        <Select v-model="query.status" :options="[{ label: 'All', value: '' }, { label: 'Unread', value: 'unread' }]" option-label="label" option-value="value" />
        <Select v-model="query.priority" :options="[{ label: 'Any priority', value: '' }, { label: 'Low', value: 'LOW' }, { label: 'Normal', value: 'MEDIUM' }, { label: 'High', value: 'HIGH' }, { label: 'Critical', value: 'EMERGENCY' }]" option-label="label" option-value="value" />
      </div>

      <AppSkeletonState v-if="pending" />
      <AppState v-else-if="notifications.length === 0" variant="empty" title="No notifications" message="New updates will appear here." />

      <div v-else class="notification-list">
        <article v-for="item in notifications" :key="item.id" class="surface-card notification-row" :class="{ 'is-unread': !item.isRead }">
          <div>
            <div class="admin-inline-actions">
              <Tag :value="item.priority" :severity="item.priority === 'EMERGENCY' ? 'danger' : item.priority === 'HIGH' ? 'warn' : 'secondary'" />
              <Tag :value="item.isRead ? 'Read' : 'Unread'" :severity="item.isRead ? 'secondary' : 'success'" />
            </div>
            <h2>{{ item.title }}</h2>
            <p>{{ item.body }}</p>
            <small>{{ formatDate(item.createdAt) }}</small>
          </div>
          <Button :label="item.deepLinkUrl ? 'Open' : 'Mark read'" icon="pi pi-arrow-right" severity="secondary" outlined @click="markRead(item)" />
        </article>
      </div>
    </section>
  </div>
</template>
