// Highverz High-Performance Static Asset Service Worker (v4)
const CACHE_NAME = 'highverz-cache-v4';

const STATIC_EXTENSIONS = /\.(?:png|jpg|jpeg|webp|avif|svg|woff2?|css|js|json)$/i;
const VIDEO_EXTENSIONS = /\.(?:mp4|webm|mov)$/i;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests and API calls
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  // 1. Video files (MP4 / WebM / MOV):
  // CRITICAL: NEVER intercept video requests in Service Worker!
  // Browsers (especially iOS Safari and mobile Chrome) have native media pipelines
  // with HTTP 206 byte-range streaming, hardware decoding, and disk caching.
  // Intercepting video requests in a Service Worker breaks Safari WebKit AVPlayer
  // and causes range-slicing OOM failures on mobile devices.
  if (VIDEO_EXTENSIONS.test(url.pathname)) {
    return;
  }

  // 2. Static Assets (Images, WebP, Fonts, CSS, JS): Cache-First
  if (STATIC_EXTENSIONS.test(url.pathname) || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
});
