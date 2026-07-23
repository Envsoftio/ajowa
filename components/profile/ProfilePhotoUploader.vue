<script setup lang="ts">
import { getApiErrorMessage } from '~/composables/useApi'
import ResidentAvatar from '~/components/residents/ResidentAvatar.vue'

const props = defineProps<{
  name: string
  userId?: string | null
  profileImagePath?: string | null
  updatedAt?: string | null
  uploadUrl?: string | null
  imageUrl?: string | null
}>()

const emit = defineEmits<{
  uploaded: [payload: {
    profileImagePath: string
    profileImageUrl: string
    updatedAt: string
  }]
  selected: [file: File]
}>()

type PhotoUploadResponse = {
  ok: true
  data: {
    profileImagePath: string
    profileImageUrl: string
    updatedAt: string
  }
}

const ONE_MEGABYTE = 1024 * 1024
const MAX_SOURCE_SIZE = 12 * 1024 * 1024
const AVATAR_SIZE = 512
const DEFAULT_CROP_FRAME_SIZE = 320
const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

const api = useApi()
const toast = useToast()
const fileInput = ref<HTMLInputElement | null>(null)
const cropFrame = ref<HTMLElement | null>(null)
const cropImage = ref<HTMLImageElement | null>(null)
const processing = ref(false)
const uploadError = ref('')
const cropDialogVisible = ref(false)
const cropImageUrl = ref('')
const cropZoom = ref(1)
const cropFrameSize = ref(DEFAULT_CROP_FRAME_SIZE)
const currentImageUrl = ref('')
const cropOffset = reactive({ x: 0, y: 0 })
const cropImageSize = reactive({ width: 0, height: 0 })
const dragState = reactive({
  active: false,
  pointerId: 0,
  startX: 0,
  startY: 0,
  offsetX: 0,
  offsetY: 0,
})

const displayedImageUrl = computed(() => currentImageUrl.value || props.imageUrl || '')
const imageAspectRatio = computed(() =>
  cropImageSize.height > 0 ? cropImageSize.width / cropImageSize.height : 1,
)
const cropBaseSize = computed(() => {
  const aspectRatio = imageAspectRatio.value

  return aspectRatio >= 1
    ? {
        width: cropFrameSize.value * aspectRatio,
        height: cropFrameSize.value,
      }
    : {
        width: cropFrameSize.value,
        height: cropFrameSize.value / aspectRatio,
      }
})
const cropDisplayedSize = computed(() => ({
  width: cropBaseSize.value.width * cropZoom.value,
  height: cropBaseSize.value.height * cropZoom.value,
}))
const cropImageStyle = computed(() => ({
  width: `${cropBaseSize.value.width}px`,
  height: `${cropBaseSize.value.height}px`,
  transform: `translate(calc(-50% + ${cropOffset.x}px), calc(-50% + ${cropOffset.y}px)) scale(${cropZoom.value})`,
}))

const blobFromCanvas = (
  canvas: HTMLCanvasElement,
  type: 'image/webp' | 'image/jpeg',
  quality: number,
) =>
  new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality)
  })

const clampCropOffset = () => {
  const frameSize = cropFrameSize.value
  const maxX = Math.max(0, (cropDisplayedSize.value.width - frameSize) / 2)
  const maxY = Math.max(0, (cropDisplayedSize.value.height - frameSize) / 2)

  cropOffset.x = Math.min(maxX, Math.max(-maxX, cropOffset.x))
  cropOffset.y = Math.min(maxY, Math.max(-maxY, cropOffset.y))
}

const syncCropFrameSize = () => {
  const size = cropFrame.value?.clientWidth ?? DEFAULT_CROP_FRAME_SIZE

  cropFrameSize.value = Math.max(240, Math.min(DEFAULT_CROP_FRAME_SIZE, Math.round(size)))
  clampCropOffset()
}

const resetCropState = () => {
  cropZoom.value = 1
  cropOffset.x = 0
  cropOffset.y = 0
  cropImageSize.width = 0
  cropImageSize.height = 0
  dragState.active = false
}

