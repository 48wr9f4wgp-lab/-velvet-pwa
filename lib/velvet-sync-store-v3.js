import { combineSyncStates, mergeSyncLibrary } from "./velvet-sync-core.js";
// Prior v1/v2 snapshots are read-only evidence. New writes use isolated v3 paths.
export const BASELINE_PATHS = ["velvet-sync/v1/favorites.json", "velvet-sync/v2/clients/scriptable.json", "velvet-sync/v2/clients/pwa.json"];
export const CLIENT_PATHS = Object.freeze({ scriptable: "velvet-sync/v3/clients/scriptable.json", pwa: "velvet-sync/v3/clients/pwa.json" });
const empty = () => ({ schema_version: 3, revision: 0, updated_at: null, items: [], orphan_ids: [] });
export function createFavoriteStore({ get, put, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  async function readPath(path) {
    const r = await get(path, { access: "private", useCache: false });
    if (!r) return { state: empty(), exists: false, etag: null };
    if (r.statusCode !== 200 || !r.stream) throw new Error("Unexpected favorite store read response");
    const parsed = JSON.parse(await new Response(r.stream).text());
    if (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.orphan_ids)) throw new Error("Invalid favorite store shape; refusing to overwrite");
    return { state: parsed, exists: true, etag: r.blob?.etag || r.headers?.get?.("etag") || null };
  }
  async function readFavoriteLibrary() {
    const paths = [...BASELINE_PATHS, ...Object.values(CLIENT_PATHS)];
    const rows = await Promise.all(paths.map(readPath));
    return combineSyncStates(rows.map(x => ({ state: x.state, source: "existing" })));
  }
  async function unionFavoriteLibrary(payload, client) {
    if (!Object.hasOwn(CLIENT_PATHS, client)) throw Object.assign(new Error("Unsupported sync source"), { statusCode: 400 });
    const path = CLIENT_PATHS[client];
    for (let attempt = 0; attempt < 5; attempt++) {
      const before = await readPath(path);
      const merged = mergeSyncLibrary(before.state, payload, client);
      if (!merged.changed) return { ...await readFavoriteLibrary(), client, client_write_performed: false, stats: merged.stats };
      if (before.exists && !before.etag) throw new Error("Missing ETag; refusing blind overwrite");
      const next = { schema_version: 3, revision: (Number(before.state.revision) || 0) + 1, updated_at: new Date().toISOString(), items: merged.items, orphan_ids: merged.orphan_ids };
      try {
        await put(path, JSON.stringify(next), {
          access: "private", contentType: "application/json; charset=utf-8", cacheControlMaxAge: 60,
          addRandomSuffix: false, allowOverwrite: before.exists,
          ...(before.exists ? { ifMatch: before.etag } : {})
        });
        return { ...await readFavoriteLibrary(), client, client_revision: next.revision, client_write_performed: true, stats: merged.stats };
      } catch (e) {
        const conflict = [409, 412].includes(Number(e?.statusCode ?? e?.status)) || /Precondition|AlreadyExists|Conflict/.test(String(e?.name)) || /already exists|precondition/i.test(String(e?.message));
        if (!conflict) throw e;
        if (attempt === 4) throw Object.assign(new Error("Favorite sync conflict; original data retained"), { statusCode: 409 });
        await pause(40 * 2 ** attempt);
      }
    }
  }
  return { readFavoriteLibrary, unionFavoriteLibrary };
}
