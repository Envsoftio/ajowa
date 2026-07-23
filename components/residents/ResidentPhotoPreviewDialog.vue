<script setup lang="ts">
const {
  residentPhotoPreview,
  closeResidentPhotoPreview,
} = useResidentPhotoPreview()

const visible = computed({
  get: () => residentPhotoPreview.value.visible,
  set: (value: boolean) => {
    if (!value) {
      closeResidentPhotoPreview()
    }
  },
})

const dialogTitle = computed(
  () => `${residentPhotoPreview.value.name || 'Resident'} profile photo`,
)
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    dismissable-mask
    :header="dialogTitle"
    class="resident-photo-preview-dialog"
    :style="{ width: 'min(94vw, 42rem)' }"
  >
    <div class="resident-photo-preview-dialog__body">
      <img
        v-if="residentPhotoPreview.src"
        :src="residentPhotoPreview.src"
        :alt="dialogTitle"
        decoding="async"
      >
    </div>
  </Dialog>
</template>

<style scoped>
.resident-photo-preview-dialog__body {
  display: grid;
  place-items: center;
  min-height: min(70vw, 18rem);
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.resident-photo-preview-dialog__body img {
  width: min(100%, 32rem);
  max-height: min(72dvh, 32rem);
  aspect-ratio: 1;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  object-fit: cover;
  background: var(--color-surface-strong);
}
</style>
