<script setup lang="ts">
import type { DataTablePageEvent } from 'primevue/datatable'

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
    remaining: number
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

type ProcessQueueProgress = ProcessQueueResponse['data'] & {
  batchCount: number
  currentBatch: number
  running: boolean
  reachedBatchLimit: boolean
  hasError: boolean
}

const api = useApi()
const toast = useToast()
const confirmAction = useAppConfirm()
const query = reactive({
  page: 1,
  pageSize: 100,
  status: '',
  search: '',
})
const processQueueBatchSize = 5
const maxProcessQueueBatches = 60
const processingEventId = ref<string | null>(null)
const processingQueue = ref(false)
const processQueueProgress = ref<ProcessQueueProgress | null>(null)
const deletingEventId = ref<string | null>(null)
const clearingSent = ref(false)

const { data, pending, refresh } = await useAsyncData('admin-notifications', () =>
  api<{ ok: true; data: { items: NotificationEvent[]; total: number } }>('/api/admin/notifications', {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search || undefined,
      status: query.status || undefined,
    },
  }),
  { watch: [query] },
)

const rows = computed(() => data.value?.data.items ?? [])
const totalRecords = computed(() => data.value?.data.total ?? 0)
const first = computed(() => (query.page - 1) * query.pageSize)
const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-IN').format(value)

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

const emptyProcessResult = (): ProcessQueueResponse['data'] => ({
  claimed: 0,
  sent: 0,
  failed: 0,
  retried: 0,
  requeued: 0,
  remaining: 0,
})

const mergeProcessResults = (
  total: ProcessQueueResponse['data'],
  next: ProcessQueueResponse['data'],
): ProcessQueueResponse['data'] => ({
  claimed: total.claimed + next.claimed,
  sent: total.sent + next.sent,
  failed: total.failed + next.failed,
  retried: total.retried + next.retried,
  requeued: (total.requeued ?? 0) + (next.requeued ?? 0),
  remaining: next.remaining,
})

const processQueueDetail = (
  result: ProcessQueueResponse['data'],
  batchCount: number,
  reachedBatchLimit: boolean,
) => {
  const batchLabel = batchCount === 1 ? '1 batch' : `${batchCount} batches`
  const limitMessage = reachedBatchLimit
    ? ' Batch safety limit reached; run Process queue again for remaining jobs.'
    : ''

  return `${processResultDetail(result)} Checked ${batchLabel}.${limitMessage}`
}

const processQueueProgressTotal = computed(() => {
  const progress = processQueueProgress.value

  return progress ? progress.claimed + progress.remaining : 0
})

const processQueueProgressState = computed(() => {
  const progress = processQueueProgress.value

  if (!progress) return 'idle'
  if (progress.hasError) return 'error'
  if (progress.running) return 'running'
  if (progress.failed > 0 || progress.reachedBatchLimit) return 'warning'
  return 'done'
})

const processQueueProgressTitle = computed(() => {
  const state = processQueueProgressState.value

  if (state === 'error') return 'Queue stopped'
  if (state === 'running') return 'Sending notifications'
  if (state === 'warning') return 'Queue needs attention'
  if (state === 'done') return 'Queue processed'
  return 'Queue progress'
})

const processQueueProgressIcon = computed(() => {
  const state = processQueueProgressState.value

  if (state === 'error') return 'pi pi-exclamation-triangle'
  if (state === 'running') return 'pi pi-spin pi-spinner'
  if (state === 'warning') return 'pi pi-info-circle'
  return 'pi pi-check-circle'
})

const processQueueProgressPercent = computed(() => {
  const total = processQueueProgressTotal.value

  if (total <= 0) {
    return processQueueProgress.value?.running ? 8 : 100
  }

  return Math.min(
    100,
    Math.max(0, Math.round((processQueueProgress.value!.claimed / total) * 100)),
  )
})

const processQueueProgressLabel = computed(() => {
  const progress = processQueueProgress.value

  if (!progress) return ''

  if (progress.hasError) {
    return `Stopped after ${formatNumber(progress.batchCount)} batch${progress.batchCount === 1 ? '' : 'es'}: ${formatNumber(progress.claimed)} claimed, ${formatNumber(progress.sent)} sent, ${formatNumber(progress.retried)} retried, ${formatNumber(progress.failed)} failed, ${formatNumber(progress.remaining)} remaining.`
  }

  const batch = progress.running
    ? `Batch ${formatNumber(progress.currentBatch)} running`
    : `Processed ${formatNumber(progress.batchCount)} batch${progress.batchCount === 1 ? '' : 'es'}`
  const remaining = progress.remaining > 0
    ? `${formatNumber(progress.remaining)} remaining`
    : 'No claimable jobs remaining'

  return `${batch}: ${formatNumber(progress.claimed)} claimed, ${formatNumber(progress.sent)} sent, ${formatNumber(progress.retried)} retried, ${formatNumber(progress.failed)} failed, ${remaining}.`
})

