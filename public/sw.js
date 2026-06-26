const CACHE_NAME = 'ajowa-app-v4'
const DEFAULT_NOTIFICATION_LINK = '/my/notifications'
const APP_SHELL = [
  '/manifest.webmanifest',
  '/ajowa-icon.svg',
  '/icons/ajowa-icon-192.png',
  '/icons/ajowa-icon-512.png',
  '/icons/ajowa-maskable-512.png',
]

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

const parsePushPayload = (event) => {
  if (!event.data) {
    return {}
  }

  try {
    const payload = event.data.json()
    return payload && typeof payload === 'object' ? payload : {}
  } catch {
    try {
      return { body: event.data.text() }
    } catch {
      return {}
    }
  }
}

const normalizeNotificationLink = (link) => {
  const rawLink = typeof link === 'string' && link.trim() ? link.trim() : DEFAULT_NOTIFICATION_LINK

  try {
    const url = new URL(rawLink, self.location.origin)

    if (url.origin !== self.location.origin) {
      return DEFAULT_NOTIFICATION_LINK
    }

    return `${url.pathname}${url.search}${url.hash}` || DEFAULT_NOTIFICATION_LINK
  } catch {
    return DEFAULT_NOTIFICATION_LINK
  }
}

const getNotificationActions = (actions) => {
  if (!Array.isArray(actions)) {
    return []
  }

  return actions
    .filter((action) => action && typeof action.action === 'string' && typeof action.title === 'string')
    .slice(0, 2)
    .map((action) => ({
      action: action.action,
      title: action.title,
      ...(typeof action.icon === 'string' ? { icon: action.icon } : {}),
    }))
}

const optionalText = (value) => (typeof value === 'string' && value.trim() ? value : undefined)

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  const isNavigation = request.mode === 'navigate'
  const shouldCacheRequest =
    request.destination !== 'audio' &&
    request.destination !== 'video' &&
    request.destination !== 'font' &&
    request.destination !== '' &&
    request.destination !== 'manifest'

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && shouldCacheRequest) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined)
        }

        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        if (cached) {
          return cached
        }

        if (isNavigation) {
          return new Response('Offline', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        }

        return caches.match('/').then((fallback) => fallback ?? null)
      }),
  )
})

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event)
  const title = optionalText(payload.title) || 'AJOWA'
  const options = {
    body: optionalText(payload.body) || '',
    icon: optionalText(payload.icon) || '/icons/ajowa-icon-192.png',
    badge: optionalText(payload.badge) || '/icons/ajowa-icon-192.png',
    image: optionalText(payload.image),
    tag: optionalText(payload.tag),
    renotify: payload.priority === 'EMERGENCY',
    data: {
      link: normalizeNotificationLink(payload.link),
    },
    actions: getNotificationActions(payload.actions),
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'AJOWA_PUSH_NOTIFICATION',
          payload,
        })
      })

      return self.registration.showNotification(title, options).catch(() => undefined)
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = normalizeNotificationLink(event.notification.data?.link)
  const targetUrl = new URL(link, self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (!('focus' in client)) {
          continue
        }

        if ('navigate' in client) {
          const navigatedClient = await client.navigate(targetUrl).catch(() => null)
          if (navigatedClient && 'focus' in navigatedClient) {
            return navigatedClient.focus()
          }
        }

        return client.focus()
      }

      return self.clients.openWindow(targetUrl)
    }),
  )
})

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const keyResponse = await fetch('/api/notifications/push/public-key', {
        credentials: 'include',
      })

      if (!keyResponse.ok) {
        return
      }

      const keyPayload = await keyResponse.json()
      const publicKey = keyPayload?.data?.publicKey

      if (!keyPayload?.data?.enabled || typeof publicKey !== 'string' || !publicKey) {
        return
      }

      const subscription =
        event.newSubscription ||
        (await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }))

      await fetch('/api/my/notifications/push/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription.toJSON()),
      })
    })().catch(() => undefined),
  )
})
