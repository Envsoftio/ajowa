import { getApiErrorMessage } from '~/composables/useApi'

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

const uint8ArraysEqual = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) return false

  return left.every((value, index) => value === right[index])
}

const subscriptionUsesApplicationServerKey = (
  subscription: PushSubscription,
  applicationServerKey: Uint8Array,
) => {
  const subscriptionKey = subscription.options.applicationServerKey

  if (!subscriptionKey) {
    return true
  }

  return uint8ArraysEqual(new Uint8Array(subscriptionKey), applicationServerKey)
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

const optionalString = (value: string | null | undefined) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const getBrowserPushErrorMessage = (error: unknown) => {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return 'Notifications are blocked in this browser. Allow notifications from site settings, then try again.'
    }

    if (error.name === 'AbortError') {
      return 'The browser could not finish push setup. Reload AJOWA and try again.'
    }

    if (error.name === 'InvalidCharacterError') {
      return 'The push public key is invalid. Regenerate the VAPID keys and try again.'
    }

    return error.message || 'The browser could not create a push subscription.'
  }

  return error instanceof Error && error.message
    ? error.message
    : 'The browser could not create a push subscription.'
}

const ensureServiceWorkerRegistration = async () => {
  const registration = await navigator.serviceWorker.register('/sw.js')
  await registration.update().catch(() => undefined)

  return navigator.serviceWorker.ready
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

      let subscription: PushSubscription

      try {
        const applicationServerKey = urlBase64ToUint8Array(keyResponse.data.publicKey)
        const registration = await ensureServiceWorkerRegistration()
        let existingSubscription = await registration.pushManager.getSubscription()

        if (
          existingSubscription &&
          !subscriptionUsesApplicationServerKey(existingSubscription, applicationServerKey)
        ) {
          const unsubscribed = await existingSubscription.unsubscribe()
          if (!unsubscribed) {
            throw new DOMException(
              'The browser could not replace the previous push subscription.',
              'AbortError',
            )
          }
          existingSubscription = null
        }

        subscription =
          existingSubscription ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          }))
      } catch (error) {
        return {
          state: 'failed',
          message: getBrowserPushErrorMessage(error),
        }
      }

      try {
        const platform = optionalString(navigator.platform)
        const browserName = optionalString(detectBrowserName())

        await api('/api/my/notifications/push/subscribe', {
          method: 'POST',
          showErrorToast,
          body: {
            ...subscription.toJSON(),
            deviceLabel: platform ?? runtimeConfig.public.appName,
            ...(browserName ? { browserName } : {}),
            ...(platform ? { platform } : {}),
          },
        })

        return { state: 'subscribed', message: 'Push subscription refreshed.' }
      } catch (error) {
        return {
          state: 'failed',
          message: getApiErrorMessage(error, 'Push subscription could not be saved.'),
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
