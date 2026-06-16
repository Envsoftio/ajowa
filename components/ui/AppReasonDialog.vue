<script setup lang="ts">
const visible = defineModel<boolean>('visible', { required: true })
const reason = defineModel<string>('reason', { required: true })

withDefaults(
  defineProps<{
    header: string
    message: string
    acceptLabel?: string
    acceptSeverity?: 'secondary' | 'success' | 'info' | 'warn' | 'help' | 'danger' | 'contrast'
    placeholder?: string
  }>(),
  {
    acceptLabel: 'Continue',
    acceptSeverity: 'danger',
    placeholder: 'Enter reason',
  },
)

const emit = defineEmits<{
  accept: []
  cancel: []
}>()

const submit = () => {
  if (!reason.value.trim()) return
  emit('accept')
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="header"
    :style="{ width: '460px', maxWidth: '95vw' }"
    @hide="emit('cancel')"
  >
    <form class="admin-form-layout" style="padding-top: 0.75rem;" @submit.prevent="submit">
      <p>{{ message }}</p>
      <Textarea
        v-model="reason"
        rows="4"
        auto-resize
        fluid
        autofocus
        :placeholder="placeholder"
      />
      <div class="admin-inline-actions" style="justify-content: flex-end; gap: 0.75rem;">
        <Button type="button" label="Cancel" severity="secondary" outlined @click="emit('cancel')" />
        <Button type="submit" :label="acceptLabel" :severity="acceptSeverity" :disabled="!reason.trim()" />
      </div>
    </form>
  </Dialog>
</template>
