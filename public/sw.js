// Highverz High-Performance Static Asset & Media Service Worker (v8)
const CACHE_NAME = 'highverz-cache-v8';
const FONT_CACHE_NAME = 'highverz-fonts-v1';

const STATIC_EXTENSIONS = /\.(?:png|jpg|jpeg|webp|avif|svg|woff2?|css|js|json)$/i;
const VIDEO_EXTENSIONS = /\.(?:mp4|webm|mov)$/i;
const FONT_HOSTS = [
  'api.fontshare.com',
  'cdn.fontshare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

const PRECACHE_ASSETS = [
  '/',
  '/work',
  '/campaigns',
  '/team',
  '/why-us',
  '/fonts/coolvetica.woff',
  '/fonts/coolvetica-rg.woff',
  '/assets/logo-white.png',
  '/assets/logo-cyan.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== FONT_CACHE_NAME)
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
  // CRITICAL: NEVER intercept video range requests in Service Worker!
  // Native media pipelines manage HTTP 206 byte-range streaming, hardware decoding,
  // and disk caching without JS memory overhead.
  if (VIDEO_EXTENSIONS.test(url.pathname)) {
    return;
  }

  // 2. Webfonts & Font CDNs (Fontshare & Google Fonts):
  // Cache-First with persistent disk cache for 0ms repeat loads and offline resilience.
  // Preserves exact original typography, ligatures, and italic cuts without DOM manipulation.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(FONT_CACHE_NAME).then((cache) => {
        return cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response && (response.status === 200 || response.type === 'opaque')) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => cached);
        });
      })
    );
    return;
  }

  // 3. HTML Document Navigations: Stale-While-Revalidate for 0ms loads + offline resilience
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || caches.match('/');
          });
        })
    );
    return;
  }

  // 4. Static assets: check images against the network first because these
  // files keep their names across deployments. Keep cache-first behavior for
  // content-hashed scripts, styles, and fonts.
  if (STATIC_EXTENSIONS.test(url.pathname) || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/')) {
    if (/\.(?:png|jpg|jpeg|webp|avif|svg)$/i.test(url.pathname)) {
      event.respondWith(
        fetch(request).then((response) => {
          if (response?.ok) {
            const clone = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)));
          }
          return response;
        }).catch(() => caches.match(request))
      );
      return;
    }
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
