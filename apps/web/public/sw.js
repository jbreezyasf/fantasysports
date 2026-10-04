const CACHE_NAME = 'big-exec-shell-v1';
const BRAND_ASSETS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/brand/be-crown-mark-v1.webp',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(BRAND_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin || !BRAND_ASSETS.includes(requestUrl.pathname)) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});

// --- Web push -------------------------------------------------------------------------------
// The server sends an encrypted JSON payload: { title, body, url, tag, lang }.
// These handlers do not touch the cache or the fetch handling above.

function parsePushPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data.title === 'string' && data.title) return data;
  } catch {
    // Not JSON: fall through to the generic notice.
  }
  return { title: 'Big Exec Fantasy Sports', body: 'You have a new league notice.', url: '/dashboard' };
}

// Only same-origin paths are ever opened from a notification.
function safeNotificationUrl(value) {
  const fallback = new URL('/dashboard', self.location.origin).href;
  try {
    const url = new URL(typeof value === 'string' && value ? value : '/dashboard', self.location.origin);
    return url.origin === self.location.origin ? url.href : fallback;
  } catch {
    return fallback;
  }
}

self.addEventListener('push', event => {
  const data = parsePushPayload(event);
  event.waitUntil(self.registration.showNotification(String(data.title).slice(0, 80), {
    body: typeof data.body === 'string' ? data.body.slice(0, 240) : '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    lang: typeof data.lang === 'string' ? data.lang : undefined,
    data: { url: safeNotificationUrl(data.url) },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = safeNotificationUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
      const sameOrigin = windows.filter(client => client.url.startsWith(self.location.origin));
      const open = sameOrigin.find(client => client.url === target) || sameOrigin[0];
      if (!open) return self.clients.openWindow(target);
      try {
        const client = open.url === target || !('navigate' in open) ? open : await open.navigate(target);
        return (client || open).focus();
      } catch {
        return self.clients.openWindow(target);
      }
    }),
  );
});
