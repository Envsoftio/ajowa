<script setup lang="ts">
import type { FinanceTransactionAttachment } from '~/types/domain'
import type { LocalFinanceAttachment } from '~/composables/useFinanceAttachments'

const props = defineProps<{
  attachment: LocalFinanceAttachment | FinanceTransactionAttachment | null
  transactionId?: string
  canReplace?: boolean
  canRemove?: boolean
}>()

const emit = defineEmits<{
  replace: []
  remove: []
}>()

const { formatBytes, formatDateTime } = useFinanceFormatters()

const fileName = computed(() => {
  const item = props.attachment
  if (!item) return ''
  return item.fileName
})

const mimeType = computed(() => {
  const item = props.attachment
  if (!item) return ''
  return item.mimeType
})

const sizeBytes = computed(() => props.attachment?.sizeBytes ?? 0)

const previewUrl = computed(() => {
  const item = props.attachment
  if (!item) return ''
  if ('previewUrl' in item) return item.previewUrl
  if (item.downloadUrl) return item.downloadUrl
  if (props.transactionId) {
    return `/api/admin/finance/transactions/${props.transactionId}/attachments/${item.id}/download`
  }
  return ''
})

const isImage = computed(() => mimeType.value.startsWith('image/'))
const isPdf = computed(() => mimeType.value === 'application/pdf')
const createdAt = computed(() => {
  const item = props.attachment
  return item && 'createdAt' in item ? item.createdAt : null
})
</script>

<template>
  <div class="finance-attachment-preview">
    <div v-if="!attachment" class="finance-attachment-preview__empty">
      <i class="pi pi-file" aria-hidden="true" />
      <span>No attachment selected</span>
    </div>
    <template v-else>
      <div class="finance-attachment-preview__frame">
        <img v-if="isImage" :src="previewUrl" :alt="fileName">
        <object v-else-if="isPdf" :data="previewUrl" type="application/pdf">
          <AppDocumentLink
            :href="previewUrl"
            viewer-title="PDF attachment"
            label="Open PDF"
            icon="pi pi-file-pdf"
            severity="secondary"
            outlined
          />
        </object>
        <div v-else class="finance-attachment-preview__empty">
          <i class="pi pi-file" aria-hidden="true" />
          <span>{{ fileName }}</span>
        </div>
      </div>

      <div class="finance-attachment-preview__meta">
        <strong>{{ fileName }}</strong>
        <span>{{ mimeType }} · {{ formatBytes(sizeBytes) }}</span>
        <span v-if="createdAt">Uploaded {{ formatDateTime(createdAt) }}</span>
      </div>

      <div class="admin-inline-actions">
        <AppDocumentLink
          :href="previewUrl"
          viewer-title="Attachment"
          icon="pi pi-search-plus"
          label="Open"
          severity="secondary"
          outlined
        />
        <Button
          as="a"
          :href="previewUrl"
          :download="fileName"
          icon="pi pi-download"
          label="Download"
          severity="secondary"
          outlined
        />
        <Button
          v-if="canReplace"
          type="button"
          icon="pi pi-refresh"
          label="Replace"
          severity="secondary"
          outlined
          @click="emit('replace')"
        />
        <Button
          v-if="canRemove"
          type="button"
          icon="pi pi-times"
          label="Remove"
          severity="danger"
          outlined
          @click="emit('remove')"
        />
      </div>
    </template>
  </div>
</template>
