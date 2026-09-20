const META_KEY = "velvet_private_v49_5_favorite_archive_meta";
export const FAVORITE_MEDIA_CACHE = "velvet-favorite-media-v1";
const MAX_ARCHIVES = 400;
const pendingCacheDeletes = new Map();
let persistenceRequested = false;

function httpUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  return /^https?:\/\//i.test(raw) ? raw : "";
}

function normalizeSnapshot(item) {
  if (!item?.id) return null;
  return {
    id: String(item.id),
    image_url: String(item.image_url || ""),
    thumb_url: typeof item.thumb_url === "string" ? item.thumb_url : null,
    title: typeof item.title === "string" ? item.title : "",
    source: String(item.source || "unknown"),
    source_label: String(item.source_label || item.source || "Velvet"),
    source_class: ["personal", "pro", "mixed"].includes(item.source_class) ? item.source_class : "mixed",
    tags: Array.isArray(item.tags)
      ? item.tags.filter(value => typeof value === "string" && value.trim()).map(value => value.trim()).slice(0, 24)
      : [],
    published_at_ms: Math.max(0, Number(item.published_at_ms) || 0),
    intensity: Math.max(1, Math.min(5, Number(item.intensity) || 3)),
    page_url: typeof item.page_url === "string" ? item.page_url : null,
    handle: typeof item.handle === "string" ? item.handle : null,
    rank: Math.max(1, Number(item.rank) || 1),
    rights_status: String(item.rights_status || "external-public-source"),
    active: true,
    archived_favorite: true,
    archived_at: new Date().toISOString()
  };
}

function loadArchiveMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(META_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function saveArchiveMap(map) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(map));
  } catch (_) {}
}

function urlsFor(item) {
  return [...new Set([httpUrl(item?.image_url), httpUrl(item?.thumb_url)].filter(Boolean))];
}

async function cacheMediaUrl(url) {
  if (!url || typeof caches === "undefined") return false;
  try {
    const cache = await caches.open(FAVORITE_MEDIA_CACHE);
    const existing = await cache.match(url, { ignoreVary: true });
    if (existing) return true;
    const response = await fetch(url, {
      mode: "no-cors",
      credentials: "omit",
      cache: "reload"
    });
    await cache.put(url, response);
    return true;
  } catch (_) {
    return false;
  }
}

async function deleteMediaUrlIfUnused(url) {
  if (!url || typeof caches === "undefined") return;
  const map = loadArchiveMap();
  const inUse = Object.values(map).some(item => urlsFor(item).includes(url));
  if (inUse) return;
  try {
    const cache = await caches.open(FAVORITE_MEDIA_CACHE);
    await cache.delete(url, { ignoreVary: true });
  } catch (_) {}
}

export function getArchivedFavorite(id) {
  if (!id) return null;
  const row = loadArchiveMap()[String(id)];
  return row && typeof row === "object" ? row : null;
}

export function getArchivedFavorites(ids) {
  const map = loadArchiveMap();
  return (Array.isArray(ids) ? ids : [])
    .map(id => map[String(id)] || null)
    .filter(Boolean);
}

export async function requestFavoritePersistence() {
  if (persistenceRequested) return null;
  persistenceRequested = true;
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return null;
    const already = await navigator.storage.persisted?.();
    if (already) return true;
    return await navigator.storage.persist();
  } catch (_) {
    return null;
  }
}

export function archiveFavorite(item) {
  const snapshot = normalizeSnapshot(item);
  if (!snapshot?.id) return null;

  const timer = pendingCacheDeletes.get(snapshot.id);
  if (timer) {
    clearTimeout(timer);
    pendingCacheDeletes.delete(snapshot.id);
  }

  const map = loadArchiveMap();
  delete map[snapshot.id];
  const next = { [snapshot.id]: snapshot, ...map };
  const entries = Object.entries(next).slice(0, MAX_ARCHIVES);
  saveArchiveMap(Object.fromEntries(entries));

  void requestFavoritePersistence();
  void Promise.allSettled(urlsFor(snapshot).map(cacheMediaUrl));
  return snapshot;
}

export function removeFavoriteArchive(item, delayMs = 6500) {
  const id = String(item?.id || "");
  if (!id) return;
  const map = loadArchiveMap();
  const snapshot = map[id] || normalizeSnapshot(item);
  delete map[id];
  saveArchiveMap(map);

  const existing = pendingCacheDeletes.get(id);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingCacheDeletes.delete(id);
    for (const url of urlsFor(snapshot)) void deleteMediaUrlIfUnused(url);
  }, Math.max(0, Number(delayMs) || 0));
  pendingCacheDeletes.set(id, timer);
}

export async function clearFavoriteArchive() {
  for (const timer of pendingCacheDeletes.values()) clearTimeout(timer);
  pendingCacheDeletes.clear();
  try { localStorage.removeItem(META_KEY); } catch (_) {}
  try {
    if (typeof caches !== "undefined") await caches.delete(FAVORITE_MEDIA_CACHE);
  } catch (_) {}
}

export function backfillFavoriteArchive(ids, catalog) {
  const liked = Array.isArray(ids) ? ids : [];
  if (!liked.length || !Array.isArray(catalog)) return;

  const byId = new Map(catalog.map(item => [String(item?.id || ""), item]));
  for (const id of liked) {
    const item = byId.get(String(id));
    if (!item) continue;
    if (!getArchivedFavorite(id)) archiveFavorite(item);
  }
}
