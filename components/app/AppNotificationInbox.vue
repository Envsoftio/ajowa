<script setup lang="ts">
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

withDefaults(
  defineProps<{
    title?: string
    description?: string
  }>(),
  {
    title: 'Notifications',
    description: 'New updates will appear here.',
  },
)

const api = useApi()
const toast = useToast()
const route = useRoute()
const notificationsStore = useNotificationsStore()
const allStatus = 'ALL'
const anyPriority = 'ANY'
const query = reactive({ status: allStatus, priority: anyPriority, category: '' })

const { data, pending, refresh } = await useAsyncData(
  `notification-inbox-${route.path}`,
  () =>
    api<NotificationResponse>('/api/my/notifications', {
      query: {
        page: 1,
        pageSize: 100,
        status: query.status === allStatus ? undefined : query.status,
        priority: query.priority === anyPriority ? undefined : query.priority,
        category: query.category || undefined,
      },
    }),
  { watch: [() => query.status, () => query.priority, () => query.category] },
)

const notifications = computed(() => data.value?.data.items ?? [])
const unreadCount = computed(() => data.value?.data.unreadCount ?? 0)
const priorityLabel = (priority: string) => {
  if (priority === 'MEDIUM') return 'Normal'
  if (priority === 'EMERGENCY') return 'Critical'
  return priority.charAt(0) + priority.slice(1).toLowerCase()
}

const refreshInbox = async () => {
  await Promise.all([refresh(), notificationsStore.refresh()])
}

const markRead = async (item: NotificationItem) => {
  await api(`/api/my/notifications/${item.id}/read`, { method: 'POST' })
  await refreshInbox()
  if (item.deepLinkUrl) {
    await navigateTo(item.deepLinkUrl)
  }
}

const markAllRead = async () => {
  const response = await api<{ ok: true; data: { updated: number } }>(
    '/api/my/notifications/read-all',
    {
      method: 'POST',
    },
  )
  toast.add({
    severity: 'success',
    summary: 'Notifications updated',
    detail: `${response.data.updated} unread notifications were marked as read.`,
    life: 10000,
  })
  await refreshInbox()
}

const formatDate = (value: string) =>
  new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
</script>

<template>
  <section class="list-page surface-card">
    <header class="list-page__header">
      <div>
        <h1>{{ title }}</h1>
        <p>{{ unreadCount }} unread notifications.</p>
      </div>
      <div class="list-page__exports">
        <Button
          label="Mark all read"
          icon="pi pi-check"
          severity="secondary"
          outlined
          :disabled="unreadCount === 0"
          @click="markAllRead"
        />
        <Button
          label="Refresh"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          @click="refreshInbox"
        />
      </div>
    </header>

    <div class="list-page__toolbar">
      <Select
        v-model="query.status"
        :options="[{ label: 'All', value: allStatus }, { label: 'Unread', value: 'unread' }]"
        option-label="label"
        option-value="value"
      />
      <Select
        v-model="query.priority"
        :options="[
          { label: 'Any priority', value: anyPriority },
          { label: 'Low', value: 'LOW' },
          { label: 'Normal', value: 'MEDIUM' },
          { label: 'High', value: 'HIGH' },
          { label: 'Critical', value: 'EMERGENCY' },
        ]"
        option-label="label"
        option-value="value"
      />
    </div>

    <AppSkeletonState v-if="pending" />
    <AppState
      v-else-if="notifications.length === 0"
      variant="empty"
      title="No notifications"
      :message="description"
    />

    <div v-else class="notification-list">
      <article
        v-for="item in notifications"
        :key="item.id"
        class="surface-card notification-row"
        :class="{ 'is-unread': !item.isRead }"
      >
        <div>
          <div class="admin-inline-actions">
            <Tag
              :value="priorityLabel(item.priority)"
              :severity="item.priority === 'EMERGENCY' ? 'danger' : item.priority === 'HIGH' ? 'warn' : 'secondary'"
            />
            <Tag
              :value="item.isRead ? 'Read' : 'Unread'"
              :severity="item.isRead ? 'secondary' : 'success'"
            />
          </div>
          <h2>{{ item.title }}</h2>
          <p>{{ item.body }}</p>
          <small>{{ formatDate(item.createdAt) }}</small>
        </div>
        <Button
          :label="item.deepLinkUrl ? 'Open' : 'Mark read'"
          icon="pi pi-arrow-right"
          severity="secondary"
          outlined
          @click="markRead(item)"
        />
      </article>
    </div>
  </section>
</template>
