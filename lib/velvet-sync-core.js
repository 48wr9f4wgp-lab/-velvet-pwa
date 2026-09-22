import { expandFavorite, unionMediaFavorites } from "../src/favorite-identity-v3.js";
export { sanitizeHttpUrl, canonicalizeUrlForIdentity } from "../src/favorite-identity-v3.js";
// Compatibility exports are warning thresholds, never destructive retention limits.
export const MAX_SYNC_FAVORITES = 1000;
export const MAX_SYNC_ORPHAN_IDS = 1200;
const array = x => Array.isArray(x) ? x : [];
const ids = x => [...new Set(array(x).filter(v => typeof v === "string" && v.trim()).map(v => v.trim()))].sort();
export const normalizeFavorite = (raw, hint) => expandFavorite(raw, hint)[0] || null;
export const unionFavorites = unionMediaFavorites;
export function mergeSyncLibrary(current, payload, sourceHint = "unknown") {
  const beforeItems = array(current?.items);
  const incoming = array(payload?.favorites ?? payload?.items);
  const items = unionFavorites(beforeItems, incoming, sourceHint);
  const represented = new Set(items.flatMap(x => x.aliases.ids));
  const incomingIds = ids(payload?.likedIds ?? payload?.liked_ids ?? payload?.orphan_ids);
  const orphans = ids([...ids(current?.orphan_ids), ...incomingIds]).filter(id => !represented.has(id));
  const previous = { items: unionFavorites(beforeItems, [], "existing"), orphan_ids: ids(current?.orphan_ids).filter(id => !represented.has(id)) };
  const next = { items, orphan_ids: orphans };
  const old = new Set(previous.items.map(x => x.uid));
  return {
    schema_version: 3, ...next,
    changed: JSON.stringify(previous) !== JSON.stringify(next),
    stats: { item_count: items.length, orphan_id_count: orphans.length, added_items: items.filter(x => !old.has(x.uid)).length,
      incoming_favorites: incoming.length, incoming_liked_ids: incomingIds.length,
      image_items: items.filter(x => x.image_url || x.thumb_url).length,
      metadata_only_items: items.filter(x => !x.image_url && !x.thumb_url).length,
      recovered_variants: items.filter(x => x.recovery_split).length }
  };
}
export function combineSyncStates(states) {
  let state = { items: [], orphan_ids: [] }, revision = 0, updatedAt = null;
  for (const row of array(states)) {
    const s = row?.state ?? row ?? {};
    state = mergeSyncLibrary(state, { items: array(s.items), orphan_ids: array(s.orphan_ids) }, row?.source || "existing");
    revision += Math.max(0, Number(s.revision) || 0);
    if (s.updated_at && (!updatedAt || s.updated_at > updatedAt)) updatedAt = s.updated_at;
  }
  return { schema_version: 3, identity_version: 3, revision, updated_at: updatedAt, items: state.items, orphan_ids: state.orphan_ids, add_only: true };
}
