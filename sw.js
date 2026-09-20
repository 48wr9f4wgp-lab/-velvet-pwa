const CACHE_PREFIX = "velvet-shell-";
const RECOVERY_VERSION = "v49.5";
const FAVORITE_MEDIA_CACHE = "velvet-favorite-media-v1";

// The shell remains network-first: old Velvet shell caches are removed so iOS PWA UI modules do not go stale.
// The only fetch interception below is for images explicitly archived by Favorites.
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