const updateProcessQueueProgress = (
  result: ProcessQueueResponse['data'],
  input: {
    batchCount: number
    currentBatch: number
    running: boolean
    reachedBatchLimit: boolean
    hasError?: boolean
  },
) => {
  processQueueProgress.value = {
    ...result,
    ...input,
    hasError: input.hasError ?? false,
  }
}

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

const onPage = (event: DataTablePageEvent) => {
  query.page = Math.floor(event.first / event.rows) + 1
  query.pageSize = event.rows
}

const processQueue = async () => {
  const confirmed = await confirmAction({
    header: 'Process notification queue?',
    message: 'Claim queued notification jobs in small batches and send eligible messages now?',
    icon: 'pi pi-play',
    acceptLabel: 'Process queue',
    acceptSeverity: 'warn',
  })

  if (!confirmed) {
    return
  }

  processingQueue.value = true
  processQueueProgress.value = {
    ...emptyProcessResult(),
    batchCount: 0,
    currentBatch: 1,
    running: true,
    reachedBatchLimit: false,
    hasError: false,
  }

  try {
    let aggregate = emptyProcessResult()
    let batchCount = 0
    let reachedBatchLimit = false

    for (let index = 0; index < maxProcessQueueBatches; index += 1) {
      updateProcessQueueProgress(aggregate, {
        batchCount,
        currentBatch: index + 1,
        running: true,
        reachedBatchLimit: false,
        hasError: false,
      })

      const response = await api<ProcessQueueResponse>('/api/admin/notifications/process', {
        method: 'POST',
        body: { limit: processQueueBatchSize },
      })
      batchCount += 1
      aggregate = mergeProcessResults(aggregate, response.data)
      updateProcessQueueProgress(aggregate, {
        batchCount,
        currentBatch: batchCount,
        running: true,
        reachedBatchLimit,
        hasError: false,
      })

      if (response.data.claimed < processQueueBatchSize) {
        break
      }

      reachedBatchLimit = index === maxProcessQueueBatches - 1
    }
    updateProcessQueueProgress(aggregate, {
      batchCount,
      currentBatch: batchCount,
      running: false,
      reachedBatchLimit,
      hasError: false,
    })

    toast.add({
      severity: processResultSeverity(aggregate),
      summary: 'Queue processed',
      detail: processQueueDetail(aggregate, batchCount, reachedBatchLimit),
      life: 10000,
    })
    await refresh()
  } catch (error) {
    if (processQueueProgress.value) {
      processQueueProgress.value = {
        ...processQueueProgress.value,
        running: false,
        hasError: true,
      }
    }

    throw error
  } finally {
    processingQueue.value = false
  }
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

watch(
  () => [query.search, query.status].join('|'),
  () => {
    query.page = 1
  },
)
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
          <Button
            :label="processingQueue ? 'Processing queue' : 'Process queue'"
            icon="pi pi-play"
            :severity="processingQueue ? 'warn' : 'secondary'"
            :outlined="!processingQueue"
            :loading="processingQueue"
            @click="processQueue"
          />
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

      <div
        v-if="processQueueProgress"
        :class="[
          'notification-queue-progress',
          `notification-queue-progress--${processQueueProgressState}`,
        ]"
        aria-live="polite"
      >
        <div class="notification-queue-progress__header">
          <div class="notification-queue-progress__status">
            <span class="notification-queue-progress__icon" aria-hidden="true">
              <i :class="processQueueProgressIcon" />
            </span>
            <div>
              <span>{{ processQueueProgressTitle }}</span>
              <strong>{{ processQueueProgressLabel }}</strong>
            </div>
          </div>
          <div class="notification-queue-progress__primary-count">
            <span>Sent</span>
            <strong>{{ formatNumber(processQueueProgress.sent) }}</strong>
          </div>
        </div>
        <span
          class="notification-queue-progress__track"
          role="progressbar"
          :aria-valuenow="processQueueProgressPercent"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span :style="{ width: `${processQueueProgressPercent}%` }" />
        </span>
        <dl>
          <div>
            <dt>Total</dt>
            <dd>{{ formatNumber(processQueueProgressTotal) }}</dd>
          </div>
          <div>
            <dt>Batches</dt>
            <dd>{{ formatNumber(processQueueProgress.batchCount) }}</dd>
          </div>
          <div>
            <dt>Claimed</dt>
            <dd>{{ formatNumber(processQueueProgress.claimed) }}</dd>
          </div>
          <div>
            <dt>Sent</dt>
            <dd>{{ formatNumber(processQueueProgress.sent) }}</dd>
          </div>
          <div>
            <dt>Retried</dt>
            <dd>{{ formatNumber(processQueueProgress.retried) }}</dd>
          </div>
          <div>
            <dt>Failed</dt>
            <dd>{{ formatNumber(processQueueProgress.failed) }}</dd>
          </div>
          <div>
            <dt>Remaining</dt>
            <dd>{{ formatNumber(processQueueProgress.remaining) }}</dd>
          </div>
        </dl>
      </div>

      <AppDataTable
        :value="rows"
        :loading="pending"
        :lazy="true"
        paginator
        responsive-layout="scroll"
        class="list-page__table"
        :rows="query.pageSize"
        :first="first"
        :total-records="totalRecords"
        @page="onPage"
      >
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

