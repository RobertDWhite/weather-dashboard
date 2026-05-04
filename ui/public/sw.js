// Weather dashboard service worker — handles VAPID push notifications and
// caches the app shell so the PWA installs and survives an offline reload.
// Registered by main.tsx on first load. Stays alive in the background which
// is what enables real OS-level alerts.

const SHELL_CACHE = 'wx-shell-v1'
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.svg', '/icon-512.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_URLS).catch(() => {}))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// Network-first for navigations (always show fresh dashboard when online),
// cache fallback when offline so the shell still loads. Static assets fall
// through to the browser's HTTP cache — we don't intercept them, which avoids
// staleness for tile / data fetches that the app already revalidates.
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(SHELL_CACHE).then((c) => c.put('/', copy)).catch(() => {})
        return res
      }).catch(() => caches.match('/').then((m) => m || caches.match('/index.html')))
    )
  }
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (_) {
    try { data = { body: event.data?.text() || '' } } catch (_) { data = {} }
  }

  const title = data.title || 'Weather Alert'
  const body = data.body || ''
  const tag = data.tag || 'wx-alert'
  const url = data.url || '/'
  const isEmergency = (data.severity || '').toLowerCase() === 'extreme'

  const opts = {
    body,
    tag,                             // collapse repeat alerts under same id
    renotify: true,
    requireInteraction: isEmergency, // emergencies stay until tapped
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url },
    vibrate: isEmergency ? [400, 100, 400, 100, 400] : [200, 100, 200],
  }
  event.waitUntil(self.registration.showNotification(title, opts))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if (win.url.includes(url) && 'focus' in win) return win.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
