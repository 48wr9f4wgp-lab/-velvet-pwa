const SYNC_SCHEMA_VERSION = 1;
export const MAX_SYNC_FAVORITES = 1000;
export const MAX_SYNC_ORPHAN_IDS = 1200;

const TRACKING_KEYS = new Set([
  "fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "igshid"
]);

function clip(value, max = 2048) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : "";
}

function uniqueStrings(values, max = 2000) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map(value => clip(value))
      .filter(Boolean)
  )].slice(0, max);
}

export function sanitizeHttpUrl(value) {
  const raw = clip(value, 8192);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    return url.toString();
  } catch (_) {
    return "";
  }
}

export function canonicalizeUrlForIdentity(value) {
  const clean = sanitizeHttpUrl(value);
  if (!clean) return "";
  try {
    const url = new URL(clean);
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }

    const kept = [];
    for (const [key, val] of url.searchParams.entries()) {
      const lower = key.toLowerCase();
      if (lower.startsWith("utm_")) continue;
      if (lower.startsWith("x-amz-")) continue;
      if (TRACKING_KEYS.has(lower)) continue;
      if (["token", "access_token", "signature", "sig", "expires", "policy", "key-pair-id"].includes(lower)) continue;
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

function isoDate(value, fallback = null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }
  return fallback;
}

function normalizedSourceClass(value) {
  const text = clip(value, 32).toLowerCase();
  return ["personal", "pro", "mixed"].includes(text) ? text : null;
}

function normalizedTags(value) {
  return uniqueStrings(Array.isArray(value) ? value : [], 24).map(tag => tag.slice(0, 80));
}

function makeFingerprints({ id, source, pageUrl, imageUrl, aliases }) {
  const existing = uniqueStrings(aliases?.fingerprints || [], 2000);
  const out = new Set(existing);

  const pageIdentity = canonicalizeUrlForIdentity(pageUrl);
  if (pageIdentity) out.add("p:" + pageIdentity);

  const mediaIdentity = canonicalizeUrlForIdentity(imageUrl);
  if (mediaIdentity) out.add("m:" + mediaIdentity);

  if (id && source) out.add("s:" + source.toLowerCase() + ":" + id);
  else if (id) out.add("i:" + id);

  return [...out].sort();
}

export function normalizeFavorite(raw, sourceHint = "unknown") {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const id = clip(raw.id ?? raw.source_id ?? raw.sourceId, 512);
  const source = clip(raw.source ?? raw.site ?? sourceHint, 128) || "unknown";
  const pageUrl = sanitizeHttpUrl(raw.page_url ?? raw.pageURL ?? raw.url);
  const imageUrl = sanitizeHttpUrl(raw.image_url ?? raw.imageURL ?? raw.media_url ?? raw.mediaURL);
  const thumbUrl = sanitizeHttpUrl(raw.thumb_url ?? raw.thumbURL);
  if (!id && !pageUrl && !imageUrl) return null;

  const aliases = raw.aliases && typeof raw.aliases === "object" && !Array.isArray(raw.aliases)
    ? raw.aliases
    : {};

  const aliasIds = uniqueStrings([...(aliases.ids || []), id].filter(Boolean), 1000);
  const aliasPages = uniqueStrings([...(aliases.page_urls || []), pageUrl].filter(Boolean), 1000);
  const aliasMedia = uniqueStrings([...(aliases.media_urls || []), imageUrl].filter(Boolean), 1000);
  const aliasSources = uniqueStrings([...(aliases.sources || []), source].filter(Boolean), 256);

  const firstSaved = isoDate(
    raw.first_saved_at ?? raw.saved_at ?? raw.archived_at ?? raw.ts,
    new Date(0).toISOString()
  );
  const lastSaved = isoDate(
    raw.last_saved_at ?? raw.saved_at ?? raw.archived_at ?? raw.ts,
    firstSaved
  );

  const item = {
    uid: clip(raw.uid, 8192) || null,
    id: id || aliasIds[0] || null,
    image_url: imageUrl || aliasMedia[0] || "",
    thumb_url: thumbUrl || null,
    page_url: pageUrl || aliasPages[0] || null,
    title: clip(raw.title, 500),
    source,
    source_label: clip(raw.source_label ?? raw.sourceLabel, 160) || source,
    source_class: normalizedSourceClass(raw.source_class ?? raw.sourceClass),
    tags: normalizedTags(raw.tags),
    published_at_ms: Math.max(0, Number(raw.published_at_ms ?? raw.publishedAtMs) || 0),
    intensity: Math.max(1, Math.min(5, Number(raw.intensity) || 3)),
    rank: Math.max(1, Number(raw.rank) || 1),
    rights_status: clip(raw.rights_status ?? raw.rightsStatus, 120) || "external-public-source",
    first_saved_at: firstSaved,
    last_saved_at: lastSaved,
    aliases: {
      ids: aliasIds,
      page_urls: aliasPages,
      media_urls: aliasMedia,
      sources: aliasSources,
      fingerprints: []
    },
    provenance: uniqueStrings([
      ...(raw.provenance || []),
      ...(sourceHint && sourceHint !== "existing" ? [sourceHint] : [])
    ], 32)
  };

  item.aliases.fingerprints = makeFingerprints({
    id: item.id,
    source: item.source,
    pageUrl: item.page_url,
    imageUrl: item.image_url,
    aliases
  });

  if (!item.aliases.fingerprints.length) return null;
  item.uid = chooseUid(item.aliases.fingerprints);
  return item;
}

function chooseUid(fingerprints) {
  const list = uniqueStrings(fingerprints, 2000).sort();
  for (const prefix of ["p:", "m:", "s:", "i:"]) {
    const match = list.find(value => value.startsWith(prefix));
    if (match) return match;
  }
  return list[0] || null;
}

function quality(item) {
  return (item.page_url ? 4 : 0)
    + (item.image_url ? 4 : 0)
    + (item.title ? 1 : 0)
    + (item.source && item.source !== "unknown" ? 1 : 0)
    + (item.tags?.length ? 0.5 : 0);
}

function mergeGroup(group) {
  const sorted = [...group].sort((a, b) => {
    const score = quality(b) - quality(a);
    if (score) return score;
    return String(b.last_saved_at || "").localeCompare(String(a.last_saved_at || ""));
  });
  const primary = sorted[0];

  const aliases = {
    ids: uniqueStrings(sorted.flatMap(item => item.aliases?.ids || []).filter(Boolean), 1000),
    page_urls: uniqueStrings(sorted.flatMap(item => item.aliases?.page_urls || []).filter(Boolean), 1000),
    media_urls: uniqueStrings(sorted.flatMap(item => item.aliases?.media_urls || []).filter(Boolean), 1000),
    sources: uniqueStrings(sorted.flatMap(item => item.aliases?.sources || []).filter(Boolean), 256),
    fingerprints: uniqueStrings(sorted.flatMap(item => item.aliases?.fingerprints || []).filter(Boolean), 2000).sort()
  };

  const firstSaved = sorted
    .map(item => item.first_saved_at)
    .filter(Boolean)
    .sort()[0] || new Date(0).toISOString();
  const lastSaved = sorted
    .map(item => item.last_saved_at)
    .filter(Boolean)
    .sort()
    .at(-1) || firstSaved;

  return {
    ...primary,
    uid: chooseUid(aliases.fingerprints),
    id: primary.id || aliases.ids[0] || null,
    image_url: primary.image_url || aliases.media_urls[0] || "",
    page_url: primary.page_url || aliases.page_urls[0] || null,
    first_saved_at: firstSaved,
    last_saved_at: lastSaved,
    aliases,
    provenance: uniqueStrings(sorted.flatMap(item => item.provenance || []), 32)
  };
}

export function unionFavorites(existing, incoming, sourceHint = "unknown") {
  const rows = [
    ...(Array.isArray(existing) ? existing.map(item => normalizeFavorite(item, "existing")) : []),
    ...(Array.isArray(incoming) ? incoming.map(item => normalizeFavorite(item, sourceHint)) : [])
  ].filter(Boolean);

  if (!rows.length) return [];

  const parent = rows.map((_, index) => index);
  const find = index => {
    let node = index;
    while (parent[node] !== node) {
      parent[node] = parent[parent[node]];
      node = parent[node];
    }
    return node;
  };
  const unite = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const owner = new Map();
  rows.forEach((item, index) => {
    for (const fingerprint of item.aliases.fingerprints || []) {
      if (owner.has(fingerprint)) unite(index, owner.get(fingerprint));
      else owner.set(fingerprint, index);
    }
  });

  const groups = new Map();
  rows.forEach((item, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item);
  });

  return [...groups.values()]
    .map(mergeGroup)
    .sort((a, b) => String(b.last_saved_at || "").localeCompare(String(a.last_saved_at || "")) || String(a.uid).localeCompare(String(b.uid)))
    .slice(0, MAX_SYNC_FAVORITES);
}

