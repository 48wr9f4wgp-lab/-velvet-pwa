import { get, put, list } from "@vercel/blob";
import { createHash } from "node:crypto";
import { combineSyncStates, mergeSyncLibrary } from "./velvet-sync-core.js";
import { createMediaStore, hydrateMediaState } from "./velvet-private-media.js";
const mediaStore = createMediaStore({ get, put, list });

// V53: old snapshots remain read-only. New input is retained as immutable records.
export const IDENTITY_VERSION = 53;
const PREFIX = "velvet-sync/v53/input/";
const LEGACY_PATHS = [
  "velvet-sync/v1/favorites.json",
  "velvet-sync/v2/clients/scriptable.json",
  "velvet-sync/v2/clients/pwa.json"
];
const MAX_JOURNALS = 512;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const empty = () => ({ items: [], orphan_ids: [], revision: 0 });
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });

function stateFromInput(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) throw fail("invalid_stored_state", 500);
  if (document.format === "velvet-input-v53") {
    return { ...mergeSyncLibrary(empty(), document.payload, document.source), revision: 1, updated_at: document.created_at };
  }
  if (!Array.isArray(document.items) || !Array.isArray(document.orphan_ids)) throw fail("invalid_stored_state", 500);
  return document;
}

async function readDocument(pathname) {
  const response = await get(pathname, { access: "private", useCache: false });
  if (!response) return null;
  if (!response.stream || response.statusCode !== 200) throw fail("unreadable_stored_state", 500);
  const text = await new Response(response.stream).text();
  if (Buffer.byteLength(text) > MAX_TEXT_BYTES) throw fail("stored_state_too_large", 500);
  return JSON.parse(text);
}

function inputKey(payload, source) {
  const normalized = mergeSyncLibrary(empty(), payload, source);
  const items = normalized.items.map(item => ({
    id: item.id, source: item.source, image_url: item.image_url, thumb_url: item.thumb_url,
    page_url: item.page_url, source_label: item.source_label, title: item.title,
    ids: [...item.aliases.ids].sort()
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash("sha256").update(JSON.stringify({ source, items, ids: [...normalized.orphan_ids].sort() })).digest("hex");
}

async function journalPaths() {
  const paths = new Set();
  let cursor;
  const seenCursors = new Set();
  do {
    const page = await list({ prefix: PREFIX, limit: 1000, ...(cursor ? { cursor } : {}) });
    if (!Array.isArray(page.blobs)) throw fail("invalid_journal_listing", 500);
    for (const blob of page.blobs) {
      if (typeof blob.pathname !== "string" || !blob.pathname.startsWith(PREFIX) || !blob.pathname.endsWith(".json")) continue;
      paths.add(blob.pathname);
      if (paths.size > MAX_JOURNALS) throw fail("journal_capacity_exceeded");
    }
    if (!page.hasMore) break;
    if (!page.cursor || seenCursors.has(page.cursor)) throw fail("journal_pagination_failed", 500);
    seenCursors.add(page.cursor);
    cursor = page.cursor;
  } while (true);
  return [...paths].sort();
}

async function readLibrary({ include = null } = {}) {
  const paths = [...LEGACY_PATHS, ...await journalPaths()];
  const states = [];
  // Bound concurrent requests and never treat a failed read as an empty library.
  for (let i = 0; i < paths.length; i += 4) {
    const rows = await Promise.all(paths.slice(i, i + 4).map(async path => {
      const document = await readDocument(path);
      if (document === null && path.startsWith(PREFIX)) throw fail("journal_missing_during_read", 500);
      return document === null ? null : { source: "shared", state: stateFromInput(document) };
    }));
    states.push(...rows.filter(Boolean));
  }
  if (include) states.push({ source: include.source, state: stateFromInput(include) });
  const repairs = await mediaStore.readRepairs();
  const hydrated = states.map(row => ({ ...row, state: hydrateMediaState(row.state, repairs) }));
  return { ...combineSyncStates(hydrated), identity_version: IDENTITY_VERSION, media_version: 54, immutable_inputs: true };
}

export async function readFavoriteLibrary() { return readLibrary(); }

function protectLegacyScriptable(payload, library) {
  const existing = new Set((payload.favorites || []).map(x => String(x.id || "")).filter(Boolean));
  const currentIds = new Set([...(payload.likedIds || []), ...existing].map(String));
  const chosenIds = library.items.map(item =>
    [item.id, ...(item.aliases?.ids || [])].find(id => currentIds.has(String(id))) || item.id
  ).filter(Boolean).map(String);
  if (new Set([...existing, ...chosenIds]).size > 240 || new Set([...currentIds, ...chosenIds, ...library.orphan_ids]).size > 500) {
    throw fail("legacy_client_capacity_exceeded");
  }
}

export async function unionFavoriteLibrary(payload, source) {
  if (!["scriptable", "pwa", "recovery"].includes(source)) throw fail("invalid_source", 400);
  if (!payload || !Array.isArray(payload.favorites) || !Array.isArray(payload.likedIds)) throw fail("invalid_payload", 400);
  if (payload.favorites.length > 1000 || payload.likedIds.length > 1200) throw fail("input_capacity_exceeded");
  // The request is already authenticated by the API. Only favorite data is retained.
  const document = {
    format: "velvet-input-v53", source, created_at: new Date().toISOString(),
    payload: { favorites: payload.favorites, likedIds: payload.likedIds }
  };
  const encoded = JSON.stringify(document);
  if (Buffer.byteLength(encoded) > MAX_TEXT_BYTES) throw fail("payload_too_large", 413);
  const key = inputKey(document.payload, source);
  const pathname = PREFIX + source + "/" + key + ".json";
  const before = await readLibrary();
  const repairs = await mediaStore.readRepairs();
  const proposed = mergeSyncLibrary(before, {
    ...document.payload,
    favorites: hydrateMediaState({ items: document.payload.favorites }, repairs).items
  }, source);
  if (source === "scriptable") protectLegacyScriptable(document.payload, proposed);

  let wrote = false;
  const existing = await readDocument(pathname);
  if (existing) {
    if (existing.format !== "velvet-input-v53" || inputKey(existing.payload, existing.source) !== key) throw fail("receipt_mismatch", 500);
  } else {
    if ((await journalPaths()).length >= MAX_JOURNALS) throw fail("journal_capacity_exceeded");
    try {
      await put(pathname, encoded, {
        access: "private", contentType: "application/json; charset=utf-8",
        addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 60
      });
      wrote = true;
    } catch (error) {
      // A duplicate concurrent submission is acceptable only after a verified read.
      const raced = await readDocument(pathname);
      if (!raced || raced.format !== "velvet-input-v53" || inputKey(raced.payload, raced.source) !== key) throw error;
    }
  }
  const stored = await readDocument(pathname);
  if (!stored || stored.format !== "velvet-input-v53" || inputKey(stored.payload, stored.source) !== key) throw fail("input_persistence_unverified", 500);
  // Include our verified immutable record if the listing has not caught up yet.
  const combined = await readLibrary({ include: stored });
  return { ...combined, client: source, client_write_performed: wrote, receipt: key, receipt_verified: true };
}
