<script setup lang="ts">
import type { PaginatedResponse } from '~/types/api'
import type { FlatSummary } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Notices',
})

type AudienceScope =
  | 'ALL_ACTIVE_RESIDENTS'
  | 'ACTIVE_PUSH_SUBSCRIBERS'
  | 'OWNERS'
  | 'OWNER_OF_FLAT'
  | 'TENANTS'
  | 'DEFAULTERS'
  | 'BILLING_CONTACTS'

type NoticeRow = {
  id: string
  title: string
  summary: string | null
  body: string
  priority: string
  status: string
  audienceScope: AudienceScope | null
  audienceFilter: {
    scope?: AudienceScope
    flatIds?: string[]
  } | null
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
const saveProgress = ref<'idle' | 'submitting' | 'uploading' | 'refreshing'>('idle')
const publishingNoticeId = ref<string | null>(null)
const editingNoticeId = ref<string | null>(null)
const editingExistingAttachmentLabel = ref<string | null>(null)
const noticeForm = ref<HTMLFormElement | null>(null)
const attachmentAccept = 'application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,image/webp'
const attachmentAllowedMimeTypes = attachmentAccept.split(',')
const attachmentMaxSizeBytes = 10 * 1024 * 1024
const flatOwnerScope = 'OWNER_OF_FLAT' as const
const form = reactive({
  title: '',
  summary: '',
  body: '',
  priority: 'MEDIUM',
  isPinned: false,
  publish: false,
  channels: ['IN_APP'] as string[],
  audienceScope: 'ALL_ACTIVE_RESIDENTS' as AudienceScope,
  flatId: null as string | null,
})

const channelOptions = [
  { label: 'Push', value: 'PUSH' },
  { label: 'Email', value: 'EMAIL' },
  { label: 'WhatsApp', value: 'WHATSAPP' },
  { label: 'In-app', value: 'IN_APP' },
]

const audienceOptions = [
  { label: 'All active residents', value: 'ALL_ACTIVE_RESIDENTS' },
  { label: 'Active push subscribers', value: 'ACTIVE_PUSH_SUBSCRIBERS' },
  { label: 'All owners', value: 'OWNERS' },
  { label: 'Single flat owner', value: flatOwnerScope },
  { label: 'All tenants', value: 'TENANTS' },
  { label: 'Defaulters', value: 'DEFAULTERS' },
  { label: 'Billing contacts', value: 'BILLING_CONTACTS' },
] satisfies { label: string; value: AudienceScope }[]

const [
  noticesAsyncData,
  flatsAsyncData,
] = await Promise.all([
  useAsyncData('admin-notices', () =>
    api<{ ok: true; data: { items: NoticeRow[]; total: number } }>('/api/admin/notices', {
      query: { page: 1, pageSize: 100 },
    }),
  ),
  useAsyncData('notice-flat-owner-options', () =>
    api<PaginatedResponse<FlatSummary>>('/api/admin/flats', {
      query: {
        page: 1,
        pageSize: 2000,
        sortBy: 'flatNumber',
        sortDirection: 'asc',
        'filters[isActive]': 'true',
      },
    }),
  ),
])

const { data, pending, refresh } = noticesAsyncData
const { data: flatsData } = flatsAsyncData
const rows = computed(() => data.value?.data.items ?? [])
const isSaving = computed(() => saveProgress.value !== 'idle')
const isEditing = computed(() => editingNoticeId.value !== null)
const saveProgressLabel = computed(() => {
  if (saveProgress.value === 'uploading') return 'Uploading notice attachment…'
  if (saveProgress.value === 'refreshing') return 'Refreshing the notice list…'
  if (isEditing.value) return 'Updating draft notice…'
  return form.publish
    ? 'Publishing notice and queuing notifications…'
    : 'Saving notice…'
})
const publishProgressLabel = computed(() => {
  const notice = rows.value.find((row) => row.id === publishingNoticeId.value)
  return notice
    ? `Publishing “${notice.title.trim()}” and queuing notifications…`
    : 'Publishing notice and queuing notifications…'
})

const flatOptions = computed(() =>
  (flatsData.value?.data.items ?? []).map((flat) => {
    const ownerCount = typeof flat.ownerCount === 'number' ? ` · ${flat.ownerCount} owner${flat.ownerCount === 1 ? '' : 's'}` : ''
    return {
      label: `${flat.blockName} ${flat.flatNumber}${ownerCount}`,
      value: flat.id,
    }
  }),
)

watch(() => form.audienceScope, (scope) => {
  if (scope !== flatOwnerScope) {
    form.flatId = null
  }
})

const buildAudience = () => {
  if (form.audienceScope === flatOwnerScope) {
    return { scope: form.audienceScope, flatIds: form.flatId ? [form.flatId] : [] }
  }
  return { scope: form.audienceScope }
}

const resetForm = () => {
  form.title = ''
  form.summary = ''
  form.body = ''
  form.priority = 'MEDIUM'
  form.isPinned = false
  form.publish = false
  form.channels = ['IN_APP']
  form.audienceScope = 'ALL_ACTIVE_RESIDENTS'
  form.flatId = null
  editingNoticeId.value = null
  editingExistingAttachmentLabel.value = null
  clearAttachment()
}

const editDraft = async (notice: NoticeRow) => {
  if (notice.status !== 'DRAFT') {
    return
  }

  editingNoticeId.value = notice.id
  editingExistingAttachmentLabel.value = notice.attachmentLabel
  form.title = notice.title
  form.summary = notice.summary ?? ''
  form.body = notice.body
  form.priority = notice.priority
  form.isPinned = notice.isPinned
  form.publish = false
  form.channels = ['IN_APP']
  form.audienceScope = notice.audienceFilter?.scope ?? notice.audienceScope ?? 'ALL_ACTIVE_RESIDENTS'
  form.flatId = notice.audienceFilter?.flatIds?.[0] ?? null
  clearAttachment()

  await nextTick()
  noticeForm.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const cancelEdit = () => {
  resetForm()
}

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
  if (form.audienceScope === flatOwnerScope && !form.flatId) {
    toast.add({
      severity: 'warn',
      summary: 'Select a flat',
      detail: 'Choose the flat whose owner should receive this notice.',
      life: 10000,
    })
    return
  }

  if (form.publish && !isEditing.value) {
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

  saveProgress.value = 'submitting'
  try {
    const response = isEditing.value
      ? await api<{ ok: true; data: { id: string } }>(`/api/admin/notices/${editingNoticeId.value}`, {
          method: 'PATCH',
          errorFallback: 'The draft could not be updated. Your changes are still in the form; please try again.',
          body: {
            title: form.title,
            summary: form.summary || null,
            body: form.body,
            priority: form.priority,
            isPinned: form.isPinned,
            audience: buildAudience(),
          },
        })
      : await api<{ ok: true; data: { id: string; jobCount: number } }>('/api/admin/notices', {
          method: 'POST',
          errorFallback: form.publish
            ? 'The notice could not be published. Your form is unchanged; please try again.'
            : 'The notice could not be saved. Your form is unchanged; please try again.',
          body: {
            title: form.title,
            summary: form.summary || null,
            body: form.body,
            priority: form.priority,
            isPinned: form.isPinned,
            publish: form.publish,
            channels: form.channels,
            audience: buildAudience(),
          },
        })
    if (attachmentFile.value) {
      saveProgress.value = 'uploading'
      await uploadAttachment(response.data.id)
    }
    toast.add({
      severity: 'success',
      summary: isEditing.value ? 'Draft updated' : form.publish ? 'Notice published' : 'Notice saved',
      detail: isEditing.value
        ? 'Your draft changes have been saved.'
        : `${'jobCount' in response.data ? response.data.jobCount : 0} notification jobs queued.`,
      life: 10000,
    })
    resetForm()
    saveProgress.value = 'refreshing'
    await refresh()
  } finally {
    saveProgress.value = 'idle'
  }
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

  publishingNoticeId.value = notice.id
  try {
    const response = await api<{ ok: true; data: { jobCount: number } }>(`/api/admin/notices/${notice.id}/publish`, {
      method: 'POST',
      errorFallback: 'The notice could not be published. It remains a draft; please try again.',
      body: { channels: ['PUSH', 'EMAIL', 'WHATSAPP', 'IN_APP'] },
    })
    toast.add({ severity: 'success', summary: 'Notice published', detail: `${response.data.jobCount} jobs queued.`, life: 10000 })
    await refresh()
  } finally {
    publishingNoticeId.value = null
  }
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

      <form ref="noticeForm" class="admin-form-layout" :aria-busy="isSaving" @submit.prevent="save">
        <div v-if="isEditing" class="notice-edit-banner">
          <div>
            <strong>Editing draft notice</strong>
            <span>Update the content and audience, then save the draft before publishing it.</span>
          </div>
          <Button
            type="button"
            label="Cancel edit"
            icon="pi pi-times"
            severity="secondary"
            text
            :disabled="isSaving"
            @click="cancelEdit"
          />
        </div>
        <InputText v-model="form.title" placeholder="Notice title" :disabled="isSaving" />
        <InputText v-model="form.summary" placeholder="Short summary" :disabled="isSaving" />
        <Textarea v-model="form.body" rows="6" placeholder="Notice details" :disabled="isSaving" />
        <div class="surface-grid">
          <Select v-model="form.priority" :options="['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']" />
          <Select v-model="form.audienceScope" :options="audienceOptions" option-label="label" option-value="value" />
          <Select
            v-if="form.audienceScope === flatOwnerScope"
            v-model="form.flatId"
            :options="flatOptions"
            option-label="label"
            option-value="value"
            filter
            placeholder="Select flat owner"
          />
          <MultiSelect
            v-if="!isEditing"
            v-model="form.channels"
            :options="channelOptions"
            option-label="label"
            option-value="value"
            display="chip"
          />
        </div>
        <div class="admin-inline-actions">
          <ToggleSwitch v-model="form.isPinned" />
          <span>Pin notice</span>
          <ToggleSwitch v-if="!isEditing" v-model="form.publish" />
          <span v-if="!isEditing">Publish now</span>
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
              <strong>
                {{ attachmentFile?.fileName || editingExistingAttachmentLabel || 'No attachment selected' }}
              </strong>
              <span class="muted-line">
                {{ attachmentFile
                  ? `${attachmentFile.mimeType} · ${formatBytes(attachmentFile.sizeBytes)}`
                  : editingExistingAttachmentLabel
                    ? 'Current attachment · choose Replace to upload a new file'
                    : 'PDF, Excel, PNG, JPG, JPEG, or WebP' }}
              </span>
            </div>
            <div class="admin-inline-actions">
              <Button
                type="button"
                :label="attachmentFile || editingExistingAttachmentLabel ? 'Replace' : 'Upload'"
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
        <div v-if="isSaving" class="notice-publish-progress" role="status" aria-live="polite">
          <ProgressSpinner stroke-width="5" />
          <div>
            <strong>{{ saveProgressLabel }}</strong>
            <span>Please keep this page open. This should only take a moment.</span>
          </div>
        </div>
        <div class="admin-inline-actions">
          <Button
            :label="isEditing ? 'Update draft' : form.publish ? 'Publish notice' : 'Save notice'"
            :icon="form.publish && !isEditing ? 'pi pi-send' : 'pi pi-save'"
            type="submit"
            :loading="isSaving"
            :disabled="isSaving || publishingNoticeId !== null"
          />
          <Button
            v-if="isEditing"
            type="button"
            label="Cancel"
            icon="pi pi-times"
            severity="secondary"
            outlined
            :disabled="isSaving"
            @click="cancelEdit"
          />
        </div>
      </form>

      <div v-if="publishingNoticeId" class="notice-publish-progress" role="status" aria-live="polite">
        <ProgressSpinner stroke-width="5" />
        <div>
          <strong>{{ publishProgressLabel }}</strong>
          <span>Preparing delivery jobs for the selected audience.</span>
        </div>
      </div>

      <AppDataTable :value="rows" :loading="pending" responsive-layout="scroll" class="list-page__table">
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
            <div class="admin-inline-actions">
              <Button
                v-if="row.status === 'DRAFT'"
                label="Edit"
                icon="pi pi-pencil"
                size="small"
                severity="secondary"
                outlined
                :disabled="isSaving || publishingNoticeId !== null"
                @click="editDraft(row)"
              />
              <Button
                label="Publish"
                icon="pi pi-send"
                size="small"
                severity="secondary"
                outlined
                :loading="publishingNoticeId === row.id"
                :disabled="row.status !== 'DRAFT' || publishingNoticeId !== null || isSaving"
                @click="publish(row)"
              />
            </div>
          </template>
        </Column>
      </AppDataTable>
    </section>
  </div>
</template>

<style scoped>
.notice-publish-progress {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.875rem 1rem;
  border: 1px solid color-mix(in srgb, var(--p-primary-color) 30%, var(--surface-border));
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--p-primary-color) 7%, var(--surface-card));
}

.notice-edit-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.875rem 1rem;
  border: 1px solid color-mix(in srgb, var(--p-primary-color) 30%, var(--surface-border));
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--p-primary-color) 7%, var(--surface-card));
}

.notice-edit-banner > div {
  display: grid;
  gap: 0.2rem;
}

.notice-edit-banner span {
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.notice-publish-progress :deep(.p-progressspinner) {
  width: 2rem;
  height: 2rem;
  flex: 0 0 auto;
}

.notice-publish-progress div {
  display: grid;
  gap: 0.2rem;
}

.notice-publish-progress strong {
  color: var(--text-color);
}

.notice-publish-progress span {
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}
</style>
