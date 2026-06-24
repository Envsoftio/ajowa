<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Notification History',
})

type NotificationEvent = {
  id: string
  eventKey: string
  category: string
  priority: string
  status: string
  title: string | null
  createdAt: string
  scheduledFor: string | null
  jobCount: number
  sentCount: number
  failedCount: number
  channelStatuses: Array<{
    channel: string
    status: string
    count: number
    failureReason: string | null
  }>
}

type ProcessQueueResponse = {
  ok: true
  data: {
    claimed: number
    sent: number
    failed: number
    retried: number
    requeued: number
    eventSummary?: {
      eventStatus: string
      jobCount: number
      queuedCount: number
      processingCount: number
      retryingCount: number
      sentCount: number
      deliveredCount: number
      readCount: number
      failedCount: number
      channelStatuses: NotificationEvent['channelStatuses']
    }
  }
}

const api = useApi()
const toast = useToast()
const confirmAction = useAppConfirm()
const query = reactive({ status: '', search: '' })
const processingEventId = ref<string | null>(null)
const deletingEventId = ref<string | null>(null)
const clearingSent = ref(false)

const { data, pending, refresh } = await useAsyncData('admin-notifications', () =>
  api<{ ok: true; data: { items: NotificationEvent[]; total: number } }>('/api/admin/notifications', {
    query: {
      page: 1,
      pageSize: 100,
      search: query.search || undefined,
      status: query.status || undefined,
    },
  }),
  { watch: [query] },
)

const rows = computed(() => data.value?.data.items ?? [])

const processResultDetail = (result: ProcessQueueResponse['data']) => {
  const requeued = result.requeued ?? 0

  return result.claimed > 0 || requeued > 0
    ? `${requeued > 0 ? `${requeued} requeued, ` : ''}${result.claimed} claimed, ${result.sent} sent, ${result.retried} retried, ${result.failed} failed.`
    : result.eventSummary
      ? result.eventSummary.jobCount === 0
        ? 'No delivery jobs are attached to this row.'
        : `No new jobs claimed. Current channels: ${result.eventSummary.channelStatuses.map(channelLabel).join(', ')}.`
      : 'No claimable queued jobs were found.'
}

const processResultSeverity = (result: ProcessQueueResponse['data']) =>
  result.claimed > 0 || (result.requeued ?? 0) > 0 ? 'success' : 'info'

const hasProcessableJob = (row: NotificationEvent) =>
  row.channelStatuses.some((channelStatus) =>
    ['QUEUED', 'RETRYING', 'PROCESSING'].includes(channelStatus.status),
  )

const hasFailedJob = (row: NotificationEvent) =>
  row.channelStatuses.some((channelStatus) => channelStatus.status === 'FAILED')

const canProcessRow = (row: NotificationEvent) =>
  row.status !== 'CANCELLED' && (hasProcessableJob(row) || hasFailedJob(row))

const channelSeverity = (status: string) => {
  if (['SENT', 'DELIVERED', 'READ'].includes(status)) return 'success'
  if (status === 'FAILED') return 'danger'
  if (['PROCESSING', 'RETRYING'].includes(status)) return 'warn'
  return 'info'
}

const channelLabel = (channelStatus: NotificationEvent['channelStatuses'][number]) =>
  `${channelStatus.channel} ${channelStatus.status}${channelStatus.count > 1 ? ` (${channelStatus.count})` : ''}`

const processQueue = async () => {
  const confirmed = await confirmAction({
    header: 'Process notification queue?',
    message: 'Claim queued notification jobs and send eligible messages now?',
    icon: 'pi pi-play',
    acceptLabel: 'Process queue',
    acceptSeverity: 'warn',
  })

  if (!confirmed) {
    return
  }

  const response = await api<ProcessQueueResponse>('/api/admin/notifications/process', {
    method: 'POST',
  })
  toast.add({
    severity: processResultSeverity(response.data),
    summary: 'Queue processed',
    detail: processResultDetail(response.data),
    life: 10000,
  })
  await refresh()
}

const clearSentRows = async () => {
  const confirmed = await confirmAction({
    header: 'Clear sent notifications?',
    message: 'Delete sent and delivered notification history rows for this society?',
    icon: 'pi pi-trash',
    acceptLabel: 'Clear sent',
    acceptSeverity: 'danger',
  })

  if (!confirmed) {
    return
  }

  clearingSent.value = true

  try {
    const response = await api<{ ok: true; data: { deleted: number } }>('/api/admin/notifications/clear-sent', {
      method: 'DELETE',
    })
    toast.add({
      severity: 'success',
      summary: 'Sent rows cleared',
      detail: `${response.data.deleted} notification row${response.data.deleted === 1 ? '' : 's'} deleted.`,
      life: 10000,
    })
    await refresh()
  } finally {
    clearingSent.value = false
  }
}

