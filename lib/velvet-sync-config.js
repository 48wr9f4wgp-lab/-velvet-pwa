import { createHash, randomBytes } from "node:crypto";
import { get, put, BlobPreconditionFailedError } from "@vercel/blob";

const CONFIG_PATH = "velvet-sync/v1/config.json";

export function hashPairCode(code) {
  return createHash("sha256").update(String(code || ""), "utf8").digest("hex");
}

function makePairCode() {
  const raw = randomBytes(24).toString("base64url");
  return raw.match(/.{1,4}/g).join("-");
}

function validConfig(value) {
  return !!value
    && typeof value === "object"
    && value.schema_version === 1
    && typeof value.pair_hash === "string"
    && /^[a-f0-9]{64}$/i.test(value.pair_hash)
    && typeof value.session_secret === "string"
    && value.session_secret.length >= 40;
}

export async function readSyncConfig() {
  const result = await get(CONFIG_PATH, {
    access: "private",
    useCache: false
  });
  if (!result) return null;

  const text = await new Response(result.stream).text();
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (_) { throw new Error("Velvet sync config is invalid JSON"); }

  if (!validConfig(parsed)) throw new Error("Velvet sync config has an invalid shape");
  return parsed;
}

function isConflict(error) {
  return error instanceof BlobPreconditionFailedError
    || Number(error?.statusCode ?? error?.status ?? 0) === 409
    || Number(error?.statusCode ?? error?.status ?? 0) === 412
    || /already exists|conflict|precondition/i.test(String(error?.message || ""));
}

export async function bootstrapSyncConfig() {
  const existing = await readSyncConfig();
  if (existing) return { created: false, config: existing, pair_code: null };

  const pairCode = makePairCode();
  const config = {
    schema_version: 1,
    pair_hash: hashPairCode(pairCode),
    session_secret: randomBytes(48).toString("base64url"),
    created_at: new Date().toISOString()
  };

  try {
    await put(CONFIG_PATH, JSON.stringify(config), {
      access: "private",
      contentType: "application/json; charset=utf-8",
      cacheControlMaxAge: 60,
      allowOverwrite: false
    });
    return { created: true, config, pair_code: pairCode };
  } catch (error) {
    if (!isConflict(error)) throw error;
    const raced = await readSyncConfig();
    if (!raced) throw error;
    return { created: false, config: raced, pair_code: null };
  }
}
