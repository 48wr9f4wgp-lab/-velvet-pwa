import { del, get, put } from "@vercel/blob";

const PROBE_PATH = "velvet-sync/health/probe.json";

export default {
  async fetch() {
    let writeOk = false;
    let readOk = false;
    let cleanupOk = false;
    let blobUrl = null;

    try {
      const payload = JSON.stringify({
        kind: "velvet-sync-health-probe",
        created_at: new Date().toISOString()
      });

      const written = await put(PROBE_PATH, payload, {
        access: "private",
        contentType: "application/json; charset=utf-8",
        allowOverwrite: true,
        cacheControlMaxAge: 60
      });
      blobUrl = written.url;
      writeOk = true;

      const result = await get(written.url, {
        access: "private",
        useCache: false
      });
      if (result?.statusCode === 200) {
        const text = await new Response(result.stream).text();
        const parsed = JSON.parse(text);
        readOk = parsed?.kind === "velvet-sync-health-probe";
      }

      await del(written.url);
      cleanupOk = true;

      return Response.json({
        connected: writeOk && readOk && cleanupOk,
        write_ok: writeOk,
        read_ok: readOk,
        cleanup_ok: cleanupOk,
        store_id_present: !!process.env.BLOB_STORE_ID,
        oidc_env_present: !!process.env.VERCEL_OIDC_TOKEN
      }, {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      });
    } catch (error) {
      if (blobUrl && !cleanupOk) {
        try {
          await del(blobUrl);
          cleanupOk = true;
        } catch (_) {}
      }

      return Response.json({
        connected: false,
        write_ok: writeOk,
        read_ok: readOk,
        cleanup_ok: cleanupOk,
        store_id_present: !!process.env.BLOB_STORE_ID,
        oidc_env_present: !!process.env.VERCEL_OIDC_TOKEN,
        error_name: String(error?.name || "Error"),
        error_message: String(error?.message || "").slice(0, 240)
      }, {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }
  }
};