const processEvent = async (row: NotificationEvent) => {
  const retryFailed = hasFailedJob(row)
  const confirmed = await confirmAction({
    header: retryFailed ? 'Retry this notification?' : 'Process this notification?',
    message: retryFailed
      ? 'Requeue failed delivery jobs and send this notification row again?'
      : 'Claim and send queued jobs for this notification row only?',
    icon: 'pi pi-play',
    acceptLabel: retryFailed ? 'Retry row' : 'Process row',
    acceptSeverity: 'warn',
  })

  if (!confirmed) {
    return
  }

  processingEventId.value = row.id

  try {
    const response = await api<ProcessQueueResponse>('/api/admin/notifications/process', {
      method: 'POST',
      body: { eventId: row.id, retryFailed },
    })
    toast.add({
      severity: processResultSeverity(response.data),
      summary: 'Row processed',
      detail: processResultDetail(response.data),
      life: 10000,
    })
    await refresh()
  } finally {
    processingEventId.value = null
  }
}

const deleteEvent = async (row: NotificationEvent) => {
  const confirmed = await confirmAction({
    header: 'Delete notification row?',
    message: 'Delete this notification row and its delivery jobs?',
    icon: 'pi pi-trash',
    acceptLabel: 'Delete row',
    acceptSeverity: 'danger',
  })

  if (!confirmed) {
    return
  }

  deletingEventId.value = row.id

  try {
    await api<{ ok: true; data: { id: string } }>(`/api/admin/notifications/${row.id}`, {
      method: 'DELETE',
    })
    toast.add({
      severity: 'success',
      summary: 'Row deleted',
      detail: `${row.title ?? row.eventKey} was deleted.`,
      life: 10000,
    })
    await refresh()
  } finally {
    deletingEventId.value = null
  }
}
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Notification history</h1>
          <p>Audit manual campaigns and transactional sends across all channels.</p>
        </div>
        <div class="list-page__exports">
          <Button label="Compose" icon="pi pi-send" as="router-link" to="/admin/notifications/compose" />
          <Button label="Process queue" icon="pi pi-play" severity="secondary" outlined @click="processQueue" />
          <Button label="Clear sent" icon="pi pi-trash" severity="danger" outlined :loading="clearingSent" @click="clearSentRows" />
        </div>
      </header>

      <div class="list-page__toolbar">
        <IconField class="list-page__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="query.search" placeholder="Search events" />
        </IconField>
        <Select v-model="query.status" :options="[{ label: 'All statuses', value: '' }, { label: 'Queued', value: 'QUEUED' }, { label: 'Processed', value: 'PROCESSED' }, { label: 'Failed', value: 'FAILED' }]" option-label="label" option-value="value" />
      </div>

      <AppDataTable :value="rows" :loading="pending" responsive-layout="scroll" class="list-page__table">
        <Column field="eventKey" header="Event" />
        <Column field="category" header="Category" />
        <Column field="priority" header="Priority"><template #body="{ data: row }"><Tag :value="row.priority" /></template></Column>
        <Column field="status" header="Status"><template #body="{ data: row }"><AppStatusBadge :status="row.status" /></template></Column>
        <Column header="Channels">
          <template #body="{ data: row }">
            <div class="channel-statuses">
              <Tag
                v-for="channelStatus in row.channelStatuses"
                :key="`${channelStatus.channel}-${channelStatus.status}`"
                :value="channelLabel(channelStatus)"
                :severity="channelSeverity(channelStatus.status)"
                :title="channelStatus.failureReason ?? undefined"
              />
            </div>
          </template>
        </Column>
        <Column field="jobCount" header="Jobs" />
        <Column field="sentCount" header="Sent" />
        <Column field="failedCount" header="Failed" />
        <Column field="createdAt" header="Created" />
        <Column header="Actions">
          <template #body="{ data: row }">
            <div class="row-actions">
              <Button
                icon="pi pi-play"
                severity="secondary"
                text
                rounded
                :disabled="!canProcessRow(row) || (processingEventId !== null && processingEventId !== row.id)"
                :loading="processingEventId === row.id"
                :aria-label="`Process ${row.title ?? row.eventKey}`"
                title="Process this notification row"
                @click="processEvent(row)"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                :disabled="deletingEventId !== null && deletingEventId !== row.id"
                :loading="deletingEventId === row.id"
                :aria-label="`Delete ${row.title ?? row.eventKey}`"
                title="Delete notification row"
                @click="deleteEvent(row)"
              />
            </div>
          </template>
        </Column>
      </AppDataTable>
    </section>
  </div>
</template>

<style scoped>
.row-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.channel-statuses {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  min-width: 12rem;
}
</style>
