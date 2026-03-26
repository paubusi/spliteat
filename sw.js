// ══════════════════════════════════════════════════════
// spliteat — Service Worker
// Maneja notificaciones push en segundo plano
// Subir este archivo a la raíz del proyecto en GitHub
// (al mismo nivel que index.html)
// ══════════════════════════════════════════════════════

const CACHE_NAME = 'spliteat-v1';

// Instalar SW
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// Recibir notificación push del servidor
self.addEventListener('push', e => {
  if (!e.data) return;

  let payload;
  try {
    payload = e.data.json();
  } catch {
    payload = { title: 'spliteat', body: e.data.text() };
  }

  const { title, body, icon, tag, data } = payload;

  e.waitUntil(
    self.registration.showNotification(title || 'spliteat', {
      body: body || '',
      icon: icon || '/icon-192.png',
      badge: '/icon-192.png',
      tag: tag || 'spliteat',
      renotify: true,
      vibrate: [200, 100, 200], // vibración en móvil
      data: data || {},
      actions: [] // sin botones de acción por simplicidad
    })
  );
});

// Al pulsar la notificación — abrir la app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Si la app ya está abierta, enfocarla
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no está abierta, abrirla
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
