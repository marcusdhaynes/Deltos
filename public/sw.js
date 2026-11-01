/* Deltos: cache ONLY same-origin immutable hashed assets. Do not cache
   documents, OAuth requests, Firebase APIs, Firestore data, or user files. */
const CACHE_NAME = 'deltos-immutable-v1';
const CACHE_PREFIX = 'deltos-immutable-';
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))
    )),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode === 'navigate' || req.cache === 'no-store') return;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  const assetPrefix = scope.pathname.replace(/\/?$/, '/') + 'assets/';
  if (url.origin !== scope.origin || !url.pathname.startsWith(assetPrefix)) return;
  if (url.search || !/[-.][a-zA-Z0-9_-]{8,}\.(?:js|css|woff2?|svg|webp|png|jpe?g|avif)$/.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(req);
    if (hit) return hit;
    const result = await fetch(req);
    if (result.ok && result.type === 'basic') {
      event.waitUntil(cache.put(req, result.clone()).catch(() => {}));
    }
    return result;
  })());
});
