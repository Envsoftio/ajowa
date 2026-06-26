<script setup lang="ts">
import type { NotificationSummaryItem } from '~/stores/notifications'

const toast = useToast()
const authStore = useAuthStore()
const notificationsStore = useNotificationsStore()
const notificationSound = useNotificationSound()
const pushNotifications = usePushNotifications()

let soundUnlocked = false
let pushAttemptedForSession: string | null = null
let refreshAfterPushTimer: ReturnType<typeof setTimeout> | null = null

type PushNotificationPayload = {
  title?: unknown
  body?: unknown
  priority?: unknown
  link?: unknown
  tag?: unknown
}

type BrowserNotificationPayload = {
  title: string
  body: string
  priority: string
  link: string | null
  tag: string | null
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

const optionalText = (value: unknown) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const normalizeNotificationLink = (value: unknown) => {
  const rawLink = optionalText(value)
  if (!rawLink) return null

  try {
    const url = new URL(rawLink, window.location.origin)

    if (url.origin !== window.location.origin) {
      return null
    }

    return `${url.pathname}${url.search}${url.hash}` || null
  } catch {
    return null
  }
}

const getBrowserNotificationPayload = (
  payload: PushNotificationPayload | undefined,
): BrowserNotificationPayload => ({
  title: optionalText(payload?.title) ?? 'AJOWA',
  body: optionalText(payload?.body) ?? '',
  priority: optionalText(payload?.priority) ?? 'MEDIUM',
  link: normalizeNotificationLink(payload?.link),
  tag: optionalText(payload?.tag),
})

const showBrowserNotification = (item: BrowserNotificationPayload) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return
  }

  try {
    const options: NotificationOptions = {
      body: item.body,
      icon: '/icons/ajowa-icon-192.png',
      data: {
        link: item.link,
      },
    }

    if (item.tag) {
      options.tag = item.tag
    }

    const notification = new Notification(item.title, options)

    notification.onclick = (event) => {
      event.preventDefault()
      window.focus()
      if (item.link) {
        void navigateTo(item.link)
      }
      notification.close()
    }
  } catch {
    // Some browsers only allow service-worker notifications. The in-app toast still covers the foreground case.
  }
}

const showPushToast = async (payload: PushNotificationPayload | undefined) => {
  if (document.visibilityState !== 'visible') {
    return
  }

  const item = getBrowserNotificationPayload(payload)
  showBrowserNotification(item)
  await showNotificationToast(item)
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

const refreshPushSubscription = async () => {
  const sessionId = authStore.me?.session.id
  if (!sessionId || pushAttemptedForSession === sessionId) return

  pushAttemptedForSession = sessionId
  try {
    await pushNotifications.subscribe({ requestPermission: false, showErrorToast: false })
  } catch {
    // Browser push setup should never block the app shell.
  }
}

const start = () => {
  if (!authStore.isAuthenticated) return

  notificationsStore.hydrateSoundPreference()
  bindSoundUnlock()
  void refreshPushSubscription()
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
  if (!authStore.isAuthenticated) {
    pushAttemptedForSession = null
  }
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
