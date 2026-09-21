import { isAuthorizedRequest } from "../lib/velvet-sync-auth.js";
import { readFavoriteLibrary, unionFavoriteLibrary } from "../lib/velvet-sync-store.js";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}

function sourceHint(request, body) {
  const requested = String(body?.source || request.headers.get("x-velvet-client") || "").toLowerCase();
  return ["pwa", "scriptable", "recovery"].includes(requested) ? requested : "unknown";
}

export default {
  async fetch(request) {
    let authorized = false;
    try { authorized = await isAuthorizedRequest(request); }
    catch (_) { return json({ error: "sync_not_configured" }, 503); }
    if (!authorized) return json({ error: "unauthorized" }, 401);

    if (request.method === "GET") {
      try {
        const state = await readFavoriteLibrary();
        return json(state);
      } catch (_) {
        return json({ error: "read_failed" }, 500);
      }
    }

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, { Allow: "GET, POST" });
    }

    const size = Number(request.headers.get("content-length") || 0);
    if (size > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);

    let body;
    try { body = await request.json(); }
    catch (_) { return json({ error: "invalid_json" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "invalid_payload" }, 400);
    }

    try {
      const state = await unionFavoriteLibrary(body, sourceHint(request, body));
      return json(state);
    } catch (error) {
      const status = Number(error?.statusCode) === 409 ? 409 : 500;
      return json({ error: status === 409 ? "sync_conflict" : "write_failed" }, status);
    }
  }
};
