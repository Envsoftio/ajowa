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
}

const api = useApi()
const toast = useToast()
const confirmAction = useAppConfirm()
const query = reactive({ status: '', search: '' })

const { data, pending, refresh } = await useAsyncData('admin-notifications', () =>
  api<{ ok: true; data: { items: NotificationEvent[]; total: number } }>('/api/admin/notifications', {
    query: {
      page: 1,
      pageSize: 100,
      search: query.search || undefined,
      filters: { status: query.status || undefined },
    },
  }),
  { watch: [query] },
)

const rows = computed(() => data.value?.data.items ?? [])

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

  const response = await api<{ ok: true; data: { claimed: number; sent: number; failed: number; retried: number } }>('/api/admin/notifications/process', {
    method: 'POST',
  })
  toast.add({
    severity: 'success',
    summary: 'Queue processed',
    detail: `${response.data.claimed} claimed, ${response.data.sent} sent, ${response.data.retried} retried, ${response.data.failed} failed.`,
    life: 10000,
  })
  await refresh()
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
        </div>
      </header>

      <div class="list-page__toolbar">
        <IconField class="list-page__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="query.search" placeholder="Search events" />
        </IconField>
        <Select v-model="query.status" :options="[{ label: 'All statuses', value: '' }, { label: 'Queued', value: 'QUEUED' }, { label: 'Processed', value: 'PROCESSED' }, { label: 'Failed', value: 'FAILED' }]" option-label="label" option-value="value" />
      </div>

      <DataTable :value="rows" :loading="pending" responsive-layout="scroll" class="list-page__table">
        <Column field="eventKey" header="Event" />
        <Column field="category" header="Category" />
        <Column field="priority" header="Priority"><template #body="{ data: row }"><Tag :value="row.priority" /></template></Column>
        <Column field="status" header="Status"><template #body="{ data: row }"><AppStatusBadge :status="row.status" /></template></Column>
        <Column field="jobCount" header="Jobs" />
        <Column field="sentCount" header="Sent" />
        <Column field="failedCount" header="Failed" />
        <Column field="createdAt" header="Created" />
      </DataTable>
    </section>
  </div>
</template>
