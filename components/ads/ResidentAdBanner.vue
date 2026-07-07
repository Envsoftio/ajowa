<script setup lang="ts">
import type { AdEventType, ResidentAdSlotKey } from '~/shared/ads'
import type { ResidentAdItem } from '~/types/ads'

const props = defineProps<{
  slotKey: ResidentAdSlotKey
}>()

type AdsResponse = {
  ok: true
  data: {
    items: ResidentAdItem[]
  }
}

const api = useApi()
const route = useRoute()
const bannerRef = ref<HTMLElement | null>(null)
const trackedImpressionIds = ref(new Set<string>())
const failedImageCreativeIds = ref(new Set<string>())
let observer: IntersectionObserver | null = null

const { data, pending } = await useAsyncData(
  () => `resident-ad-${props.slotKey}`,
  () =>
    api<AdsResponse>('/api/my/ads', {
      query: { slot: props.slotKey },
      showErrorToast: false,
    }),
)

const ad = computed(() => {
  const item = data.value?.data.items[0] ?? null

  if (!item || failedImageCreativeIds.value.has(item.creativeId)) {
    return null
  }

  return item
})

const eventPayload = (item: ResidentAdItem, eventType: AdEventType) => ({
  creativeId: item.creativeId,
  eventType,
  slotKey: item.slotKey,
  pagePath: route.path,
  metadata: {
    routeName: String(route.name ?? ''),
  },
})

const sendAdEvent = async (eventType: AdEventType, item = ad.value) => {
  if (!item || !import.meta.client) {
    return
  }

  const payload = eventPayload(item, eventType)
  const body = JSON.stringify(payload)

  if (navigator.sendBeacon) {
    const sent = navigator.sendBeacon(
      '/api/my/ads/events',
      new Blob([body], { type: 'application/json' }),
    )

    if (sent) {
      return
    }
  }

  await api('/api/my/ads/events', {
    method: 'POST',
    body: payload,
    keepalive: true,
    showErrorToast: false,
  })
}

const trackImpression = async (item: ResidentAdItem) => {
  if (trackedImpressionIds.value.has(item.creativeId)) {
    return
  }

  trackedImpressionIds.value.add(item.creativeId)

  try {
    await sendAdEvent('IMPRESSION', item)
  } catch {
    trackedImpressionIds.value.delete(item.creativeId)
  }
}

const disconnectObserver = () => {
  observer?.disconnect()
  observer = null
}

const observeVisibility = () => {
  disconnectObserver()

  if (!import.meta.client || !ad.value || !bannerRef.value) {
    return
  }

  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.some((entry) => entry.isIntersecting)

      if (visible && ad.value) {
        void trackImpression(ad.value)
      }
    },
    { threshold: 0.5 },
  )
  observer.observe(bannerRef.value)
}

const handleClick = () => {
  const item = ad.value

  if (!item || !import.meta.client) {
    return
  }

  void sendAdEvent('CLICK', item)
  window.open(item.destinationUrl, '_blank', 'noopener,noreferrer')
}

const handleImageError = () => {
  const item = ad.value

  if (!item) {
    return
  }

  failedImageCreativeIds.value = new Set([
    ...Array.from(failedImageCreativeIds.value),
    item.creativeId,
  ])
}

watch(ad, () => {
  nextTick(observeVisibility)
})

onMounted(observeVisibility)
onBeforeUnmount(disconnectObserver)
</script>

<template>
  <aside
    v-if="ad && !pending"
    ref="bannerRef"
    class="resident-ad-banner"
    :aria-label="`${ad.sponsorLabel}: ${ad.title}`"
  >
    <button
      class="resident-ad-banner__media"
      type="button"
      @click="handleClick"
    >
      <!-- eslint-disable vue/html-self-closing -->
      <img
        :src="ad.imageUrl"
        :alt="ad.imageAlt"
        loading="lazy"
        @error="handleImageError"
      />
      <!-- eslint-enable vue/html-self-closing -->
    </button>

    <div class="resident-ad-banner__body">
      <span class="resident-ad-banner__label">{{ ad.sponsorLabel }}</span>
      <div>
        <h2>{{ ad.title }}</h2>
        <p v-if="ad.body">{{ ad.body }}</p>
      </div>
      <div class="resident-ad-banner__actions">
        <Button
          :label="ad.ctaLabel || 'Learn more'"
          icon="pi pi-external-link"
          size="small"
          @click="handleClick"
        />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.resident-ad-banner {
  --resident-ad-radius: var(--radius-lg, 8px);

  display: grid;
  grid-template-columns: minmax(160px, 34%) 1fr;
  gap: 1rem;
  align-items: stretch;
  margin-block: 0.75rem clamp(1rem, 2vw, 1.35rem);
  overflow: clip;
  border: 1px solid
    color-mix(in srgb, var(--primary-color) 16%, var(--surface-border));
  border-radius: var(--resident-ad-radius);
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--primary-color) 7%, transparent),
      transparent 42%
    ),
    var(--surface-card);
  box-shadow: var(--card-shadow);
  clip-path: inset(0 round var(--resident-ad-radius));
}

.resident-ad-banner__media {
  display: block;
  min-height: 150px;
  padding: 0;
  border: 0;
  border-radius: var(--resident-ad-radius) 0 0 var(--resident-ad-radius);
  background: var(--surface-100);
  cursor: pointer;
  overflow: hidden;
}

.resident-ad-banner__media img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 150px;
  aspect-ratio: 5 / 2;
  object-fit: cover;
}

.resident-ad-banner__body {
  display: grid;
  gap: 0.75rem;
  align-content: center;
  border-radius: 0 var(--resident-ad-radius) var(--resident-ad-radius) 0;
  padding: clamp(1rem, 2vw, 1.25rem) clamp(1rem, 2vw, 1.25rem)
    clamp(1rem, 2vw, 1.25rem) 0;
}

.resident-ad-banner__label {
  width: fit-content;
  border: 1px solid
    color-mix(in srgb, var(--primary-color) 18%, var(--surface-border));
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  color: var(--text-color-secondary);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
}

.resident-ad-banner__body h2 {
  margin: 0;
  color: var(--text-color);
  font-size: 1.15rem;
  line-height: 1.25;
}

.resident-ad-banner__body p {
  max-width: 56ch;
  margin: 0.25rem 0 0;
  color: var(--text-color-secondary);
  line-height: 1.5;
}

.resident-ad-banner__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

@media (max-width: 700px) {
  .resident-ad-banner {
    grid-template-columns: 1fr;
    margin-block: 0.75rem 1rem;
  }

  .resident-ad-banner__body {
    border-radius: 0 0 var(--resident-ad-radius) var(--resident-ad-radius);
    padding: 0 1rem 1rem;
  }

  .resident-ad-banner__media {
    min-height: 140px;
    border-radius: var(--resident-ad-radius) var(--resident-ad-radius) 0 0;
  }

  .resident-ad-banner__media img {
    min-height: 140px;
  }
}
</style>
