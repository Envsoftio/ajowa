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
  attachmentFileId: string | null
  attachmentLabel: string | null
  attachmentUrl: string | null
}

type NoticeAttachment = {
  file: File
  fileName: string
  mimeType: string
  sizeBytes: number
}

const api = useApi()
const toast = useToast()
const confirmAction = useAppConfirm()
const attachmentInput = ref<HTMLInputElement | null>(null)
const rowAttachmentInput = ref<HTMLInputElement | null>(null)
const attachmentFile = ref<NoticeAttachment | null>(null)
const rowAttachmentTargetNoticeId = ref<string | null>(null)
const rowAttachmentUploadingId = ref<string | null>(null)
const attachmentAccept = 'application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,image/webp'
const attachmentAllowedMimeTypes = attachmentAccept.split(',')
const attachmentMaxSizeBytes = 10 * 1024 * 1024
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

const formatBytes = (value: number | null | undefined) => {
  const bytes = Number(value ?? 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const pickAttachment = () => {
  attachmentInput.value?.click()
}

const clearAttachment = () => {
  attachmentFile.value = null
}

const onAttachmentChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''

  if (!file) {
    return
  }

  if (!attachmentAllowedMimeTypes.includes(file.type)) {
    toast.add({
      severity: 'warn',
      summary: 'Unsupported file',
      detail: 'Upload a PDF, Excel, JPG, PNG, or WebP attachment.',
      life: 10000,
    })
    return
  }

  if (file.size <= 0 || file.size > attachmentMaxSizeBytes) {
    toast.add({
      severity: 'warn',
      summary: 'File too large',
      detail: 'Notice attachments must be 10 MB or smaller.',
      life: 10000,
    })
    return
  }

  attachmentFile.value = {
    file,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  }
}

const uploadNoticeAttachmentFile = async (noticeId: string, file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('label', file.name)
  await api(`/api/admin/notices/${noticeId}/attachment`, {
    method: 'POST',
    body: formData,
  })
}

const uploadAttachment = async (noticeId: string) => {
  if (!attachmentFile.value) {
    return
  }

  await uploadNoticeAttachmentFile(noticeId, attachmentFile.value.file)
}

const pickRowAttachment = (notice: NoticeRow) => {
  rowAttachmentTargetNoticeId.value = notice.id
  rowAttachmentInput.value?.click()
}

const onRowAttachmentChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  const noticeId = rowAttachmentTargetNoticeId.value
  rowAttachmentTargetNoticeId.value = null

  if (!file || !noticeId) {
    return
  }

  if (!attachmentAllowedMimeTypes.includes(file.type)) {
    toast.add({
      severity: 'warn',
      summary: 'Unsupported file',
      detail: 'Upload a PDF, Excel, JPG, PNG, or WebP attachment.',
      life: 10000,
    })
    return
  }

  if (file.size <= 0 || file.size > attachmentMaxSizeBytes) {
    toast.add({
      severity: 'warn',
      summary: 'File too large',
      detail: 'Notice attachments must be 10 MB or smaller.',
      life: 10000,
    })
    return
  }

  rowAttachmentUploadingId.value = noticeId
  try {
    await uploadNoticeAttachmentFile(noticeId, file)
    toast.add({ severity: 'success', summary: 'Attachment uploaded', life: 10000 })
    await refresh()
  } finally {
    rowAttachmentUploadingId.value = null
  }
}

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
  await uploadAttachment(response.data.id)
  toast.add({
    severity: 'success',
    summary: form.publish ? 'Notice published' : 'Notice saved',
    detail: `${response.data.jobCount ?? 0} notification jobs queued.`,
    life: 10000,
  })
  form.title = ''
  form.summary = ''
  form.body = ''
  clearAttachment()
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
    <input
      ref="rowAttachmentInput"
      type="file"
      :accept="attachmentAccept"
      class="finance-upload-card__input"
      @change="onRowAttachmentChange"
    >

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
        <div class="resident-file-upload">
          <input
            ref="attachmentInput"
            type="file"
            :accept="attachmentAccept"
            class="finance-upload-card__input"
            @change="onAttachmentChange"
          >
          <div class="resident-file-upload__body">
            <div class="resident-file-upload__header">
              <strong>{{ attachmentFile?.fileName || 'No attachment selected' }}</strong>
              <span class="muted-line">
                {{ attachmentFile ? `${attachmentFile.mimeType} · ${formatBytes(attachmentFile.sizeBytes)}` : 'PDF, Excel, PNG, JPG, JPEG, or WebP' }}
              </span>
            </div>
            <div class="admin-inline-actions">
              <Button
                type="button"
                :label="attachmentFile ? 'Replace' : 'Upload'"
                icon="pi pi-upload"
                severity="secondary"
                outlined
                @click="pickAttachment"
              />
              <Button
                v-if="attachmentFile"
                type="button"
                label="Remove"
                icon="pi pi-times"
                severity="danger"
                text
                @click="clearAttachment"
              />
            </div>
          </div>
        </div>
        <Button label="Save notice" icon="pi pi-save" type="submit" />
      </form>

      <DataTable :value="rows" :loading="pending" responsive-layout="scroll" class="list-page__table">
        <Column field="title" header="Title" />
        <Column field="priority" header="Priority"><template #body="{ data: row }"><Tag :value="row.priority" /></template></Column>
        <Column field="status" header="Status"><template #body="{ data: row }"><AppStatusBadge :status="row.status" /></template></Column>
        <Column field="isPinned" header="Pinned"><template #body="{ data: row }"><Tag :value="row.isPinned ? 'Pinned' : 'No'" :severity="row.isPinned ? 'warn' : 'secondary'" /></template></Column>
        <Column header="Attachment">
          <template #body="{ data: row }">
            <Button
              v-if="row.attachmentUrl"
              as="a"
              :href="row.attachmentUrl"
              target="_blank"
              icon="pi pi-paperclip"
              :label="row.attachmentLabel || 'Open'"
              severity="secondary"
              outlined
              size="small"
            />
            <Button
              type="button"
              :label="row.attachmentUrl ? 'Replace' : 'Upload'"
              icon="pi pi-upload"
              severity="secondary"
              outlined
              size="small"
              :loading="rowAttachmentUploadingId === row.id"
              @click="pickRowAttachment(row)"
            />
          </template>
        </Column>
        <Column header="Actions">
          <template #body="{ data: row }">
            <Button label="Publish" icon="pi pi-send" size="small" severity="secondary" outlined :disabled="row.status === 'PUBLISHED'" @click="publish(row)" />
          </template>
        </Column>
      </DataTable>
    </section>
  </div>
</template>
