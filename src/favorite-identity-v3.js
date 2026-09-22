/** Media identity is not page identity. Alias evidence never joins different media. */
export const FAVORITE_IDENTITY_VERSION = 3;
const arr = value => Array.isArray(value) ? value : [];
const text = value => typeof value === "string" ? value.trim() : "";
const unique = values => [...new Set(values.map(text).filter(Boolean))].sort();
const first = (...values) => values.map(text).find(Boolean) || "";
const TRACKING = new Set(["fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "igshid"]);

export function sanitizeHttpUrl(value) {
  try {
    const u = new URL(text(value));
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return "";
    u.hash = "";
    return u.toString();
  } catch (_) { return ""; }
}

export function canonicalizeUrlForIdentity(value) {
  const clean = sanitizeHttpUrl(value);
  if (!clean) return "";
  const u = new URL(clean);
  const pairs = [...u.searchParams].filter(([k]) => !k.toLowerCase().startsWith("utm_") && !TRACKING.has(k.toLowerCase()));
  pairs.sort(([a, x], [b, y]) => a.localeCompare(b) || x.localeCompare(y));
  u.search = "";
  for (const [k, v] of pairs) u.searchParams.append(k, v);
  // Do not remove token/signature/ref/id: on an unknown host these may select another image.
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
  return u.toString();
}

export function canonicalMediaUrl(value) {
  const clean = canonicalizeUrlForIdentity(value);
  if (!clean) return "";
  const u = new URL(clean);
  // This is a size selector on this exact host, not a general query-removal rule.
  if (u.hostname === "pbs.twimg.com") {
    u.searchParams.delete("name");
    u.pathname = u.pathname.replace(/:(small|medium|large|orig)$/i, "");
  }
  return u.toString();
}

export function favoriteMediaUrl(item) {
  return [item?.image_url, item?.imageURL, item?.media_url, item?.mediaURL, item?.thumb_url, item?.thumbURL]
    .map(sanitizeHttpUrl).find(Boolean) || "";
}

function date(value, fallback = "1970-01-01T00:00:00.000Z") {
  if (value === null || value === undefined || value === "") return fallback;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : fallback;
}

function aliasUrls(raw) {
  return unique([
    favoriteMediaUrl(raw),
    ...arr(raw?.aliases?.media_urls),
    // Old groups stored additional media in their fingerprints as well.
    ...arr(raw?.aliases?.fingerprints).filter(x => typeof x === "string" && x.startsWith("m:")).map(x => x.slice(2))
  ].map(sanitizeHttpUrl).filter(Boolean));
}

export function expandFavorite(raw, sourceHint = "unknown") {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const source = first(raw.source, raw.site, sourceHint, "unknown");
  const originalId = first(raw.id, raw.source_id, raw.sourceId);
  const media = new Map();
  for (const url of aliasUrls(raw)) {
    const key = canonicalMediaUrl(url);
    if (!media.has(key)) media.set(key, []);
    media.get(key).push(url);
  }
  const primaryMedia = favoriteMediaUrl(raw);
  const primaryKey = canonicalMediaUrl(primaryMedia);
  const page = sanitizeHttpUrl(first(raw.page_url, raw.pageURL, raw.url));
  const pages = unique([page, ...arr(raw?.aliases?.page_urls)].map(sanitizeHttpUrl));
  const legacyIds = unique([...arr(raw?.aliases?.ids), ...arr(raw.legacy_ids), originalId]);
  if (!media.size && !originalId && !page) return [];
  const split = media.size > 1 || raw.recovery_split === true;
  const groups = media.size ? [...media.entries()] : [["", []]];
  return groups.map(([key, urls]) => {
    const image = urls.includes(primaryMedia) ? primaryMedia : (urls[0] || "");
    const uid = key ? "m:" + key : "s:" + source.toLowerCase() + ":" + (originalId || page);
    const id = key ? "fv3:" + key : (originalId || "fv3-meta:" + uid);
    const firstSaved = date(raw.first_saved_at ?? raw.saved_at ?? raw.archived_at ?? raw.ts);
    const isExtra = !!key && key !== primaryKey;
    const sameThumb = key === primaryKey;
    const evidence = raw.recovery_evidence && typeof raw.recovery_evidence === "object" ? raw.recovery_evidence : {};
    return {
      identity_version: 3, uid, id,
      image_url: image,
      thumb_url: sameThumb ? sanitizeHttpUrl(first(raw.thumb_url, raw.thumbURL)) || null : null,
      page_url: page || pages[0] || null,
      title: text(raw.title), source,
      source_label: first(raw.source_label, raw.sourceLabel, source),
      source_class: ["personal", "pro", "mixed"].includes(raw.source_class ?? raw.sourceClass) ? (raw.source_class ?? raw.sourceClass) : null,
      tags: unique(arr(raw.tags)),
      published_at_ms: Math.max(0, Number(raw.published_at_ms ?? raw.publishedAtMs) || 0),
      intensity: Math.max(1, Math.min(5, Number(raw.intensity) || 3)), rank: Math.max(1, Number(raw.rank) || 1),
      rights_status: first(raw.rights_status, raw.rightsStatus, "external-public-source"),
      first_saved_at: firstSaved,
      last_saved_at: date(raw.last_saved_at ?? raw.saved_at ?? raw.archived_at ?? raw.ts, firstSaved),
      aliases: {
        ids: unique([...legacyIds, id]), page_urls: pages, media_urls: unique(urls),
        sources: unique([...arr(raw?.aliases?.sources), source]), fingerprints: [uid]
      },
      provenance: unique([...arr(raw.provenance), ...(["pwa", "scriptable", "recovery"].includes(sourceHint) ? [sourceHint] : [])]),
      recovery_split: split,
      // Retain ambiguity instead of inventing which old ID belonged to which image.
      recovery_evidence: {
        ...evidence,
        legacy_ids: unique([...arr(evidence.legacy_ids), ...legacyIds.filter(x => !x.startsWith("fv3:"))]),
        page_association_unverified: evidence.page_association_unverified === true || (split && (isExtra || pages.length > 1))
      }
    };
  });
}

function mergeSameMedia(a, b) {
  const newest = a.last_saved_at >= b.last_saved_at ? a : b;
  const other = newest === a ? b : a;
  const out = { ...other, ...newest };
  for (const k of ["title", "image_url", "thumb_url", "page_url", "source_label", "source_class"]) out[k] = newest[k] || other[k];
  out.tags = unique([...a.tags, ...b.tags]);
  out.first_saved_at = [a.first_saved_at, b.first_saved_at].sort()[0];
  out.last_saved_at = [a.last_saved_at, b.last_saved_at].sort().at(-1);
  out.aliases = {};
  for (const k of ["ids", "page_urls", "media_urls", "sources"]) out.aliases[k] = unique([...arr(a.aliases[k]), ...arr(b.aliases[k])]);
  out.aliases.fingerprints = [out.uid];
  out.provenance = unique([...a.provenance, ...b.provenance]);
  out.recovery_split = a.recovery_split || b.recovery_split;
  out.recovery_evidence = {
    legacy_ids: unique([...arr(a.recovery_evidence.legacy_ids), ...arr(b.recovery_evidence.legacy_ids)]),
    page_association_unverified: a.recovery_evidence.page_association_unverified || b.recovery_evidence.page_association_unverified
  };
  return out;
}

export function unionMediaFavorites(existing = [], incoming = [], sourceHint = "unknown") {
  const map = new Map();
  for (const [rows, hint] of [[arr(existing), "existing"], [arr(incoming), sourceHint]]) {
    for (const row of rows) for (const item of expandFavorite(row, hint)) {
      map.set(item.uid, map.has(item.uid) ? mergeSameMedia(map.get(item.uid), item) : item);
    }
  }
  return [...map.values()].sort((a, b) => b.last_saved_at.localeCompare(a.last_saved_at) || a.uid.localeCompare(b.uid));
}

export function mergeFavoriteDisplayRows(localRows, sharedRows) {
  const preferredIds = new Map();
  for (const row of arr(localRows)) {
    const key = canonicalMediaUrl(favoriteMediaUrl(row));
    if (key && row?.id && !preferredIds.has(key)) preferredIds.set(key, String(row.id));
  }
  return unionMediaFavorites(localRows, sharedRows, "existing").map(row => ({
    ...row, id: preferredIds.get(canonicalMediaUrl(row.image_url)) || row.id, archived_favorite: true
  }));
}
