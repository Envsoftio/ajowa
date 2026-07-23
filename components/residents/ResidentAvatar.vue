<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    name: string | null | undefined
    residentId?: string | null
    profileImagePath?: string | null
    hasImage?: boolean
    updatedAt?: string | null
    src?: string | null
    size?: number
    previewable?: boolean
  }>(),
  {
    residentId: null,
    profileImagePath: null,
    hasImage: false,
    updatedAt: null,
    src: null,
    size: 40,
    previewable: false,
  },
)

const imageFailed = ref(false)
const { openResidentPhotoPreview } = useResidentPhotoPreview()

const initials = computed(() => {
  const parts = (props.name || 'Resident')
    .split(/[\s/]+/)
    .filter(Boolean)
    .slice(0, 2)

  return parts.map((part) => part[0]?.toUpperCase()).join('') || 'R'
})

const imageUrl = computed(() => {
  if (props.src) {
    return props.src
  }

  if (!props.residentId || (!props.profileImagePath && !props.hasImage)) {
    return ''
  }

  const version = props.updatedAt || props.profileImagePath || 'profile'

  return `/api/admin/residents/${props.residentId}/files/profileImagePath?v=${encodeURIComponent(version)}`
})

const avatarStyle = computed(() => ({
  '--resident-avatar-size': `${props.size}px`,
  '--resident-avatar-font-size': `${Math.max(12, Math.min(props.size * 0.28, 24))}px`,
}))

const canPreview = computed(
  () => props.previewable && Boolean(imageUrl.value) && !imageFailed.value,
)

const openPreview = (event: MouseEvent) => {
  if (!canPreview.value) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  openResidentPhotoPreview({
    src: imageUrl.value,
    name: props.name,
  })
}

watch(imageUrl, () => {
  imageFailed.value = false
})
</script>

<template>
  <component
    :is="canPreview ? 'button' : 'span'"
    class="resident-avatar"
    :class="{ 'resident-avatar--previewable': canPreview }"
    :style="avatarStyle"
    :type="canPreview ? 'button' : undefined"
    :role="canPreview ? undefined : 'img'"
    :aria-label="
      canPreview
        ? `Preview ${name || 'resident'} profile photo`
        : `${name || 'Resident'} profile photo`
    "
    :title="canPreview ? 'Preview profile photo' : undefined"
    @click="openPreview"
  >
    <img
      v-if="imageUrl && !imageFailed"
      :src="imageUrl"
      :alt="name || 'Resident'"
      loading="lazy"
      decoding="async"
      fetchpriority="low"
      @error="imageFailed = true"
    >
    <span v-else aria-hidden="true">{{ initials }}</span>
  </component>
</template>

<style scoped>
.resident-avatar {
  width: var(--resident-avatar-size);
  height: var(--resident-avatar-size);
  min-width: var(--resident-avatar-size);
  overflow: hidden;
  display: inline-grid;
  place-items: center;
  flex: 0 0 var(--resident-avatar-size);
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface-strong);
  color: var(--color-brand-strong);
  font-size: var(--resident-avatar-font-size);
  font-weight: 800;
  line-height: 1;
  vertical-align: middle;
}

.resident-avatar--previewable {
  position: relative;
  z-index: 2;
  padding: 0;
  appearance: none;
  cursor: zoom-in;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.resident-avatar--previewable:hover,
.resident-avatar--previewable:focus-visible {
  border-color: var(--color-brand);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-brand) 18%, transparent);
  outline: none;
}

.resident-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
