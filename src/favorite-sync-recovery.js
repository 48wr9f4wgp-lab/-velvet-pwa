import { unionMediaFavorites } from "./favorite-identity-v3.js?v=53";
export const SHARED_FAVORITE_RECOVERY_KEY = "velvet_shared_favorites_v1_recovered";
export function normalizeRecoveryPairCode(value) {
  let raw = String(value || "").trim();
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.pair_code === "string") raw = parsed.pair_code;
  } catch (_) {
    const match = raw.match(/["']?pair_code["']?\s*[:=]\s*["']([^"']+)["']/i);
    if (match) raw = match[1];
  }
  return raw.trim().replace(/^["'`]+|["'`]+$/g, "").replace(/\s+/g, "");
}
export function planSharedFavoriteRecovery({ payload, currentLikedIds = [] } = {}) {
  if (!payload || !Array.isArray(payload.items) || !Array.isArray(payload.orphan_ids)) throw new Error("Shared favorite payload is invalid");
  const current = [...new Set(currentLikedIds.filter(x => typeof x === "string" && x))];
  const archiveItems = unionMediaFavorites([], payload.items, "existing");
  const likedIds = [...new Set([...current, ...archiveItems.map(x => x.id), ...payload.orphan_ids])];
  const represented = new Set([...payload.orphan_ids, ...archiveItems.flatMap(x => x.aliases.ids)]);
  return {
    likedIds, archiveItems,
    remoteItemCount: payload.items.length,
    remoteOrphanCount: payload.orphan_ids.length,
    representedRemoteIdCount: represented.size,
    recoveredVisibleCount: archiveItems.filter(x => x.image_url || x.thumb_url).length,
    metadataOnlyCount: archiveItems.filter(x => !x.image_url && !x.thumb_url).length,
    addedLocalIds: likedIds.filter(id => !current.includes(id)).length
  };
}
export async function readSharedFavorites(pairCode) {
  const normalized = normalizeRecoveryPairCode(pairCode);
  if (normalized.length !== 39) throw new Error("復旧コードの形式が正しくありません");
  const response = await fetch("/api/favorites-sync", {
    method: "GET", credentials: "same-origin", cache: "no-store",
    headers: { Authorization: "Bearer " + normalized, Accept: "application/json", "X-Velvet-Client": "pwa" }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error("共有お気に入り取得に失敗しました: " + String(payload?.error || response.status));
  if (!payload || !Array.isArray(payload.items) || !Array.isArray(payload.orphan_ids)) throw new Error("共有お気に入りの応答形式が不正です");
  return payload;
}
