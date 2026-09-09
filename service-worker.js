const CACHE_NAME = 'uber-financials-v3';
const PRECACHE_URLS = [
  '/uber.html',
  '/uber/reports.html',
  '/uber/manifest.json',
  '/uber/css/style.css',
  '/uber/js/db.js',
  '/uber/js/profile.js',
  '/uber/js/backup.js',
  '/uber/js/sheets.js',
  '/uber/js/app.js',
  '/uber/js/reports.js',
  '/uber/icons/icon-192.png',
  '/uber/icons/icon-512.png',
  '/uber/icons/icon-maskable-512.png',
  '/uber/icons/apple-touch-icon.png',
];

// This file lives at the site root (so it can control /uber.html), but it
// must only ever handle Uber's own pages/assets, never the rest of the site.
function isUberRequest(pathname) {
  return pathname === '/uber.html' || pathname.startsWith('/uber/');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin || !isUberRequest(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
