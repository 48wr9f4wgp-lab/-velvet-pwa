import { normalizeRecoveryPairCode } from "./favorite-sync-recovery.js?v=51.1";
export const SHARED_FAVORITE_SYNC_ENABLED_KEY = "velvet_shared_favorites_v2_sync_enabled";
export const SHARED_FAVORITE_VIEW_KEY = "velvet_shared_favorites_v2_view";

export function sharedFavoriteSyncEnabled() {
  try { return localStorage.getItem(SHARED_FAVORITE_SYNC_ENABLED_KEY) === "1"; } catch (_) { return false; }
}
export function setSharedFavoriteSyncEnabled(enabled) {
  try {
    if (enabled) localStorage.setItem(SHARED_FAVORITE_SYNC_ENABLED_KEY, "1");
    else localStorage.removeItem(SHARED_FAVORITE_SYNC_ENABLED_KEY);
  } catch (_) {}
}
export async function sharedFavoriteSessionStatus() {
  try {
    const response = await fetch("/api/sync-session", { method: "GET", credentials: "same-origin", cache: "no-store", headers: { "Accept": "application/json" } });
    const payload = await response.json().catch(() => null);
    return response.ok && payload?.authenticated === true;
  } catch (_) { return false; }
}
export async function connectSharedFavoriteSession(code) {
  const normalized = normalizeRecoveryPairCode(code);
  if (normalized.length !== 39) throw new Error("共有同期コードの形式が正しくありません");
  const response = await fetch("/api/sync-session", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ code: normalized })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.authenticated !== true) throw new Error("共有同期の認証に失敗しました");
  setSharedFavoriteSyncEnabled(true); return true;
}
function retainPreV53Snapshot() {
  for (const key of ["velvet_private_v2_state", "velvet_private_v49_5_favorite_archive_meta", SHARED_FAVORITE_VIEW_KEY]) {
    const backupKey = key + "_pre_v53";
    if (localStorage.getItem(backupKey) === null) localStorage.setItem(backupKey, localStorage.getItem(key) || "null");
  }
}
export async function syncSharedFavoriteUnion({ favorites = [], likedIds = [] } = {}) {
  // Back up before the caller applies or archives the returned shared state.
  retainPreV53Snapshot();
  const response = await fetch("/api/favorites-sync", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", "Accept": "application/json", "X-Velvet-Client": "pwa" },
    body: JSON.stringify({ source: "pwa", favorites: Array.isArray(favorites) ? favorites : [], likedIds: Array.isArray(likedIds) ? likedIds : [] })
  });
  const payload = await response.json().catch(() => null);
  if (response.status === 401) { setSharedFavoriteSyncEnabled(false); throw new Error("共有同期の再認証が必要です"); }
  if (!response.ok) throw new Error("共有同期に失敗しました: " + String(payload?.error || ("HTTP " + response.status)));
  if (!payload || !Array.isArray(payload.items) || !Array.isArray(payload.orphan_ids)) throw new Error("共有同期の応答形式が不正です");
  return payload;
}
export function saveSharedFavoriteView(items) {
  retainPreV53Snapshot();
  const rows = (Array.isArray(items) ? items : []).filter(item => item && item.id).map(item => ({
    ...item, id: String(item.id), image_url: String(item.image_url || ""),
    thumb_url: typeof item.thumb_url === "string" ? item.thumb_url : null,
    page_url: typeof item.page_url === "string" ? item.page_url : null,
    source: String(item.source || "shared"), source_label: String(item.source_label || item.source || "Shared"),
    source_class: ["personal", "pro", "mixed"].includes(item.source_class) ? item.source_class : "mixed",
    tags: Array.isArray(item.tags) ? item.tags.slice(0, 24) : [], intensity: Math.max(1, Math.min(5, Number(item.intensity) || 3)),
    rank: Math.max(1, Number(item.rank) || 1), archived_favorite: true
  })).filter(item => item.image_url || item.thumb_url);
  if (rows.length > 400) throw new Error("favorite_capacity_exceeded");
  const encoded = JSON.stringify(rows);
  localStorage.setItem(SHARED_FAVORITE_VIEW_KEY, encoded);
  if (localStorage.getItem(SHARED_FAVORITE_VIEW_KEY) !== encoded) throw new Error("favorite_storage_verification_failed");
  return rows;
}
export function loadSharedFavoriteView() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SHARED_FAVORITE_VIEW_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(item => item && item.id) : [];
  } catch (_) { return []; }
}
function canonicalFavoriteDisplayUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = ""; url.hostname = url.hostname.toLowerCase();
    const kept = [];
    for (const [key, val] of url.searchParams.entries()) {
      const lower = key.toLowerCase();
      if (lower.startsWith("utm_") || lower.startsWith("x-amz-")) continue;
      if (["fbclid","gclid","dclid","msclkid","mc_cid","mc_eid","igshid","token","access_token","signature","sig","expires","policy","key-pair-id"].includes(lower)) continue;
      kept.push([key, val]);
    }
    kept.sort((a,b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    url.search = "";
    for (const [key, val] of kept) url.searchParams.append(key, val);
    const path = url.pathname.replace(/\/{2,}/g, "/");
    url.pathname = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
    return url.toString();
  } catch (_) { return ""; }
}
function favoriteDisplayImage(item) {
  for (const value of [item?.image_url, item?.imageURL, item?.thumb_url, item?.thumbURL]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
function favoriteDisplayKeys(item) {
  const image = favoriteDisplayImage(item);
  const canonical = canonicalFavoriteDisplayUrl(image);
  return canonical ? ["m:" + canonical] : image ? ["raw-media:" + image] : [];
}
export function mergeFavoriteDisplayRows(localRows, sharedRows, max = 400) {
  const rows = [...(Array.isArray(sharedRows) ? sharedRows : []), ...(Array.isArray(localRows) ? localRows : [])];
  const seen = new Set(), out = [];
  for (const item of rows) {
    if (!item || !item.id) continue;
    const image = favoriteDisplayImage(item);
    if (!image) continue;
    const keys = favoriteDisplayKeys(item);
    if (keys.some(key => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    out.push({ ...item, id: String(item.id), image_url: image,
      thumb_url: typeof (item.thumb_url ?? item.thumbURL) === "string" ? (item.thumb_url ?? item.thumbURL) : null,
      page_url: typeof (item.page_url ?? item.pageURL) === "string" ? (item.page_url ?? item.pageURL) : null
    });
    if (out.length > Math.max(1, Number(max) || 400)) throw new Error("favorite_capacity_exceeded");
  }
  return out;
}
