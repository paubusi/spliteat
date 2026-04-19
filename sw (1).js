// ═══════════════════════════════════════════════════
// SERVICE WORKER — spliteat
// Coloca este archivo en la RAÍZ del repo de GitHub
// para que quede accesible en https://spliteat.es/sw.js
// ═══════════════════════════════════════════════════

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

// ── Recibir push con pantalla bloqueada ──
self.addEventListener('push', e => {
  if (!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch(_) { data = { title: 'spliteat', body: e.data.text() }; }

  e.waitUntil(
    self.registration.showNotification(data.title || 'spliteat', {
      body:               data.body || data.message || '',
      icon:               '/icon-192.png',   // añade este icono al repo
      badge:              '/badge-72.png',   // añade este icono al repo (pequeño, monocolor)
      tag:                data.tag || 'spliteat',
      renotify:           true,
      requireInteraction: data.requireInteraction || false,
      data:               { url: data.url || '/' }
    })
  );
});

// ── Al tocar la notificación → abrir/enfocar la app ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const found = list.find(c => c.url.startsWith('https://spliteat.es'));
      return found ? found.focus() : clients.openWindow(url);
    })
  );
});
