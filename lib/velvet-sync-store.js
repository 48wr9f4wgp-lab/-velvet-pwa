import { get, put, BlobPreconditionFailedError } from "@vercel/blob";
import { mergeSyncLibrary } from "./velvet-sync-core.js";

const STATE_PATH = "velvet-sync/v1/favorites.json";
const MAX_WRITE_ATTEMPTS = 4;

function emptyState() {
  return {
    schema_version: 1,
    revision: 0,
    updated_at: null,
    items: [],
    orphan_ids: []
  };
}

async function readCurrent() {
  const result = await get(STATE_PATH, {
    access: "private",
    useCache: false
  });
  if (!result) return { state: emptyState(), etag: null };

  const text = await new Response(result.stream).text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    throw new Error("Velvet sync state is not valid JSON; refusing to overwrite it");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Velvet sync state has an invalid shape; refusing to overwrite it");
  }

  return {
    state: {
      ...emptyState(),
      ...parsed,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      orphan_ids: Array.isArray(parsed.orphan_ids) ? parsed.orphan_ids : []
    },
    etag: result.blob.etag
  };
}

function conflictError(error) {
  if (error instanceof BlobPreconditionFailedError) return true;
  const name = String(error?.name || "");
  const message = String(error?.message || "");
  const status = Number(error?.statusCode ?? error?.status ?? 0);
  return /Precondition|AlreadyExists|Conflict/i.test(name)
    || /precondition|already exists|conflict/i.test(message)
    || status === 409
    || status === 412;
}

export async function readFavoriteLibrary() {
  return (await readCurrent()).state;
}

export async function unionFavoriteLibrary(payload, sourceHint) {
  let lastConflict = null;

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const current = await readCurrent();
    const merged = mergeSyncLibrary(current.state, payload, sourceHint);

    if (!merged.changed) {
      return {
        ...current.state,
        stats: merged.stats,
        write_performed: false
      };
    }

    const next = {
      schema_version: 1,
      revision: Math.max(0, Number(current.state.revision) || 0) + 1,
      updated_at: new Date().toISOString(),
      items: merged.items,
      orphan_ids: merged.orphan_ids
    };

    try {
      await put(STATE_PATH, JSON.stringify(next), {
        access: "private",
        contentType: "application/json; charset=utf-8",
        cacheControlMaxAge: 60,
        allowOverwrite: !!current.etag,
        ...(current.etag ? { ifMatch: current.etag } : {})
      });

      return {
        ...next,
        stats: merged.stats,
        write_performed: true
      };
    } catch (error) {
      if (!conflictError(error)) throw error;
      lastConflict = error;
    }
  }

  const error = new Error("Velvet sync state changed too many times; retry the sync");
  error.cause = lastConflict;
  error.statusCode = 409;
  throw error;
}