.notification-queue-progress {
  --queue-accent: var(--primary-color);
  --queue-accent-strong: var(--primary-color);
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--queue-accent) 55%, var(--surface-border));
  border-left-width: 0.4rem;
  border-radius: 8px;
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--queue-accent) 16%, transparent),
      transparent 58%
    ),
    color-mix(in srgb, var(--queue-accent) 7%, var(--surface-card));
  box-shadow: 0 10px 28px color-mix(in srgb, var(--queue-accent) 13%, transparent);
}

.notification-queue-progress--running {
  --queue-accent: #0ea5e9;
  --queue-accent-strong: #0369a1;
}

.notification-queue-progress--done {
  --queue-accent: #22c55e;
  --queue-accent-strong: #15803d;
}

.notification-queue-progress--warning {
  --queue-accent: #f59e0b;
  --queue-accent-strong: #b45309;
}

.notification-queue-progress--error {
  --queue-accent: #ef4444;
  --queue-accent-strong: #b91c1c;
}

.notification-queue-progress__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.notification-queue-progress__status {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  min-width: 0;
}

.notification-queue-progress__icon {
  display: inline-grid;
  flex: 0 0 auto;
  width: 2.25rem;
  height: 2.25rem;
  place-items: center;
  border-radius: 999px;
  color: #ffffff;
  background: var(--queue-accent-strong);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--queue-accent) 28%, transparent);
}

.notification-queue-progress__status > div {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}

.notification-queue-progress__status span,
.notification-queue-progress__primary-count span {
  color: color-mix(in srgb, var(--queue-accent-strong) 74%, var(--text-color));
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
}

.notification-queue-progress__status strong {
  color: var(--text-color);
  font-size: 0.96rem;
  line-height: 1.45;
}

.notification-queue-progress__primary-count {
  display: grid;
  justify-items: end;
  flex: 0 0 auto;
  min-width: 5.5rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid color-mix(in srgb, var(--queue-accent) 35%, var(--surface-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-card) 78%, #ffffff);
}

.notification-queue-progress__primary-count strong {
  color: var(--queue-accent-strong);
  font-size: 1.55rem;
  line-height: 1;
}

.notification-queue-progress__track {
  display: block;
  overflow: hidden;
  height: 0.6rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--queue-accent) 18%, var(--surface-border));
}

.notification-queue-progress__track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--queue-accent), var(--queue-accent-strong));
  transition: width 180ms ease;
}

.notification-queue-progress--running .notification-queue-progress__track span {
  background-size: 160% 100%;
  animation: queue-progress-shimmer 1.1s linear infinite;
}

.notification-queue-progress dl {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.6rem;
  margin: 0;
}

.notification-queue-progress dl div {
  min-width: 0;
}

.notification-queue-progress dt {
  color: var(--text-color-secondary);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
}

.notification-queue-progress dd {
  margin: 0.15rem 0 0;
  color: var(--text-color);
  font-size: 1rem;
  font-weight: 700;
}

@keyframes queue-progress-shimmer {
  0% {
    background-position: 0% 50%;
  }

  100% {
    background-position: 160% 50%;
  }
}

@media (max-width: 720px) {
  .notification-queue-progress__header {
    align-items: stretch;
    flex-direction: column;
  }

  .notification-queue-progress__primary-count {
    justify-items: start;
    min-width: 0;
  }

  .notification-queue-progress dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
