const CACHE_NAME = 'ajowa-app-v2'
const APP_SHELL = [
  '/',
  '/guard/scan',
  '/manifest.webmanifest',
  '/ajowa-icon.svg',
  '/icons/ajowa-icon-192.png',
  '/icons/ajowa-icon-512.png',
  '/icons/ajowa-maskable-512.png',
]

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
  if (new URL(request.url).pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined)
        return response
      })
      .catch(() => caches.match(request).then((response) => response || caches.match('/'))),
  )
})

self.addEventListener('push', (event) => {
  const payload = event.data?.json?.() ?? {}
  const title = payload.title || 'AJOWA'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/ajowa-icon-192.png',
    badge: payload.badge || '/icons/ajowa-icon-192.png',
    image: payload.image,
    tag: payload.tag,
    renotify: payload.priority === 'EMERGENCY',
    data: {
      link: payload.link || '/my/notifications',
    },
    actions: Array.isArray(payload.actions) ? payload.actions : [],
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'AJOWA_PUSH_NOTIFICATION',
          payload,
        })
      })

      const hasVisibleClient = clients.some((client) => client.visibilityState === 'visible')
      if (hasVisibleClient) {
        return undefined
      }

      return self.registration.showNotification(title, options)
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = event.notification.data?.link || '/my/notifications'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(link)
          return client.focus()
        }
      }

      return self.clients.openWindow(link)
    }),
  )
})
