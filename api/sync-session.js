import {
  clearSessionCookie,
  isAuthorizedRequest,
  issueSessionToken,
  makeSessionCookie,
  verifyPairCode
} from "../lib/velvet-sync-auth.js";

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

export default {
  async fetch(request) {
    if (request.method === "GET") {
      let authenticated = false;
      try { authenticated = await isAuthorizedRequest(request); } catch (_) {}
      return json({ authenticated });
    }

    if (request.method === "DELETE") {
      return json({ authenticated: false }, 200, {
        "Set-Cookie": clearSessionCookie()
      });
    }

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, { Allow: "GET, POST, DELETE" });
    }

    const size = Number(request.headers.get("content-length") || 0);
    if (size > 4096) return json({ error: "payload_too_large" }, 413);

    let body;
    try { body = await request.json(); }
    catch (_) { return json({ error: "invalid_json" }, 400); }

    const code = typeof body?.code === "string" ? body.code : "";
    let valid = false;
    try { valid = await verifyPairCode(code); }
    catch (_) { return json({ error: "sync_not_configured" }, 503); }
    if (!valid) return json({ error: "unauthorized" }, 401);

    let token;
    try { token = await issueSessionToken(); }
    catch (_) { return json({ error: "sync_not_configured" }, 503); }

    return json({ authenticated: true }, 200, {
      "Set-Cookie": makeSessionCookie(token)
    });
  }
};
