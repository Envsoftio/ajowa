<script setup lang="ts">
import type { NotificationSummaryItem } from '~/stores/notifications'

const toast = useToast()
const authStore = useAuthStore()
const notificationsStore = useNotificationsStore()
const notificationSound = useNotificationSound()

let soundUnlocked = false
let refreshAfterPushTimer: ReturnType<typeof setTimeout> | null = null

type PushNotificationPayload = {
  title?: unknown
  body?: unknown
  priority?: unknown
}

const toastSeverity = (priority: string) => {
  if (priority === 'EMERGENCY') return 'error'
  if (priority === 'HIGH') return 'warn'
  return 'info'
}

const showNotificationToast = async (
  item: Pick<NotificationSummaryItem, 'title' | 'body' | 'priority'>,
) => {
  toast.add({
    severity: toastSeverity(item.priority),
    summary: item.title,
    detail: item.body,
    life: item.priority === 'EMERGENCY' ? 15000 : 8000,
  })

  if (notificationsStore.soundEnabled) {
    await notificationSound.play(item.priority)
  }
}

const showPushToast = async (payload: PushNotificationPayload | undefined) => {
  if (document.visibilityState !== 'visible') {
    return
  }

  await showNotificationToast({
    title: typeof payload?.title === 'string' ? payload.title : 'AJOWA',
    body: typeof payload?.body === 'string' ? payload.body : '',
    priority: typeof payload?.priority === 'string' ? payload.priority : 'MEDIUM',
  })
}

const refreshNotifications = async (options: { notifyNew?: boolean; force?: boolean } = {}) => {
  try {
    const result = await notificationsStore.refresh(options)
    if (result.isNew && result.newest) {
      await showNotificationToast(result.newest)
    }
  } catch {
    // Live notification updates are progressive enhancement; the dashboard still works.
  }
}

const unlockSound = async () => {
  if (soundUnlocked) return
  soundUnlocked = await notificationSound.unlock()
}

const bindSoundUnlock = () => {
  window.addEventListener('pointerdown', unlockSound, { once: true, passive: true })
  window.addEventListener('keydown', unlockSound, { once: true })
  window.addEventListener('touchstart', unlockSound, { once: true, passive: true })
}

const unbindSoundUnlock = () => {
  window.removeEventListener('pointerdown', unlockSound)
  window.removeEventListener('keydown', unlockSound)
  window.removeEventListener('touchstart', unlockSound)
}

const handlePushMessage = (event: MessageEvent) => {
  if (event.data?.type !== 'AJOWA_PUSH_NOTIFICATION') {
    return
  }
  if (!authStore.isAuthenticated) {
    return
  }

  void showPushToast(event.data.payload)
  void refreshNotifications({ force: true })

  if (refreshAfterPushTimer) {
    clearTimeout(refreshAfterPushTimer)
  }
  refreshAfterPushTimer = setTimeout(() => {
    refreshAfterPushTimer = null
    void refreshNotifications({ force: true })
  }, 1500)
}

const start = () => {
  if (!authStore.isAuthenticated) return

  notificationsStore.hydrateSoundPreference()
  bindSoundUnlock()
  void refreshNotifications({ force: !notificationsStore.loaded })
  navigator.serviceWorker?.addEventListener('message', handlePushMessage)
}

const stop = () => {
  navigator.serviceWorker?.removeEventListener('message', handlePushMessage)
  if (refreshAfterPushTimer) {
    clearTimeout(refreshAfterPushTimer)
    refreshAfterPushTimer = null
  }
  unbindSoundUnlock()
  notificationsStore.reset()
}

watch(
  () => authStore.isAuthenticated,
  (isAuthenticated) => {
    if (isAuthenticated) {
      start()
    } else {
      stop()
    }
  },
  { immediate: true },
)

onBeforeUnmount(stop)
</script>

<template>
  <span hidden aria-hidden="true" />
</template>
