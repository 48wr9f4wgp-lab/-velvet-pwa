import { bootstrapSyncConfig, readSyncConfig } from "../lib/velvet-sync-config.js";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex"
    }
  });
}

export default {
  async fetch(request) {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);

    const url = new URL(request.url);
    const create = url.searchParams.get("create") === "1";

    try {
      const existing = await readSyncConfig();
      if (existing) {
        return json({
          configured: true,
          created_now: false,
          pair_code: null,
          created_at: existing.created_at
        });
      }

      if (!create) {
        return json({
          configured: false,
          created_now: false,
          pair_code: null,
          action: "open_with_create_1"
        });
      }

      const result = await bootstrapSyncConfig();
      return json({
        configured: true,
        created_now: result.created,
        pair_code: result.pair_code,
        created_at: result.config.created_at,
        warning: result.created
          ? "Save this pairing code now. It will not be shown again."
          : "Pairing code already existed and is not re-exposed."
      });
    } catch (error) {
      return json({
        configured: false,
        error: "bootstrap_failed",
        error_name: String(error?.name || "Error")
      }, 500);
    }
  }
};
