import { isAuthorizedRequest } from "../lib/velvet-sync-auth.js";
import { IDENTITY_VERSION, readFavoriteLibrary, unionFavoriteLibrary } from "../lib/velvet-sync-journal.js";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Velvet-Identity": String(IDENTITY_VERSION), ...headers
  }});
}
export default {
  async fetch(request) {
    let authorized = false;
    try { authorized = await isAuthorizedRequest(request); }
    catch (_) { return json({ error: "sync_not_configured" }, 503); }
    if (!authorized) return json({ error: "unauthorized" }, 401);
    if (request.method === "GET") {
      if (new URL(request.url).searchParams.get("meta") === "1") {
        return json({ identity_version: IDENTITY_VERSION, immutable_inputs: true, recovery_source: true });
      }
      try { return json(await readFavoriteLibrary()); }
      catch (_) { return json({ error: "read_failed" }, 500); }
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { Allow: "GET, POST" });
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
    let body;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
      body = JSON.parse(raw);
    } catch (_) { return json({ error: "invalid_json" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_payload" }, 400);
    const source = String(body.source || request.headers.get("x-velvet-client") || "").toLowerCase();
    try { return json(await unionFavoriteLibrary(body, source)); }
    catch (error) {
      const status = [400, 409, 413].includes(error?.statusCode) ? error.statusCode : 500;
      const allowed = new Set(["invalid_source", "invalid_payload", "payload_too_large", "favorite_capacity_exceeded", "input_capacity_exceeded", "journal_capacity_exceeded", "legacy_client_capacity_exceeded"]);
      return json({ error: allowed.has(error?.message) ? error.message : "write_failed" }, status);
    }
  }
};