const closeCropDialog = () => {
  cropDialogVisible.value = false

  if (cropImageUrl.value) {
    URL.revokeObjectURL(cropImageUrl.value)
    cropImageUrl.value = ''
  }

  resetCropState()

  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const createRoundedProfileImage = async () => {
  const image = cropImage.value

  if (!image || cropImageSize.width <= 0 || cropImageSize.height <= 0) {
    throw new Error('Choose an image before uploading.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Unable to prepare the image crop.')
  }

  const frameSize = cropFrameSize.value
  const displayedWidth = cropDisplayedSize.value.width
  const displayedHeight = cropDisplayedSize.value.height
  const imageLeft = (frameSize - displayedWidth) / 2 + cropOffset.x
  const imageTop = (frameSize - displayedHeight) / 2 + cropOffset.y
  const sourceX = Math.max(0, (-imageLeft / displayedWidth) * cropImageSize.width)
  const sourceY = Math.max(0, (-imageTop / displayedHeight) * cropImageSize.height)
  const sourceWidth = Math.min(
    cropImageSize.width - sourceX,
    (frameSize / displayedWidth) * cropImageSize.width,
  )
  const sourceHeight = Math.min(
    cropImageSize.height - sourceY,
    (frameSize / displayedHeight) * cropImageSize.height,
  )

  context.clearRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
  context.save()
  context.beginPath()
  context.arc(AVATAR_SIZE / 2, AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2)
  context.clip()
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  )
  context.restore()

  const attempts = [
    { type: 'image/webp' as const, quality: 0.82 },
    { type: 'image/webp' as const, quality: 0.72 },
    { type: 'image/webp' as const, quality: 0.62 },
    { type: 'image/jpeg' as const, quality: 0.82 },
    { type: 'image/jpeg' as const, quality: 0.72 },
  ]

  for (const attempt of attempts) {
    const blob = await blobFromCanvas(canvas, attempt.type, attempt.quality)

    if (blob && blob.size <= ONE_MEGABYTE) {
      const extension = blob.type === 'image/webp' ? 'webp' : 'jpg'
      return new File([blob], `profile-photo.${extension}`, { type: blob.type })
    }
  }

  throw new Error('Profile photo must be 1 MB or smaller after cropping.')
}

const openPhotoPicker = () => {
  fileInput.value?.click()
}

const uploadPhoto = async () => {
  uploadError.value = ''
  processing.value = true

  try {
    const roundedFile = await createRoundedProfileImage()

    if (!props.uploadUrl) {
      if (currentImageUrl.value.startsWith('blob:')) {
        URL.revokeObjectURL(currentImageUrl.value)
      }

      currentImageUrl.value = URL.createObjectURL(roundedFile)
      emit('selected', roundedFile)
      toast.add({
        severity: 'info',
        summary: 'Photo ready',
        detail: 'Save the staff member to upload this profile photo.',
        life: 5000,
      })
      closeCropDialog()
      return
    }

    const formData = new FormData()
    formData.append('file', roundedFile)
    const response = await api<PhotoUploadResponse>(props.uploadUrl, {
      method: 'POST',
      body: formData,
    })

    currentImageUrl.value = `${response.data.profileImageUrl}&r=${Date.now()}`
    emit('uploaded', response.data)
    toast.add({
      severity: 'success',
      summary: 'Photo updated',
      detail: `${props.name}'s profile photo is ready.`,
      life: 5000,
    })
    closeCropDialog()
  } catch (error) {
    uploadError.value = getApiErrorMessage(error, 'Profile photo could not be uploaded.')
  } finally {
    processing.value = false
  }
}

const onPhotoSelected = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) {
    return
  }

  uploadError.value = ''

  if (!acceptedImageTypes.has(file.type)) {
    uploadError.value = 'Upload a PNG, JPG, JPEG, or WebP profile photo.'
    input.value = ''
    return
  }

  if (file.size <= 0 || file.size > MAX_SOURCE_SIZE) {
    uploadError.value = 'Choose an image that is 12 MB or smaller before cropping.'
    input.value = ''
    return
  }

  if (cropImageUrl.value) {
    URL.revokeObjectURL(cropImageUrl.value)
  }

  resetCropState()
  cropImageUrl.value = URL.createObjectURL(file)
  cropDialogVisible.value = true
  void nextTick(syncCropFrameSize)
}

const onCropImageLoaded = () => {
  const image = cropImage.value

  if (!image) {
    return
  }

  cropImageSize.width = image.naturalWidth
  cropImageSize.height = image.naturalHeight
  clampCropOffset()
}

const startCropDrag = (event: PointerEvent) => {
  dragState.active = true
  dragState.pointerId = event.pointerId
  dragState.startX = event.clientX
  dragState.startY = event.clientY
  dragState.offsetX = cropOffset.x
  dragState.offsetY = cropOffset.y
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

const moveCropDrag = (event: PointerEvent) => {
  if (!dragState.active || event.pointerId !== dragState.pointerId) {
    return
  }

  cropOffset.x = dragState.offsetX + event.clientX - dragState.startX
  cropOffset.y = dragState.offsetY + event.clientY - dragState.startY
  clampCropOffset()
}

const endCropDrag = (event: PointerEvent) => {
  if (event.pointerId === dragState.pointerId) {
    dragState.active = false
  }
}

watch(cropZoom, clampCropOffset)
watch(() => props.imageUrl, () => {
  if (currentImageUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(currentImageUrl.value)
  }

  currentImageUrl.value = ''
})
watch(cropDialogVisible, (visible) => {
  if (visible) {
    void nextTick(syncCropFrameSize)
  }
})

let cropResizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (typeof ResizeObserver === 'undefined') {
    return
  }

  cropResizeObserver = new ResizeObserver(syncCropFrameSize)
  watch(
    cropFrame,
    (element, previousElement) => {
      if (previousElement) {
        cropResizeObserver?.unobserve(previousElement)
      }

      if (element) {
        cropResizeObserver?.observe(element)
        syncCropFrameSize()
      }
    },
    { immediate: true },
  )
})

