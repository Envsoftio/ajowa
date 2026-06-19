<script setup lang="ts">
import type { ServiceRequestAttachment } from '~/types/domain'

defineProps<{
  attachments: ServiceRequestAttachment[]
  canUpload?: boolean
  uploading?: boolean
}>()

const emit = defineEmits<{
  upload: [file: File]
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const accept = 'application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,image/webp'

const pickFile = () => {
  fileInput.value?.click()
}

const onFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    emit('upload', file)
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
        :accept="accept"
        class="ticket-attachment-gallery__input"
        @change="onFileChange"
      >
      <Button
        type="button"
        icon="pi pi-upload"
        label="Upload"
        severity="secondary"
        outlined
        :loading="uploading"
        @click="pickFile"
      />
    </div>

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
  gap: 0.75rem;
}

.ticket-attachment-gallery__toolbar {
  display: flex;
  justify-content: flex-end;
}

.ticket-attachment-gallery__input {
  display: none;
}

.ticket-attachment-gallery__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.85rem;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
}

.ticket-attachment-gallery__item p {
  margin: 0.15rem 0 0;
  color: var(--color-muted);
}
</style>
