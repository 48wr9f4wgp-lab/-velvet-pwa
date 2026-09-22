import { normalizeRecoveryPairCode } from "./favorite-sync-recovery.js?v=51.1";

export const SHARED_FAVORITE_SYNC_ENABLED_KEY = "velvet_shared_favorites_v2_sync_enabled";
export const SHARED_FAVORITE_VIEW_KEY = "velvet_shared_favorites_v2_view";

export function sharedFavoriteSyncEnabled() {
  try {
    return localStorage.getItem(SHARED_FAVORITE_SYNC_ENABLED_KEY) === "1";
  } catch (_) {
    return false;
  }
}

export function setSharedFavoriteSyncEnabled(enabled) {
  try {
    if (enabled) localStorage.setItem(SHARED_FAVORITE_SYNC_ENABLED_KEY, "1");
    else localStorage.removeItem(SHARED_FAVORITE_SYNC_ENABLED_KEY);
  } catch (_) {}
}

export async function sharedFavoriteSessionStatus() {
  try {
    const response = await fetch("/api/sync-session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });
    const payload = await response.json().catch(() => null);
    return response.ok && payload?.authenticated === true;
  } catch (_) {
    return false;
  }
}

export async function connectSharedFavoriteSession(code) {
  const normalized = normalizeRecoveryPairCode(code);
  if (normalized.length !== 39) {
    throw new Error("共有同期コードの形式が正しくありません");
  }

  const response = await fetch("/api/sync-session", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({ code: normalized })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.authenticated !== true) {
    throw new Error("共有同期の認証に失敗しました");
  }

  setSharedFavoriteSyncEnabled(true);
  return true;
}

export async function syncSharedFavoriteUnion({ favorites = [], likedIds = [] } = {}) {
  const response = await fetch("/api/favorites-sync", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Velvet-Client": "pwa"
    },
    body: JSON.stringify({
      source: "pwa",
      favorites: Array.isArray(favorites) ? favorites : [],
      likedIds: Array.isArray(likedIds) ? likedIds : []
    })
  });

  const payload = await response.json().catch(() => null);
  if (response.status === 401) {
    setSharedFavoriteSyncEnabled(false);
    throw new Error("共有同期の再認証が必要です");
  }
  if (!response.ok) {
    throw new Error("共有同期に失敗しました: " + String(payload?.error || ("HTTP " + response.status)));
  }
  if (!payload || !Array.isArray(payload.items) || !Array.isArray(payload.orphan_ids)) {
    throw new Error("共有同期の応答形式が不正です");
  }
  return payload;
}

export function saveSharedFavoriteView(items) {
  const rows = (Array.isArray(items) ? items : [])
    .filter(item => item && item.id)
    .map(item => ({
      ...item,
      id: String(item.id),
      image_url: String(item.image_url || ""),
      thumb_url: typeof item.thumb_url === "string" ? item.thumb_url : null,
      page_url: typeof item.page_url === "string" ? item.page_url : null,
      source: String(item.source || "shared"),
      source_label: String(item.source_label || item.source || "Shared"),
      source_class: ["personal", "pro", "mixed"].includes(item.source_class) ? item.source_class : "mixed",
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 24) : [],
      intensity: Math.max(1, Math.min(5, Number(item.intensity) || 3)),
      rank: Math.max(1, Number(item.rank) || 1),
      archived_favorite: true
    }))
    .filter(item => item.image_url || item.thumb_url)
    .slice(0, 400);

  try { localStorage.setItem(SHARED_FAVORITE_VIEW_KEY, JSON.stringify(rows)); } catch (_) {}
  return rows;
}

export function loadSharedFavoriteView() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SHARED_FAVORITE_VIEW_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(item => item && item.id).slice(0, 400) : [];
  } catch (_) {
    return [];
  }
}
