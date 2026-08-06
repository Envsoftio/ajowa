<script setup lang="ts">
import { getApiErrorMessage } from '~/composables/useApi'

definePageMeta({
  layout: 'resident',
  middleware: ['protected'],
  title: 'My Profile',
})

type ResidentProfileResponse = {
  ok: true
  data: {
    id: string
    fullName: string
    email: string | null
    mobileNumber: string | null
    whatsappNumber: string | null
    profileImagePath: string | null
    profileImageUrl: string | null
    updatedAt: string
  }
}

type ResidentPhotoUploadResponse = {
  ok: true
  data: {
    profileImagePath: string
    profileImageUrl: string
    updatedAt: string
  }
}

type FamilyMember = {
  relationshipId: string
  userId: string
  fullName: string
  mobileNumber: string | null
  profileImagePath: string | null
  profileImageUrl: string | null
  flatId: string
  flatLabel: string
  relationshipNote: string | null
  isActive: boolean
  updatedAt: string
}

type FamilyMembersResponse = {
  ok: true
  data: {
    maxMembers: number
    flats: Array<{ id: string; label: string }>
    members: FamilyMember[]
  }
}

type FamilyMemberSaveResponse = {
  ok: true
  data: FamilyMember
}

type FamilyMemberPhotoUploadResponse = {
  ok: true
  data: {
    profileImagePath: string
    profileImageUrl: string
    updatedAt: string
  }
}

const ONE_MEGABYTE = 1024 * 1024
const AVATAR_SIZE = 512
const DEFAULT_CROP_FRAME_SIZE = 320
const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

const api = useApi()
const toast = useToast()
const authStore = useAuthStore()
const fileInput = ref<HTMLInputElement | null>(null)
const familyFileInput = ref<HTMLInputElement | null>(null)
const cropFrame = ref<HTMLElement | null>(null)
const cropImage = ref<HTMLImageElement | null>(null)
const processing = ref(false)
const familySaving = ref(false)
const familyRemovingId = ref('')
const uploadError = ref('')
const familyError = ref('')
const selectedFileName = ref('')
const photoRefreshToken = ref('')
const familyPhotoRefreshToken = ref('')
const cropDialogVisible = ref(false)
const cropImageUrl = ref('')
const cropZoom = ref(1)
const cropFrameSize = ref(DEFAULT_CROP_FRAME_SIZE)
const cropTarget = ref<{ type: 'profile' } | { type: 'family'; userId: string } | null>(null)
const editingFamilyMemberId = ref('')
const cropOffset = reactive({ x: 0, y: 0 })
const cropImageSize = reactive({ width: 0, height: 0 })
const familyForm = reactive({
  flatId: '',
  fullName: '',
  mobileNumber: '',
  relationshipNote: '',
})
const dragState = reactive({
  active: false,
  pointerId: 0,
  startX: 0,
  startY: 0,
  offsetX: 0,
  offsetY: 0,
})

const { data, pending, refresh } = await useAsyncData(
  'my-profile',
  () => api<ResidentProfileResponse>('/api/my/profile'),
)
const { data: familyData, pending: familyPending, refresh: refreshFamilyMembers } = await useAsyncData(
  'my-family-members',
  () => api<FamilyMembersResponse>('/api/my/family-members'),
)

