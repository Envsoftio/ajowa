<script setup lang="ts">
import type { LocalFinanceAttachment } from '~/composables/useFinanceAttachments'

defineProps<{
  attachment: LocalFinanceAttachment | null
  required?: boolean
}>()

const emit = defineEmits<{
  selected: [file: File]
  remove: []
}>()

const fileInput = ref<HTMLInputElement | null>(null)

const pickFile = () => {
  fileInput.value?.click()
}

const onFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    emit('selected', file)
  }
  target.value = ''
}
</script>

<template>
  <section class="finance-upload-card">
    <div class="finance-upload-card__header">
      <div>
        <p class="eyebrow">Attachment</p>
        <h3>{{ required ? 'Invoice required' : 'Supporting document' }}</h3>
      </div>
      <Button
        type="button"
        icon="pi pi-upload"
        :label="attachment ? 'Replace' : 'Upload'"
        severity="secondary"
        outlined
        @click="pickFile"
      />
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="application/pdf,image/jpeg,image/png"
      class="finance-upload-card__input"
      @change="onFileChange"
    >

    <AttachmentPreview
      :attachment="attachment"
      :can-remove="Boolean(attachment)"
      @replace="pickFile"
      @remove="emit('remove')"
    />
  </section>
</template>
