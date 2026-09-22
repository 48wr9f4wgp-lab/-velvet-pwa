import { get, put } from "@vercel/blob";
import { mergeSyncLibrary } from "./velvet-sync-core.js";

const LEGACY_STATE_PATH = "velvet-sync/v1/favorites.json";
const CLIENT_PATHS = Object.freeze({
  scriptable: "velvet-sync/v2/clients/scriptable.json",
  pwa: "velvet-sync/v2/clients/pwa.json"
});

function emptyState() {
  return {
    schema_version: 1,
    revision: 0,
    updated_at: null,
    items: [],
    orphan_ids: []
  };
}

function normalizeStoredState(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyState();
  return {
    ...emptyState(),
    ...parsed,
    items: Array.isArray(parsed.items) ? parsed.items : [],
    orphan_ids: Array.isArray(parsed.orphan_ids) ? parsed.orphan_ids : []
  };
}

async function readPath(pathname) {
  const result = await get(pathname, {
    access: "private",
    useCache: false
  });
  if (!result) return emptyState();

  const text = await new Response(result.stream).text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    throw new Error("Velvet sync state is not valid JSON: " + pathname);
  }
  return normalizeStoredState(parsed);
}

async function writeClientSnapshot(client, payload) {
  const pathname = CLIENT_PATHS[client];
  if (!pathname) throw new Error("Unsupported sync client: " + client);

  const current = await readPath(pathname);
  const merged = mergeSyncLibrary(current, payload, client);
  if (!merged.changed) {
    return {
      ...current,
      write_performed: false,
      stats: merged.stats
    };
  }

  const next = {
    schema_version: 1,
    revision: Math.max(0, Number(current.revision) || 0) + 1,
    updated_at: new Date().toISOString(),
    items: merged.items,
    orphan_ids: merged.orphan_ids
  };

  await put(pathname, JSON.stringify(next), {
    access: "private",
    contentType: "application/json; charset=utf-8",
    cacheControlMaxAge: 60,
    allowOverwrite: true
  });

  return {
    ...next,
    write_performed: true,
    stats: merged.stats
  };
}

export function combineFavoriteStates(states) {
  const list = Array.isArray(states) ? states : [];
  let combined = emptyState();
  let revision = 0;
  let updatedAt = null;

  for (const row of list) {
    const state = normalizeStoredState(row?.state ?? row);
    const source = String(row?.source || "shared");
    const merged = mergeSyncLibrary(combined, {
      items: state.items,
      orphan_ids: state.orphan_ids
    }, source);

    combined = {
      ...combined,
      items: merged.items,
      orphan_ids: merged.orphan_ids
    };
    revision += Math.max(0, Number(state.revision) || 0);
    if (state.updated_at && (!updatedAt || String(state.updated_at) > String(updatedAt))) {
      updatedAt = state.updated_at;
    }
  }

  return {
    schema_version: 2,
    revision,
    updated_at: updatedAt,
    items: combined.items,
    orphan_ids: combined.orphan_ids,
    add_only: true
  };
}

export async function readFavoriteLibrary() {
  const [legacy, scriptable, pwa] = await Promise.all([
    readPath(LEGACY_STATE_PATH),
    readPath(CLIENT_PATHS.scriptable),
    readPath(CLIENT_PATHS.pwa)
  ]);

  return combineFavoriteStates([
    { source: "legacy", state: legacy },
    { source: "scriptable", state: scriptable },
    { source: "pwa", state: pwa }
  ]);
}

export async function unionFavoriteLibrary(payload, sourceHint) {
  const client = sourceHint === "scriptable" ? "scriptable"
    : sourceHint === "pwa" ? "pwa"
      : null;
  if (!client) {
    const error = new Error("Unsupported sync source");
    error.statusCode = 400;
    throw error;
  }

  const clientState = await writeClientSnapshot(client, payload);
  const combined = await readFavoriteLibrary();

  return {
    ...combined,
    client,
    client_revision: Number(clientState.revision || 0),
    client_write_performed: !!clientState.write_performed,
    stats: clientState.stats || null
  };
}
