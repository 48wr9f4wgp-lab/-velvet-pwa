const CACHE_PREFIX = "velvet-shell-";
const RECOVERY_VERSION = "v49.5";
const FAVORITE_MEDIA_CACHE = "velvet-favorite-media-v1";

// v34 is intentionally a cache-recovery service worker.
// The previous cache-first shell could keep an installed iOS PWA on stale UI modules.
// Keep the worker registered, but remove all Velvet shell caches and stop intercepting fetches.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX)).map(key => caches.delete(key)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(clients.map(client => client.navigate(client.url).catch(() => null)));
    console.log(`[Velvet SW] cache recovery ${RECOVERY_VERSION} active`);
  })());
});


self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || request.destination !== "image") return;

  event.respondWith((async () => {
    const cache = await caches.open(FAVORITE_MEDIA_CACHE);
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    return fetch(request);
  })());
});
