<script setup lang="ts">
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
const accept = '.pdf,.zip,.xls,.xlsx,.jpg,.jpeg,.png,.webp'
const uploadHelpText = 'Allowed: PDF, ZIP, XLS, XLSX, JPG, PNG, WebP. Max 5 MB each.'

const pickFile = () => {
  fileInput.value?.click()
}

const isAllowedFile = (file: File) => {
  const extension = file.name.includes('.') ? file.name.split('.').pop()?.trim().toLowerCase() ?? '' : ''
  return allowedMimeTypes.has(file.type) || allowedExtensions.has(extension)
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
      <i class="pi pi-paperclip" />
      <div>
        <strong>{{ attachment.fileName }}</strong>
        <p>{{ attachment.mimeType }} · {{ Math.ceil(attachment.sizeBytes / 1024) }} KB</p>
      </div>
      <Button
        v-if="attachment.downloadUrl"
        as="a"
        :href="attachment.downloadUrl"
        target="_blank"
        icon="pi pi-download"
        severity="secondary"
        text
        rounded
        aria-label="Download attachment"
        title="Download attachment"
      />
    </article>
    <AppState
      v-if="attachments.length === 0"
      variant="empty"
      title="No attachments"
      message="Evidence and completion proof metadata will appear here."
    />
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
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.6rem;
  align-items: center;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  border-radius: 0.8rem;
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
</style>
