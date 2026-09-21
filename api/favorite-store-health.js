export default function handler(_request, response) {
  const configured = {
    blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    vercelKv: Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
    upstashRedis: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    postgres: Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL),
    edgeConfig: Boolean(process.env.EDGE_CONFIG),
    supabase: Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY))
  };
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    ok: true,
    anyPersistentStore: Object.values(configured).some(Boolean),
    configured
  });
}
