// NOVA Casino — offline app-shell service worker.
//
// Scope is intentionally narrow: cache the static shell (the single HTML file, manifest,
// icons) so the guest mode keeps working with no network at all after the first visit.
// Everything that talks to Supabase (auth, RPCs, /functions/v1/*) is left completely
// alone — never intercepted, never cached — so an account session's balance/results are
// never served stale or written to a shared cache.
const CACHE_VERSION = 'nova-v6.4.0-1';
const SHELL_URLS = [
  './',
  './nova-casino.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only ever handle same-origin GET requests for the app shell itself. Anything else
  // (Supabase REST/RPC/Edge Functions, cross-origin, non-GET) passes straight through to
  // the network untouched — this service worker must never sit in front of account data.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!SHELL_URLS.some((shellUrl) => url.pathname.endsWith(shellUrl.replace('./', '/')) || url.pathname === '/')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      // Cache-first for instant offline start; refresh the cache in the background so an
      // online visit still picks up a newer deploy on the next load.
      return cached || network;
    })
  );
});
