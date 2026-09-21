import { get } from "@vercel/blob";

const STATE_PATH = "velvet-sync/v1/favorites.json";

export default {
  async fetch() {
    try {
      const result = await get(STATE_PATH, {
        access: "private",
        useCache: false
      });
      return Response.json(
        {
          connected: true,
          state_exists: !!result,
          store_id_present: !!process.env.BLOB_STORE_ID,
          oidc_present: !!process.env.VERCEL_OIDC_TOKEN
        },
        {
          headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
          }
        }
      );
    } catch (error) {
      return Response.json(
        {
          connected: false,
          state_exists: false,
          store_id_present: !!process.env.BLOB_STORE_ID,
          oidc_present: !!process.env.VERCEL_OIDC_TOKEN,
          error_name: String(error?.name || "Error")
        },
        {
          status: 500,
          headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
          }
        }
      );
    }
  }
};
