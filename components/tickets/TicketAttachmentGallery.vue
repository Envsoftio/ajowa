<script setup lang="ts">
import { withDownloadQuery } from '~/shared/document-links'
import type { ServiceRequestAttachment } from '~/types/domain'

const FIVE_MEGABYTES = 5 * 1024 * 1024
const allowedMimeTypes = new Set([
  'application/pdf',
  'application/zip',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const allowedExtensions = new Set(['pdf', 'zip', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'webp'])

defineProps<{
  attachments: ServiceRequestAttachment[]
  canUpload?: boolean
  uploading?: boolean
}>()

const emit = defineEmits<{
  upload: [files: File[]]
}>()

const toast = useToast()
const fileInput = ref<HTMLInputElement | null>(null)
const previewAttachment = ref<ServiceRequestAttachment | null>(null)
const previewVisible = computed({
  get: () => Boolean(previewAttachment.value),
  set: (visible: boolean) => {
    if (!visible) {
      previewAttachment.value = null
    }
  },
})
const accept = '.pdf,.zip,.xls,.xlsx,.jpg,.jpeg,.png,.webp'
const uploadHelpText = 'Allowed: PDF, ZIP, XLS, XLSX, JPG, PNG, WebP. Max 5 MB each.'

const pickFile = () => {
  fileInput.value?.click()
}

const isAllowedFile = (file: File) => {
  const extension = file.name.includes('.') ? file.name.split('.').pop()?.trim().toLowerCase() ?? '' : ''
  return allowedMimeTypes.has(file.type) || allowedExtensions.has(extension)
}

const fileExtension = (fileName: string) =>
  fileName.includes('.') ? fileName.split('.').pop()?.trim().toLowerCase() ?? '' : ''

const isImageAttachment = (attachment: ServiceRequestAttachment) =>
  attachment.mimeType.startsWith('image/') ||
  ['jpg', 'jpeg', 'png', 'webp'].includes(fileExtension(attachment.fileName))

const downloadHref = (attachment: ServiceRequestAttachment) =>
  attachment.downloadUrl ? withDownloadQuery(attachment.downloadUrl) : ''

const openPreview = (attachment: ServiceRequestAttachment) => {
  if (isImageAttachment(attachment) && attachment.downloadUrl) {
    previewAttachment.value = attachment
  }
}

const onFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const selectedFiles = Array.from(target.files ?? [])
  const validFiles: File[] = []

  if (selectedFiles.length > 0) {
    for (const file of selectedFiles) {
      if (file.size <= 0 || file.size > FIVE_MEGABYTES) {
        toast.add({
          severity: 'warn',
          summary: 'File too large',
          detail: `"${file.name}" must be 5 MB or smaller.`,
          life: 10000,
        })
        continue
      }

      if (!isAllowedFile(file)) {
        toast.add({
          severity: 'warn',
          summary: 'Unsupported file type',
          detail: `"${file.name}" is not an allowed file type.`,
          life: 10000,
        })
        continue
      }

      validFiles.push(file)
    }

    if (validFiles.length === 0) {
      target.value = ''
      return
    }

    if (validFiles.length !== selectedFiles.length) {
      toast.add({
        severity: 'info',
        summary: 'Some files skipped',
        detail: `${validFiles.length} of ${selectedFiles.length} files are ready to upload.`,
        life: 10000,
      })
    }

    emit('upload', validFiles)
  }

  target.value = ''
}
</script>

<template>
  <section class="ticket-attachment-gallery">
    <div v-if="canUpload" class="ticket-attachment-gallery__toolbar">
      <input
        ref="fileInput"
        type="file"
        multiple
        :accept="accept"
        class="ticket-attachment-gallery__input"
        @change="onFileChange"
      >
      <Button
        type="button"
        icon="pi pi-upload"
        label="Upload files"
        severity="secondary"
        outlined
        :loading="uploading"
        :disabled="uploading"
        @click="pickFile"
      />
    </div>
    <p v-if="canUpload" class="ticket-attachment-gallery__hint">
      {{ uploadHelpText }}
    </p>

    <article v-for="attachment in attachments" :key="attachment.id" class="ticket-attachment-gallery__item">
      <button
        v-if="isImageAttachment(attachment) && attachment.downloadUrl"
        type="button"
        class="ticket-attachment-gallery__thumb"
        :aria-label="`View ${attachment.fileName}`"
        :title="`View ${attachment.fileName}`"
        @click="openPreview(attachment)"
      >
        <img :src="attachment.downloadUrl" :alt="attachment.fileName" loading="lazy">
      </button>
      <i v-else class="pi pi-paperclip ticket-attachment-gallery__icon" />
      <div>
        <strong>{{ attachment.fileName }}</strong>
        <p>{{ attachment.mimeType }} · {{ Math.ceil(attachment.sizeBytes / 1024) }} KB</p>
      </div>
      <div class="ticket-attachment-gallery__actions">
        <Button
          v-if="isImageAttachment(attachment) && attachment.downloadUrl"
          type="button"
          icon="pi pi-eye"
          severity="secondary"
          text
          rounded
          aria-label="View attachment"
          title="View attachment"
          @click="openPreview(attachment)"
        />
        <Button
          v-if="attachment.downloadUrl"
          as="a"
          :href="downloadHref(attachment)"
          :download="attachment.fileName"
          icon="pi pi-download"
          severity="secondary"
          text
          rounded
          aria-label="Download attachment"
          title="Download attachment"
        />
      </div>
    </article>
    <AppState
      v-if="attachments.length === 0"
      variant="empty"
      title="No attachments"
      message="Evidence and completion proof metadata will appear here."
    />
    <Dialog
      v-model:visible="previewVisible"
      modal
      :header="previewAttachment?.fileName || 'Attachment'"
      :style="{ width: 'min(920px, 96vw)' }"
      content-class="ticket-attachment-gallery__preview-content"
    >
      <div v-if="previewAttachment" class="ticket-attachment-gallery__preview">
        <img
          v-if="previewAttachment.downloadUrl"
          :src="previewAttachment.downloadUrl"
          :alt="previewAttachment.fileName"
        >
        <div class="ticket-attachment-gallery__preview-actions">
          <Button
            v-if="previewAttachment.downloadUrl"
            as="a"
            :href="downloadHref(previewAttachment)"
            :download="previewAttachment.fileName"
            label="Download"
            icon="pi pi-download"
            severity="secondary"
            outlined
          />
          <Button
            v-if="previewAttachment.downloadUrl"
            as="a"
            :href="previewAttachment.downloadUrl"
            target="_blank"
            rel="noopener noreferrer"
            label="Open"
            icon="pi pi-external-link"
          />
        </div>
      </div>
    </Dialog>
  </section>
</template>

<style scoped>
.ticket-attachment-gallery {
  display: grid;
  gap: 0.55rem;
  margin-top: 0.5rem;
}

.ticket-attachment-gallery__toolbar {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.1rem;
}

.ticket-attachment-gallery__hint {
  margin: -0.1rem 0 0;
  color: var(--color-muted);
  font-size: 0.78rem;
  text-align: right;
}

.ticket-attachment-gallery__input {
  display: none;
}

.ticket-attachment-gallery__item {
  display: grid;
  grid-template-columns: 3rem minmax(0, 1fr) auto;
  gap: 0.6rem;
  align-items: center;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  border-radius: 0.8rem;
}

.ticket-attachment-gallery__icon {
  justify-self: center;
}

.ticket-attachment-gallery__thumb {
  width: 3rem;
  height: 3rem;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  cursor: pointer;
}

.ticket-attachment-gallery__thumb img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.ticket-attachment-gallery__item strong {
  display: block;
  font-size: 0.92rem;
  line-height: 1.3;
}

.ticket-attachment-gallery__item p {
  margin: 0.1rem 0 0;
  color: var(--color-muted);
  font-size: 0.78rem;
}

.ticket-attachment-gallery__actions,
.ticket-attachment-gallery__preview-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.35rem;
}

.ticket-attachment-gallery__preview {
  display: grid;
  gap: 0.85rem;
}

.ticket-attachment-gallery__preview img {
  width: 100%;
  max-height: min(70vh, 720px);
  display: block;
  object-fit: contain;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
}

@media (max-width: 560px) {
  .ticket-attachment-gallery__item {
    grid-template-columns: 3rem minmax(0, 1fr);
  }

  .ticket-attachment-gallery__actions {
    grid-column: 1 / -1;
  }
}
</style>
