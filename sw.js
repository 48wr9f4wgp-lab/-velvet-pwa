const CACHE_PREFIX = "velvet-shell-";
const RECOVERY_VERSION = "v54-private-media";
const FAVORITE_MEDIA_CACHE = "velvet-favorite-media-v1";
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  // Private media bypasses CacheStorage. Authentication happens in the route itself.
  if (new URL(request.url).pathname === "/api/favorite-media") return;
  if (request.method !== "GET" || request.destination !== "image") return;
  event.respondWith((async () => {
    const cache = await caches.open(FAVORITE_MEDIA_CACHE);
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    return fetch(request);
  })());
});
