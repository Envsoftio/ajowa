type PushSubscriptionState =
  | 'subscribed'
  | 'unsupported'
  | 'disabled'
  | 'denied'
  | 'permission-default'
  | 'failed'

type PushSubscriptionResult = {
  state: PushSubscriptionState
  message: string | null
}

type PushSubscriptionOptions = {
  requestPermission?: boolean
  showErrorToast?: boolean
}

let activeSubscriptionRequest: Promise<PushSubscriptionResult> | null = null

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

const detectBrowserName = () => {
  const userAgent = navigator.userAgent

  if (userAgent.includes('Edg/')) return 'Edge'
  if (userAgent.includes('OPR/') || userAgent.includes('Opera/')) return 'Opera'
  if (userAgent.includes('Firefox/')) return 'Firefox'
  if (userAgent.includes('CriOS/') || userAgent.includes('Chrome/')) return 'Chrome'
  if (userAgent.includes('Safari/')) return 'Safari'

  return null
}

export const usePushNotifications = () => {
  const api = useApi()
  const runtimeConfig = useRuntimeConfig()

  const subscribe = async (
    options: PushSubscriptionOptions = {},
  ): Promise<PushSubscriptionResult> => {
    if (activeSubscriptionRequest) {
      return activeSubscriptionRequest
    }

    activeSubscriptionRequest = (async () => {
      if (!import.meta.client) {
        return { state: 'unsupported', message: 'Push notifications are only available in the browser.' }
      }

      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        return { state: 'unsupported', message: 'This browser does not support web push notifications.' }
      }

      const showErrorToast = options.showErrorToast ?? false
      let keyResponse: {
        ok: true
        data: { enabled: boolean; publicKey: string | null; reason: string | null }
      }

      try {
        keyResponse = await api('/api/notifications/push/public-key', { showErrorToast })
      } catch {
        return {
          state: 'failed',
          message: 'Push notification configuration could not be loaded.',
        }
      }

      if (!keyResponse.data.enabled || !keyResponse.data.publicKey) {
        return {
          state: 'disabled',
          message: keyResponse.data.reason ?? 'Push notifications are not configured.',
        }
      }

      let permission = Notification.permission

      if (permission === 'default' && options.requestPermission !== false) {
        try {
          permission = await Notification.requestPermission()
        } catch {
          return {
            state: 'permission-default',
            message: 'The browser did not show the notification permission prompt.',
          }
        }
      }

      if (permission === 'default') {
        return {
          state: 'permission-default',
          message: 'Notification permission has not been granted yet.',
        }
      }

      if (permission !== 'granted') {
        return {
          state: 'denied',
          message: 'Notifications are blocked in this browser. Allow notifications from site settings, then try again.',
        }
      }

      try {
        const registration = await navigator.serviceWorker.ready
        const existingSubscription = await registration.pushManager.getSubscription()
        const subscription =
          existingSubscription ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(keyResponse.data.publicKey),
          }))

        await api('/api/my/notifications/push/subscribe', {
          method: 'POST',
          showErrorToast,
          body: {
            ...subscription.toJSON(),
            deviceLabel: navigator.platform || runtimeConfig.public.appName,
            browserName: detectBrowserName(),
            platform: navigator.platform,
          },
        })

        return { state: 'subscribed', message: 'Push subscription refreshed.' }
      } catch {
        return {
          state: 'failed',
          message: 'Push subscription could not be created.',
        }
      }
    })()

    try {
      return await activeSubscriptionRequest
    } finally {
      activeSubscriptionRequest = null
    }
  }

  return {
    subscribe,
  }
}
