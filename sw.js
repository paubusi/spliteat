// ══════════════════════════════════════════════════════
// spliteat — Service Worker v2
// Offline mode: cachea carta, assets y permite uso degradado
// ══════════════════════════════════════════════════════
const CACHE_VERSION = 'spliteat-v2';
const ASSETS_CACHE = 'spliteat-assets-v2';
const DATA_CACHE = 'spliteat-data-v2';

// Assets estáticos a cachear siempre
const STATIC_ASSETS = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=Fraunces:ital,opsz,wght@0,9..144,700;1,9..144,400&display=swap',
];

// ── Install: cachear assets estáticos ──
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(ASSETS_CACHE).then(cache => 
      cache.addAll(STATIC_ASSETS).catch(e => console.warn('Cache partial:', e))
    )
  );
});

// ── Activate: limpiar caches viejos ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== ASSETS_CACHE && k !== DATA_CACHE)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: estrategia por tipo de recurso ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Supabase API calls: network-first, fallback cache para GET
  if (url.hostname.includes('supabase.co')) {
    if (event.request.method === 'GET') {
      event.respondWith(networkFirstWithCache(event.request, DATA_CACHE));
    }
    return; // POST/PATCH/DELETE: no cachear
  }

  // Google Fonts: cache-first
  if (url.hostname.includes('fonts.goog') || url.hostname.includes('fonts.gstat')) {
    event.respondWith(cacheFirst(event.request, ASSETS_CACHE));
    return;
  }

  // App HTML: network-first con fallback
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirstWithCache(event.request, ASSETS_CACHE));
    return;
  }

  // Default: network
});

async function networkFirstWithCache(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch(e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Offline fallback for API calls
    if (request.url.includes('/rest/v1/menu_items')) {
      return new Response(JSON.stringify({ data: [], error: null }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw e;
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

// ── Push notifications ──
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const { title = 'spliteat', body = '', tag = 'spliteat', badge = '/icon-192.png' } = data;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      badge,
      icon: '/icon-192.png',
      vibrate: [100, 50, 100],
      data: data.url ? { url: data.url } : undefined,
      requireInteraction: data.requireInteraction || false,
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      const client = clientList.find(c => c.url === url && 'focus' in c);
      return client ? client.focus() : clients.openWindow(url);
    })
  );
});
