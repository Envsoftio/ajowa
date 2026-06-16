<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Notices',
})

type NoticeRow = {
  id: string
  title: string
  summary: string | null
  body: string
  priority: string
  status: string
  isPinned: boolean
  publishedAt: string | null
  expiresAt: string | null
}

const api = useApi()
const toast = useToast()
const confirmAction = useAppConfirm()
const form = reactive({
  title: '',
  summary: '',
  body: '',
  priority: 'MEDIUM',
  isPinned: false,
  publish: false,
  channels: ['IN_APP'] as string[],
  audienceScope: 'ALL_ACTIVE_RESIDENTS',
})

const { data, pending, refresh } = await useAsyncData('admin-notices', () =>
  api<{ ok: true; data: { items: NoticeRow[]; total: number } }>('/api/admin/notices', {
    query: { page: 1, pageSize: 100 },
  }),
)
const rows = computed(() => data.value?.data.items ?? [])

const save = async () => {
  if (form.publish) {
    const confirmed = await confirmAction({
      header: 'Publish notice?',
      message: 'Save and publish this notice to the selected audience now?',
      icon: 'pi pi-send',
      acceptLabel: 'Publish',
      acceptSeverity: 'warn',
    })

    if (!confirmed) {
      return
    }
  }

  const response = await api<{ ok: true; data: { id: string; jobCount: number } }>('/api/admin/notices', {
    method: 'POST',
    body: {
      title: form.title,
      summary: form.summary || null,
      body: form.body,
      priority: form.priority,
      isPinned: form.isPinned,
      publish: form.publish,
      channels: form.channels,
      audience: { scope: form.audienceScope },
    },
  })
  toast.add({
    severity: 'success',
    summary: form.publish ? 'Notice published' : 'Notice saved',
    detail: `${response.data.jobCount ?? 0} notification jobs queued.`,
    life: 10000,
  })
  form.title = ''
  form.summary = ''
  form.body = ''
  await refresh()
}

const publish = async (notice: NoticeRow) => {
  const confirmed = await confirmAction({
    header: 'Publish notice?',
    message: `Publish ${notice.title} to all notification channels?`,
    icon: 'pi pi-send',
    acceptLabel: 'Publish',
    acceptSeverity: 'warn',
  })

  if (!confirmed) {
    return
  }

  const response = await api<{ ok: true; data: { jobCount: number } }>(`/api/admin/notices/${notice.id}/publish`, {
    method: 'POST',
    body: { channels: ['PUSH', 'EMAIL', 'WHATSAPP', 'IN_APP'] },
  })
  toast.add({ severity: 'success', summary: 'Notice published', detail: `${response.data.jobCount} jobs queued.`, life: 10000 })
  await refresh()
}
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Notices</h1>
          <p>Create, pin, expire, and broadcast society notices.</p>
        </div>
      </header>

      <form class="admin-form-layout" @submit.prevent="save">
        <InputText v-model="form.title" placeholder="Notice title" />
        <InputText v-model="form.summary" placeholder="Short summary" />
        <Textarea v-model="form.body" rows="6" placeholder="Notice details" />
        <div class="surface-grid">
          <Select v-model="form.priority" :options="['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']" />
          <Select v-model="form.audienceScope" :options="['ALL_ACTIVE_RESIDENTS', 'ACTIVE_PUSH_SUBSCRIBERS', 'OWNERS', 'TENANTS', 'DEFAULTERS', 'BILLING_CONTACTS']" />
          <MultiSelect v-model="form.channels" :options="[{ label: 'Push', value: 'PUSH' }, { label: 'Email', value: 'EMAIL' }, { label: 'WhatsApp', value: 'WHATSAPP' }, { label: 'In-app', value: 'IN_APP' }]" option-label="label" option-value="value" display="chip" />
        </div>
        <div class="admin-inline-actions">
          <ToggleSwitch v-model="form.isPinned" />
          <span>Pin notice</span>
          <ToggleSwitch v-model="form.publish" />
          <span>Publish now</span>
        </div>
        <Button label="Save notice" icon="pi pi-save" type="submit" />
      </form>

      <DataTable :value="rows" :loading="pending" responsive-layout="scroll" class="list-page__table">
        <Column field="title" header="Title" />
        <Column field="priority" header="Priority"><template #body="{ data: row }"><Tag :value="row.priority" /></template></Column>
        <Column field="status" header="Status"><template #body="{ data: row }"><AppStatusBadge :status="row.status" /></template></Column>
        <Column field="isPinned" header="Pinned"><template #body="{ data: row }"><Tag :value="row.isPinned ? 'Pinned' : 'No'" :severity="row.isPinned ? 'warn' : 'secondary'" /></template></Column>
        <Column header="Actions">
          <template #body="{ data: row }">
            <Button label="Publish" icon="pi pi-send" size="small" severity="secondary" outlined :disabled="row.status === 'PUBLISHED'" @click="publish(row)" />
          </template>
        </Column>
      </DataTable>
    </section>
  </div>
</template>