function sameData(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function mergeSyncLibrary(current, payload, sourceHint = "unknown") {
  const currentItems = Array.isArray(current?.items) ? current.items : [];
  const incoming = Array.isArray(payload?.favorites)
    ? payload.favorites
    : Array.isArray(payload?.items)
      ? payload.items
      : [];

  const items = unionFavorites(currentItems, incoming, sourceHint);
  const representedIds = new Set(items.flatMap(item => item.aliases?.ids || []).map(String));

  const currentOrphans = uniqueStrings(current?.orphan_ids || [], MAX_SYNC_ORPHAN_IDS);
  const incomingLikedIds = uniqueStrings(
    payload?.likedIds ?? payload?.liked_ids ?? payload?.orphan_ids ?? [],
    MAX_SYNC_ORPHAN_IDS
  );
  const orphanIds = uniqueStrings([...currentOrphans, ...incomingLikedIds], MAX_SYNC_ORPHAN_IDS)
    .filter(id => !representedIds.has(id));

  const previousComparable = {
    items: unionFavorites(currentItems, [], "existing"),
    orphan_ids: currentOrphans.filter(id => !representedIds.has(id))
  };
  const nextComparable = { items, orphan_ids: orphanIds };

  const previousUids = new Set(previousComparable.items.map(item => item.uid));
  const added = items.filter(item => !previousUids.has(item.uid)).length;

  return {
    schema_version: SYNC_SCHEMA_VERSION,
    items,
    orphan_ids: orphanIds,
    changed: !sameData(previousComparable, nextComparable),
    stats: {
      item_count: items.length,
      orphan_id_count: orphanIds.length,
      added_items: added,
      incoming_favorites: incoming.length,
      incoming_liked_ids: incomingLikedIds.length
    }
  };
}
