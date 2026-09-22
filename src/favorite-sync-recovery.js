export const SHARED_FAVORITE_RECOVERY_KEY = "velvet_shared_favorites_v1_recovered";

function cleanString(value, max = 8192) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeRecoveryPairCode(value) {
  let raw = cleanString(value, 20000);
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.pair_code === "string") {
      raw = parsed.pair_code;
    }
  } catch (_) {
    const match = raw.match(/["']?pair_code["']?\s*[:=]\s*["']([^"']+)["']/i);
    if (match) raw = match[1];
  }

  return String(raw || "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, "");
}

function canonicalHttpUrl(value) {
  const raw = cleanString(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();

    const kept = [];
    for (const [key, val] of url.searchParams.entries()) {
      const lower = key.toLowerCase();
      if (lower.startsWith("utm_")) continue;
      if (lower.startsWith("x-amz-")) continue;
      if (["fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "igshid", "token", "access_token", "signature", "sig", "expires", "policy", "key-pair-id"].includes(lower)) continue;
      kept.push([key, val]);
    }
    kept.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    url.search = "";
    for (const [key, val] of kept) url.searchParams.append(key, val);

    const path = url.pathname.replace(/\/{2,}/g, "/");
    url.pathname = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
    return url.toString();
  } catch (_) {
    return "";
  }
}

function uniqueStrings(values, max = 400) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => cleanString(String(value || ""), 1024))
    .filter(Boolean))].slice(0, max);
}

function remoteAliasIds(item) {
  return uniqueStrings([
    item?.id,
    ...(Array.isArray(item?.aliases?.ids) ? item.aliases.ids : [])
  ], 1000);
}

function chooseLocalId(item, currentSet, catalogById, catalogByPage, catalogByMedia) {
  const aliases = remoteAliasIds(item);
  const currentMatch = aliases.find(id => currentSet.has(id));
  if (currentMatch) return currentMatch;

  const idMatch = aliases.find(id => catalogById.has(id));
  if (idMatch) return idMatch;

  const page = canonicalHttpUrl(item?.page_url);
  const pageMatch = page ? catalogByPage.get(page) : null;
  if (pageMatch) return pageMatch;

  const media = canonicalHttpUrl(item?.image_url);
  const mediaMatch = media ? catalogByMedia.get(media) : null;
  if (mediaMatch) return mediaMatch;

  return cleanString(item?.id, 1024) || aliases[0] || "";
}

export function planSharedFavoriteRecovery({ payload, currentLikedIds = [], catalog = [] } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Shared favorite payload is invalid");
  }

  const items = Array.isArray(payload.items) ? payload.items.filter(Boolean) : [];
  const orphanIds = uniqueStrings(payload.orphan_ids || [], 1200);
  const current = uniqueStrings(currentLikedIds, 400);
  const currentSet = new Set(current);

  const catalogRows = Array.isArray(catalog) ? catalog.filter(row => row && row.id) : [];
  const catalogById = new Map(catalogRows.map(row => [String(row.id), String(row.id)]));
  const catalogByPage = new Map();
  const catalogByMedia = new Map();
  for (const row of catalogRows) {
    const id = String(row.id);
    const page = canonicalHttpUrl(row.page_url);
    const media = canonicalHttpUrl(row.image_url);
    if (page && !catalogByPage.has(page)) catalogByPage.set(page, id);
    if (media && !catalogByMedia.has(media)) catalogByMedia.set(media, id);
  }

  const archiveItems = [];
  const recoveredIds = [];
  const resolved = new Set();

  for (const item of items) {
    const chosenId = chooseLocalId(item, currentSet, catalogById, catalogByPage, catalogByMedia);
    if (!chosenId || resolved.has(chosenId)) continue;
    resolved.add(chosenId);
    recoveredIds.push(chosenId);
    archiveItems.push({
      ...item,
      id: chosenId,
      page_url: cleanString(item.page_url) || null,
      image_url: cleanString(item.image_url),
      thumb_url: cleanString(item.thumb_url) || null
    });
  }

  const likedIds = uniqueStrings([
    ...recoveredIds,
    ...orphanIds,
    ...current
  ], 400);

  const representedRemoteIds = new Set(orphanIds);
  for (const item of items) {
    for (const id of remoteAliasIds(item)) representedRemoteIds.add(id);
  }

  return {
    likedIds,
    archiveItems,
    remoteItemCount: items.length,
    remoteOrphanCount: orphanIds.length,
    representedRemoteIdCount: representedRemoteIds.size,
    recoveredVisibleCount: archiveItems.length,
    addedLocalIds: likedIds.filter(id => !currentSet.has(id)).length
  };
}

export async function readSharedFavorites(pairCode) {
  const normalizedPairCode = normalizeRecoveryPairCode(pairCode);
  if (normalizedPairCode.length !== 39) {
    throw new Error("復旧コードの形式が正しくありません");
  }

  const response = await fetch("/api/favorites-sync", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Authorization": "Bearer " + normalizedPairCode,
      "Accept": "application/json",
      "X-Velvet-Client": "pwa"
    }
  });

  let payload = null;
  try { payload = await response.json(); } catch (_) {}

  if (!response.ok) {
    const code = String(payload?.error || ("HTTP " + response.status));
    throw new Error("共有お気に入り取得に失敗しました: " + code);
  }

  if (!payload || !Array.isArray(payload.items) || !Array.isArray(payload.orphan_ids)) {
    throw new Error("共有お気に入りの応答形式が不正です");
  }

  return payload;
}