const profile = computed(() => data.value?.data ?? null)
const family = computed(() => familyData.value?.data ?? null)
const familyMembers = computed(() => family.value?.members ?? [])
const familyFlats = computed(() => family.value?.flats ?? [])
const maxFamilyMembers = computed(() => family.value?.maxMembers ?? 5)
const canAddFamilyMember = computed(() => familyMembers.value.length < maxFamilyMembers.value)
const familyFlatOptions = computed(() =>
  familyFlats.value.map((flat) => ({
    label: flat.label,
    value: flat.id,
  })),
)
const photoUrl = computed(() => {
  if (authStore.profilePhotoPreviewUrl) {
    return authStore.profilePhotoPreviewUrl
  }

  const baseUrl = profile.value?.profileImageUrl

  if (!baseUrl) {
    return ''
  }

  if (!photoRefreshToken.value) {
    return baseUrl
  }

  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}r=${encodeURIComponent(photoRefreshToken.value)}`
})
const initials = computed(() =>
  (profile.value?.fullName ?? 'Resident')
    .split(/[\s/]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'R',
)
const contactItems = computed(() => [
  { label: 'Email', value: profile.value?.email },
  { label: 'Mobile', value: profile.value?.mobileNumber },
  { label: 'WhatsApp', value: profile.value?.whatsappNumber },
])
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

const displayValue = (value: string | null | undefined) => value || '-'
const getFamilyInitials = (name: string) =>
  name
    .split(/[\s/]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'F'

const familyMemberPhotoUrl = (member: FamilyMember) => {
  if (!member.profileImageUrl) return ''

  if (!familyPhotoRefreshToken.value) return member.profileImageUrl

  const separator = member.profileImageUrl.includes('?') ? '&' : '?'
  return `${member.profileImageUrl}${separator}r=${encodeURIComponent(familyPhotoRefreshToken.value)}`
}

const resetFamilyForm = () => {
  editingFamilyMemberId.value = ''
  familyForm.flatId = familyFlats.value[0]?.id ?? ''
  familyForm.fullName = ''
  familyForm.mobileNumber = ''
  familyForm.relationshipNote = ''
  familyError.value = ''
}

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
  cropTarget.value = null

  if (cropImageUrl.value) {
    URL.revokeObjectURL(cropImageUrl.value)
    cropImageUrl.value = ''
  }

  resetCropState()

  if (fileInput.value) {
    fileInput.value.value = ''
  }

  if (familyFileInput.value) {
    familyFileInput.value.value = ''
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
    { type: 'image/webp' as const, quality: 0.76 },
    { type: 'image/webp' as const, quality: 0.68 },
    { type: 'image/webp' as const, quality: 0.60 },
    { type: 'image/jpeg' as const, quality: 0.76 },
    { type: 'image/jpeg' as const, quality: 0.68 },
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
  cropTarget.value = { type: 'profile' }
  fileInput.value?.click()
}

const uploadPhoto = async () => {
  uploadError.value = ''
  processing.value = true

  try {
    const roundedFile = await createRoundedProfileImage()
    const formData = new FormData()
    formData.append('file', roundedFile)

    if (cropTarget.value?.type === 'family') {
      const memberId = cropTarget.value.userId
      const response = await api<FamilyMemberPhotoUploadResponse>(`/api/my/family-members/${memberId}/photo`, {
        method: 'POST',
        body: formData,
      })
      const member = familyData.value?.data.members.find((item) => item.userId === memberId)

      if (member) {
        member.profileImagePath = response.data.profileImagePath
        member.profileImageUrl = response.data.profileImageUrl
        member.updatedAt = response.data.updatedAt
      }

      familyPhotoRefreshToken.value = String(Date.now())
      toast.add({
        severity: 'success',
        summary: 'Photo updated',
        detail: 'Family member photo is ready for guard verification.',
        life: 5000,
      })
      closeCropDialog()
      return
    } else {
      const response = await api<ResidentPhotoUploadResponse>('/api/my/profile/photo', {
        method: 'POST',
        body: formData,
      })

      if (data.value?.data) {
        data.value.data.profileImagePath = response.data.profileImagePath
        data.value.data.profileImageUrl = response.data.profileImageUrl
        data.value.data.updatedAt = response.data.updatedAt
      }
      photoRefreshToken.value = String(Date.now())
      authStore.updateProfilePhoto({
        profileImagePath: response.data.profileImagePath,
        updatedAt: response.data.updatedAt,
        previewUrl: URL.createObjectURL(roundedFile),
      })

      toast.add({
        severity: 'success',
        summary: 'Photo updated',
        detail: 'Your rounded profile photo is ready.',
        life: 5000,
      })
      closeCropDialog()
    }
  } catch (error) {
    uploadError.value = getApiErrorMessage(error, 'Photo could not be uploaded.')
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
  selectedFileName.value = file.name

  if (!acceptedImageTypes.has(file.type)) {
    uploadError.value = 'Upload a PNG, JPG, JPEG, or WebP profile photo.'
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

const openFamilyPhotoPicker = (member: FamilyMember) => {
  cropTarget.value = { type: 'family', userId: member.userId }
  familyFileInput.value?.click()
}

const onFamilyPhotoSelected = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) return

  uploadError.value = ''
  selectedFileName.value = file.name

  if (!acceptedImageTypes.has(file.type)) {
    uploadError.value = 'Upload a PNG, JPG, JPEG, or WebP photo.'
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

const editFamilyMember = (member: FamilyMember) => {
  editingFamilyMemberId.value = member.userId
  familyForm.flatId = member.flatId
  familyForm.fullName = member.fullName
  familyForm.mobileNumber = member.mobileNumber ?? ''
  familyForm.relationshipNote = member.relationshipNote ?? ''
  familyError.value = ''
}

const saveFamilyMember = async () => {
  familyError.value = ''

  if (!familyForm.flatId) {
    familyError.value = 'Choose a flat.'
    return
  }

  familySaving.value = true

  try {
    const payload = {
      flatId: familyForm.flatId,
      fullName: familyForm.fullName,
      mobileNumber: familyForm.mobileNumber || null,
      relationshipNote: familyForm.relationshipNote || null,
    }
    const response = editingFamilyMemberId.value
      ? await api<FamilyMemberSaveResponse>(`/api/my/family-members/${editingFamilyMemberId.value}`, {
          method: 'PATCH',
          body: payload,
        })
      : await api<FamilyMemberSaveResponse>('/api/my/family-members', {
          method: 'POST',
          body: payload,
        })

    if (familyData.value?.data) {
      const index = familyData.value.data.members.findIndex((member) => member.userId === response.data.userId)

      if (index >= 0) {
        familyData.value.data.members[index] = response.data
      } else {
        familyData.value.data.members.push(response.data)
      }
    }

    toast.add({
      severity: 'success',
      summary: editingFamilyMemberId.value ? 'Member updated' : 'Member added',
      detail: 'Family access list is updated.',
      life: 5000,
    })
    resetFamilyForm()
  } catch (error) {
    familyError.value = getApiErrorMessage(error, 'Family member could not be saved.')
  } finally {
    familySaving.value = false
  }
}

const removeFamilyMember = async (member: FamilyMember) => {
  if (!window.confirm(`Remove ${member.fullName} from family access?`)) {
    return
  }

  familyRemovingId.value = member.userId
  familyError.value = ''

  try {
    await api(`/api/my/family-members/${member.userId}`, { method: 'DELETE' })

    if (familyData.value?.data) {
      familyData.value.data.members = familyData.value.data.members.filter((item) => item.userId !== member.userId)
    }

    toast.add({
      severity: 'success',
      summary: 'Member removed',
      detail: 'Family member access is inactive now.',
      life: 5000,
    })
    if (editingFamilyMemberId.value === member.userId) {
      resetFamilyForm()
    }
  } catch (error) {
    familyError.value = getApiErrorMessage(error, 'Family member could not be removed.')
  } finally {
    familyRemovingId.value = ''
  }
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
  if (event.pointerId !== dragState.pointerId) {
    return
  }

  dragState.active = false
}

watch(cropZoom, clampCropOffset)
watch(cropDialogVisible, (visible) => {
  if (visible) {
    void nextTick(syncCropFrameSize)
  }
})
watch(familyFlats, (flats) => {
  if (!familyForm.flatId && flats[0]) {
    familyForm.flatId = flats[0].id
  }
}, { immediate: true })

let cropResizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!import.meta.client || typeof ResizeObserver === 'undefined') {
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

  cropResizeObserver?.disconnect()
})
</script>

<template>
  <div class="landing-page">
    <section class="surface-card resident-profile-panel">
      <header class="list-page__header">
        <div>
          <p class="eyebrow">Account</p>
          <h1>My Profile</h1>
          <p>Keep your gate profile photo current for QR verification.</p>
        </div>
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined @click="() => refresh()" />
      </header>

      <AppSkeletonState v-if="pending" />

      <div v-else-if="profile" class="resident-profile-grid">
        <section class="resident-photo-panel">
          <div class="resident-photo-preview">
            <img
              v-if="photoUrl"
              :src="photoUrl"
              :alt="profile.fullName"
              loading="lazy"
              decoding="async"
              fetchpriority="low"
            >
            <span v-else>{{ initials }}</span>
          </div>

          <input
            ref="fileInput"
            class="resident-photo-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            @change="onPhotoSelected"
          >

          <div class="resident-photo-actions">
            <Button
              :label="photoUrl ? 'Replace Photo' : 'Upload Photo'"
              icon="pi pi-upload"
              :loading="processing"
              :disabled="processing"
              @click="openPhotoPicker"
            />
            <span v-if="selectedFileName">{{ selectedFileName }}</span>
          </div>

          <Message v-if="uploadError && !cropDialogVisible" severity="error" :closable="false">
            {{ uploadError }}
          </Message>
          <p class="resident-photo-note">PNG, JPG, or WebP. Crop your photo before upload. The saved profile photo is round, 512px, and must stay under 1 MB.</p>
        </section>

        <section class="resident-profile-details">
          <div class="admin-form-section__header">
            <div>
              <p class="eyebrow">Profile</p>
              <h2>{{ profile.fullName }}</h2>
            </div>
            <Tag value="Resident" severity="success" rounded />
          </div>

          <div class="resident-contact-grid">
            <div v-for="item in contactItems" :key="item.label" class="resident-contact-item">
              <span>{{ item.label }}</span>
              <strong>{{ displayValue(item.value) }}</strong>
            </div>
          </div>
        </section>
      </div>

      <section v-if="profile" class="family-access-panel">
        <header class="admin-form-section__header">
          <div>
            <p class="eyebrow">Family Access</p>
            <h2>Household Members</h2>
          </div>
          <div class="resident-family-actions">
            <Tag :value="`${familyMembers.length}/${maxFamilyMembers}`" severity="info" rounded />
            <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined size="small" @click="() => refreshFamilyMembers()" />
          </div>
        </header>

        <AppSkeletonState v-if="familyPending" />

        <template v-else>
          <Message v-if="!familyFlats.length" severity="warn" :closable="false">
            Family members can be managed after your owner flat link is active.
          </Message>

          <form v-else class="family-member-form" @submit.prevent="saveFamilyMember">
            <div class="family-member-fields">
              <label>
                <span>Flat</span>
                <Select
                  v-model="familyForm.flatId"
                  :options="familyFlatOptions"
                  option-label="label"
                  option-value="value"
                  fluid
                />
              </label>
              <label>
                <span>Name</span>
                <InputText v-model="familyForm.fullName" maxlength="160" fluid />
              </label>
              <label>
                <span>Relation</span>
                <InputText v-model="familyForm.relationshipNote" maxlength="120" placeholder="Spouse, parent, child" fluid />
              </label>
              <label>
                <span>Mobile</span>
                <InputText v-model="familyForm.mobileNumber" maxlength="40" fluid />
              </label>
            </div>

            <Message v-if="familyError" severity="error" :closable="false">
              {{ familyError }}
            </Message>

            <div class="family-member-form__actions">
              <Button
                type="button"
                label="Cancel"
                severity="secondary"
                outlined
                :disabled="familySaving"
                @click="resetFamilyForm"
              />
              <Button
                type="submit"
                :label="editingFamilyMemberId ? 'Update Member' : 'Add Member'"
                icon="pi pi-check"
                :loading="familySaving"
                :disabled="familySaving || (!editingFamilyMemberId && !canAddFamilyMember)"
              />
            </div>
          </form>

          <input
            ref="familyFileInput"
            class="resident-photo-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            @change="onFamilyPhotoSelected"
          >

          <div v-if="familyMembers.length" class="family-member-list">
            <article v-for="member in familyMembers" :key="member.userId" class="family-member-row">
              <div class="family-member-photo">
                <img
                  v-if="familyMemberPhotoUrl(member)"
                  :src="familyMemberPhotoUrl(member)"
                  :alt="member.fullName"
                  loading="lazy"
                  decoding="async"
                >
                <span v-else>{{ getFamilyInitials(member.fullName) }}</span>
              </div>

              <div class="family-member-info">
                <strong>{{ member.fullName }}</strong>
                <span>{{ [member.relationshipNote, member.flatLabel].filter(Boolean).join(' - ') }}</span>
                <small v-if="member.mobileNumber">{{ member.mobileNumber }}</small>
              </div>

              <div class="family-member-row__actions">
                <Button
                  icon="pi pi-image"
                  severity="secondary"
                  text
                  rounded
                  :aria-label="`Upload photo for ${member.fullName}`"
                  @click="openFamilyPhotoPicker(member)"
                />
                <Button
                  icon="pi pi-pencil"
                  severity="secondary"
                  text
                  rounded
                  :aria-label="`Edit ${member.fullName}`"
                  @click="editFamilyMember(member)"
                />
                <Button
                  icon="pi pi-trash"
                  severity="danger"
                  text
                  rounded
                  :loading="familyRemovingId === member.userId"
                  :aria-label="`Remove ${member.fullName}`"
                  @click="removeFamilyMember(member)"
                />
              </div>
            </article>
          </div>

          <AppState
            v-else
            variant="empty"
            title="No family members added"
            message="Add members and upload their photos so guards can verify household access during QR scan."
          />
        </template>
      </section>

      <AppState
        v-else
        variant="error"
        title="Profile unavailable"
        message="Your resident profile could not be loaded."
      />
    </section>

    <Dialog
      v-model:visible="cropDialogVisible"
      modal
      :header="cropTarget?.type === 'family' ? 'Crop Family Photo' : 'Crop Profile Photo'"
      class="p-dialog-custom resident-crop-dialog"
      :style="{ width: 'min(94vw, 32rem)' }"
      @hide="closeCropDialog"
    >
      <div class="resident-cropper">
        <div
          ref="cropFrame"
          class="resident-crop-frame"
          :class="{ 'resident-crop-frame--dragging': dragState.active }"
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
            class="resident-crop-image"
            :style="cropImageStyle"
            draggable="false"
            @load="onCropImageLoaded"
          >
          <div class="resident-crop-mask" aria-hidden="true" />
        </div>

        <label class="resident-crop-control">
          <span>Zoom</span>
          <input v-model.number="cropZoom" type="range" min="1" max="3" step="0.01">
        </label>

        <Message v-if="uploadError" severity="error" :closable="false">
          {{ uploadError }}
        </Message>

        <div class="resident-crop-actions">
          <Button
            label="Cancel"
            severity="secondary"
            outlined
            :disabled="processing"
            @click="closeCropDialog"
          />
          <Button
            label="Save Photo"
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
.resident-profile-panel {
  display: grid;
  gap: 1.5rem;
}

.family-access-panel {
  display: grid;
  gap: 1rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--surface-border);
}

.resident-profile-grid {
  display: grid;
  grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
  gap: 1.5rem;
  align-items: start;
}

.resident-photo-panel,
.resident-profile-details {
  display: grid;
  gap: 1rem;
}

.resident-photo-preview {
  width: min(100%, 280px);
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--surface-border);
  border-radius: 50%;
  background: var(--surface-ground);
  color: var(--text-color-secondary);
  font-size: 4rem;
  font-weight: 700;
}

.resident-photo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.resident-photo-input {
  display: none;
}

.resident-photo-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.resident-photo-actions span,
.resident-photo-note {
  color: var(--text-color-secondary);
  font-size: 0.9rem;
}

.resident-photo-note {
  margin: 0;
}

.resident-family-actions,
.family-member-form__actions,
.family-member-row__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.family-member-form {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md, 8px);
  background: var(--surface-ground);
}

.family-member-fields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.85rem;
}

.family-member-fields label {
  display: grid;
  gap: 0.4rem;
  min-width: 0;
}

.family-member-fields label span {
  color: var(--text-color-secondary);
  font-size: 0.82rem;
  font-weight: 600;
  text-transform: uppercase;
}

.family-member-form__actions {
  justify-content: flex-end;
}

.family-member-list {
  display: grid;
  gap: 0.75rem;
}

.family-member-row {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr) auto;
  gap: 0.85rem;
  align-items: center;
  padding: 0.85rem;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md, 8px);
  background: var(--surface-card);
}

.family-member-photo {
  width: 4rem;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--surface-border);
  border-radius: 50%;
  background: var(--surface-ground);
  color: var(--text-color-secondary);
  font-size: 1.1rem;
  font-weight: 700;
}

.family-member-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.family-member-info {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}

.family-member-info strong,
.family-member-info span,
.family-member-info small {
  overflow-wrap: anywhere;
}

.family-member-info span,
.family-member-info small {
  color: var(--text-color-secondary);
}

.family-member-info small {
  font-size: 0.82rem;
}

.resident-contact-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.resident-contact-item {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
  padding: 0.85rem;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md, 8px);
  background: var(--surface-ground);
}

.resident-contact-item span {
  color: var(--text-color-secondary);
  font-size: 0.82rem;
  font-weight: 600;
  text-transform: uppercase;
}

.resident-contact-item strong {
  overflow-wrap: anywhere;
  color: var(--text-color);
  font-size: 1rem;
  line-height: 1.35;
}

.resident-cropper {
  display: grid;
  gap: 1rem;
  max-height: min(76vh, 38rem);
  overflow: auto;
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.resident-crop-frame {
  position: relative;
  width: min(100%, 320px, calc(100vw - 4rem));
  aspect-ratio: 1;
  margin: 0 auto;
  overflow: hidden;
  border-radius: var(--radius-md, 8px);
  background: var(--surface-ground);
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.resident-crop-frame--dragging {
  cursor: grabbing;
}

.resident-crop-image {
  position: absolute;
  top: 50%;
  left: 50%;
  max-width: none;
  object-fit: cover;
  transform-origin: center;
  will-change: transform;
}

.resident-crop-mask {
  position: absolute;
  inset: 0;
  border: 999px solid color-mix(in srgb, var(--surface-card) 68%, transparent);
  border-radius: 50%;
  box-shadow:
    inset 0 0 0 2px var(--primary-color),
    0 0 0 1px var(--surface-border);
  pointer-events: none;
}

.resident-crop-control {
  display: grid;
  gap: 0.4rem;
}

.resident-crop-control span {
  color: var(--text-color-secondary);
  font-size: 0.85rem;
  font-weight: 600;
}

.resident-crop-control input {
  width: 100%;
}

.resident-crop-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem;
}

@media (max-width: 768px) {
  .resident-profile-grid {
    grid-template-columns: 1fr;
  }

  .resident-photo-preview {
    max-width: 220px;
  }

  .resident-contact-grid {
    grid-template-columns: 1fr;
  }

  .resident-family-actions,
  .family-member-form__actions {
    justify-content: stretch;
  }

  .resident-family-actions :deep(.p-button),
  .family-member-form__actions :deep(.p-button) {
    flex: 1 1 9rem;
  }

  .family-member-fields {
    grid-template-columns: 1fr;
  }

  .family-member-row {
    grid-template-columns: 3.5rem minmax(0, 1fr);
  }

  .family-member-photo {
    width: 3.5rem;
  }

  .family-member-row__actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }

  .resident-cropper {
    max-height: min(72vh, 34rem);
  }

  .resident-crop-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .resident-crop-actions :deep(.p-button) {
    width: 100%;
  }
}
</style>
