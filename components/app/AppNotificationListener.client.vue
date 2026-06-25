<script setup lang="ts">
import type { NotificationSummaryItem } from '~/stores/notifications'

const toast = useToast()
const authStore = useAuthStore()
const notificationsStore = useNotificationsStore()
const notificationSound = useNotificationSound()

let pollTimer: ReturnType<typeof setInterval> | null = null
let soundUnlocked = false

const toastSeverity = (priority: string) => {
  if (priority === 'EMERGENCY') return 'error'
  if (priority === 'HIGH') return 'warn'
  return 'info'
}

const showNotificationToast = async (item: NotificationSummaryItem) => {
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

const poll = async (notifyNew = false) => {
  try {
    const result = await notificationsStore.refresh({ notifyNew })
    if (result.isNew && result.newest) {
      await showNotificationToast(result.newest)
    }
  } catch {
    // Notification polling is progressive enhancement; the dashboard still works.
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

const start = () => {
  if (pollTimer || !authStore.isAuthenticated) return

  notificationsStore.hydrateSoundPreference()
  bindSoundUnlock()
  void poll(false)
  pollTimer = setInterval(() => {
    void poll(true)
  }, 15000)
}

const stop = () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
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