onBeforeUnmount(() => {
  if (cropImageUrl.value) {
    URL.revokeObjectURL(cropImageUrl.value)
  }

  if (currentImageUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(currentImageUrl.value)
  }

  cropResizeObserver?.disconnect()
})
</script>

<template>
  <div class="profile-photo-uploader">
    <ResidentAvatar
      :name="name"
      :resident-id="userId ?? null"
      :profile-image-path="profileImagePath ?? null"
      :updated-at="updatedAt ?? null"
      :src="displayedImageUrl"
      :size="112"
      previewable
    />
    <input
      ref="fileInput"
      class="profile-photo-uploader__input"
      type="file"
      accept="image/png,image/jpeg,image/webp"
      @change="onPhotoSelected"
    >
    <div class="profile-photo-uploader__actions">
      <Button
        type="button"
        :label="displayedImageUrl ? 'Replace photo' : 'Upload photo'"
        icon="pi pi-upload"
        :loading="processing"
        :disabled="processing"
        @click="openPhotoPicker"
      />
      <p>PNG, JPG, or WebP. The cropped 512px photo must be under 1 MB.</p>
    </div>
    <Message v-if="uploadError && !cropDialogVisible" severity="error" :closable="false">
      {{ uploadError }}
    </Message>

    <Dialog
      v-model:visible="cropDialogVisible"
      modal
      header="Crop Profile Photo"
      class="p-dialog-custom profile-photo-crop-dialog"
      :closable="!processing"
      :dismissable-mask="!processing"
      :style="{ width: 'min(94vw, 32rem)' }"
      @hide="closeCropDialog"
    >
      <div class="profile-photo-cropper">
        <div
          ref="cropFrame"
          class="profile-photo-cropper__frame"
          :class="{ 'profile-photo-cropper__frame--dragging': dragState.active }"
          @pointerdown="startCropDrag"
          @pointermove="moveCropDrag"
          @pointerup="endCropDrag"
          @pointercancel="endCropDrag"
        >
          <img
            v-if="cropImageUrl"
            ref="cropImage"
            :src="cropImageUrl"
            alt="Selected profile photo"
            class="profile-photo-cropper__image"
            :style="cropImageStyle"
            draggable="false"
            @load="onCropImageLoaded"
          >
          <div class="profile-photo-cropper__mask" aria-hidden="true" />
        </div>

        <label class="profile-photo-cropper__control">
          <span>Zoom</span>
          <input v-model.number="cropZoom" type="range" min="1" max="3" step="0.01">
        </label>

        <Message v-if="uploadError" severity="error" :closable="false">
          {{ uploadError }}
        </Message>

        <div class="profile-photo-cropper__actions">
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            outlined
            :disabled="processing"
            @click="closeCropDialog"
          />
          <Button
            type="button"
            label="Save photo"
            icon="pi pi-check"
            :loading="processing"
            :disabled="processing || !cropImageUrl"
            @click="uploadPhoto"
          />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.profile-photo-uploader {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.profile-photo-uploader__input {
  display: none;
}

.profile-photo-uploader__actions {
  display: grid;
  justify-items: start;
  gap: 0.45rem;
  min-width: 0;
}

.profile-photo-uploader__actions p {
  max-width: 28rem;
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.82rem;
}

.profile-photo-uploader :deep(.p-message) {
  flex-basis: 100%;
}

.profile-photo-cropper {
  display: grid;
  gap: 1.25rem;
  padding-top: 0.5rem;
}

.profile-photo-cropper__frame {
  position: relative;
  width: min(100%, 320px);
  aspect-ratio: 1;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 4px;
  background: #111827;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.profile-photo-cropper__frame--dragging {
  cursor: grabbing;
}

.profile-photo-cropper__image {
  position: absolute;
  top: 50%;
  left: 50%;
  max-width: none;
  transform-origin: center;
  pointer-events: none;
}

.profile-photo-cropper__mask {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  box-shadow: 0 0 0 999px rgb(0 0 0 / 58%);
  pointer-events: none;
}

.profile-photo-cropper__control {
  display: grid;
  gap: 0.55rem;
}

.profile-photo-cropper__control span {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  font-weight: 700;
}

.profile-photo-cropper__control input {
  width: 100%;
}

.profile-photo-cropper__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

@media (max-width: 520px) {
  .profile-photo-uploader {
    align-items: flex-start;
  }

  .profile-photo-cropper {
    gap: 1rem;
  }

  .profile-photo-cropper__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .profile-photo-cropper__actions :deep(.p-button) {
    width: 100%;
  }
}
</style>
