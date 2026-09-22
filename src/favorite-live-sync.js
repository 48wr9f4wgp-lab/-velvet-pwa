import { normalizeRecoveryPairCode } from "./favorite-sync-recovery.js?v=51.1";

export const SHARED_FAVORITE_SYNC_ENABLED_KEY = "velvet_shared_favorites_v2_sync_enabled";

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
