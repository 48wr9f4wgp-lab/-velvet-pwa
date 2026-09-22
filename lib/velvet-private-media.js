import { createHash } from "node:crypto";

// Only opaque keys are exposed in delivery URLs. Original metadata and images are never overwritten.
export const MEDIA_VERSION = 54;
export const MAX_MEDIA_BYTES = 1024 * 1024;
export const MEDIA_ORIGIN = "https://velvet-pwa-wine.vercel.app";
const INDEX_PREFIX = "velvet-sync/v54/media-index/";
const BYTES_PREFIX = "velvet-sync/v54/media-bytes/";
const HEX = /^[a-f0-9]{64}$/;
const MAX_RECEIPTS = 256;
export const mediaFailure = (code, statusCode = 409) => Object.assign(new Error(code), { statusCode });
export const sha256 = value => createHash("sha256").update(value).digest("hex");

export function mediaRecordKey(item) {
  const source = typeof item?.source === "string" ? item.source.trim().toLowerCase() : "";
  const id = typeof item?.id === "string" ? item.id.trim() : "";
  if (!source || !id || source.length > 128 || id.length > 512) throw mediaFailure("invalid_record", 400);
  return sha256(JSON.stringify([source, id]));
}
export function hasPrimaryMedia(item) {
  return [item?.image_url, item?.imageURL, item?.thumb_url, item?.thumbURL]
    .some(value => typeof value === "string" && value.trim());
}
export function mediaDeliveryUrl(key) {
  if (!HEX.test(key)) throw mediaFailure("invalid_key", 400);
  return MEDIA_ORIGIN + "/api/favorite-media?key=" + key;
}
function validateReceipt(row, key) {
  if (!row || row.format !== "velvet-media-v54" || !HEX.test(key)
      || row.key !== key || mediaRecordKey(row) !== key || !HEX.test(row.sha256)
      || !Number.isInteger(row.bytes) || row.bytes < 4 || row.bytes > MAX_MEDIA_BYTES
      || row.content_type !== "image/jpeg" || row.path !== BYTES_PREFIX + row.sha256 + ".jpg") {
    throw mediaFailure("invalid_media_receipt", 500);
  }
  return row;
}
export function hydrateMediaState(state, repairs) {
  return {
    ...state,
    items: (state.items || []).map(item => {
      if (hasPrimaryMedia(item)) return item;
      let key;
      try { key = mediaRecordKey(item); } catch (_) { return item; }
      if (!repairs.has(key)) return item;
      // A URL-less record is enriched, not replaced by an unrelated ID or profile match.
      return { ...item, image_url: mediaDeliveryUrl(key) };
    })
  };
}
export async function readBounded(stream, max = MAX_MEDIA_BYTES) {
  if (!stream) throw mediaFailure("empty_body", 400);
  const reader = stream.getReader(), parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw mediaFailure("payload_too_large", 413); }
      parts.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(parts, size);
}
function validateJpeg(bytes) {
  if (bytes.length < 4 || bytes.length > MAX_MEDIA_BYTES) throw mediaFailure("payload_too_large", 413);
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255
      || bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217) {
    throw mediaFailure("invalid_jpeg", 415);
  }
  // Bound dimensions from JPEG markers without decoding pixels.
  let offset = 2, dimensions = false, scan = false;
  while (offset + 3 < bytes.length) {
    if (bytes[offset++] !== 255) throw mediaFailure("invalid_jpeg", 415);
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 218) { scan = true; break; }
    if (marker === 217) break;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (offset + 2 > bytes.length) throw mediaFailure("invalid_jpeg", 415);
    const size = bytes.readUInt16BE(offset);
    if (size < 2 || offset + size > bytes.length) throw mediaFailure("invalid_jpeg", 415);
    if ([192,193,194].includes(marker)) {
      if (size < 8) throw mediaFailure("invalid_jpeg", 415);
      const height = bytes.readUInt16BE(offset + 3), width = bytes.readUInt16BE(offset + 5);
      if (!width || !height || width > 4096 || height > 4096 || width * height > 12000000) {
        throw mediaFailure("image_dimensions_exceeded", 413);
      }
      dimensions = true;
    }
    offset += size;
  }
  if (!dimensions || !scan) throw mediaFailure("invalid_jpeg", 415);
}

export function createMediaStore({ get, put, list }) {
  async function readReceipt(key) {
    if (!HEX.test(key)) throw mediaFailure("invalid_key", 400);
    const result = await get(INDEX_PREFIX + key + ".json", { access: "private", useCache: false });
    if (!result) return null;
    if (result.statusCode !== 200 || !result.stream) throw mediaFailure("media_receipt_unreadable", 500);
    const bytes = await readBounded(result.stream, 8192);
    let row;
    try { row = JSON.parse(bytes.toString("utf8")); } catch (_) { throw mediaFailure("invalid_media_receipt", 500); }
    return validateReceipt(row, key);
  }
  async function readRepairs() {
    const keys = new Set(), cursors = new Set();
    let cursor;
    do {
      const page = await list({ prefix: INDEX_PREFIX, limit: 1000, ...(cursor ? { cursor } : {}) });
      if (!Array.isArray(page.blobs)) throw mediaFailure("invalid_media_listing", 500);
      for (const blob of page.blobs) {
        const path = String(blob.pathname || "");
        if (!path.startsWith(INDEX_PREFIX) || !path.endsWith(".json")) throw mediaFailure("invalid_media_listing", 500);
        const key = path.slice(INDEX_PREFIX.length, -5);
        if (!HEX.test(key)) throw mediaFailure("invalid_media_listing", 500);
        keys.add(key);
        if (keys.size > MAX_RECEIPTS) throw mediaFailure("media_capacity_exceeded");
      }
      if (!page.hasMore) break;
      if (!page.cursor || cursors.has(page.cursor)) throw mediaFailure("media_pagination_failed", 500);
      cursors.add(page.cursor); cursor = page.cursor;
    } while (true);
    const repairs = new Map(), ordered = [...keys].sort();
    for (let i = 0; i < ordered.length; i += 4) {
      await Promise.all(ordered.slice(i, i + 4).map(async key => {
        const row = await readReceipt(key);
        if (!row) throw mediaFailure("media_receipt_missing", 500);
        repairs.set(key, row);
      }));
    }
    return repairs;
  }
  async function verifiedBytes(path, digest, size) {
    const response = await get(path, { access: "private", useCache: false });
    if (!response || response.statusCode !== 200 || !response.stream) throw mediaFailure("media_readback_failed", 500);
    const bytes = await readBounded(response.stream);
    if (bytes.length !== size || sha256(bytes) !== digest) throw mediaFailure("media_hash_mismatch", 500);
    return true;
  }
  async function upload(key, bytes, digest, readLibrary) {
    if (!HEX.test(key) || !HEX.test(digest)) throw mediaFailure("invalid_digest", 400);
    validateJpeg(bytes);
    if (sha256(bytes) !== digest) throw mediaFailure("request_hash_mismatch", 400);
    const prior = await readReceipt(key);
    if (prior) {
      if (prior.sha256 !== digest || prior.bytes !== bytes.length) throw mediaFailure("media_already_bound");
      await verifiedBytes(prior.path, digest, bytes.length);
      return { ...prior, created: false, verified: true };
    }
    const library = await readLibrary();
    const matches = (library.items || []).filter(item => {
      try { return mediaRecordKey(item) === key; } catch (_) { return false; }
    });
    if (matches.length !== 1) throw mediaFailure("target_not_unique");
    const item = matches[0];
    if (hasPrimaryMedia(item)) throw mediaFailure("target_already_has_media");
    const repairs = await readRepairs();
    if (repairs.size >= MAX_RECEIPTS) throw mediaFailure("media_capacity_exceeded");
    const path = BYTES_PREFIX + digest + ".jpg";
    const found = await get(path, { access: "private", useCache: false });
    if (found) {
      if (found.statusCode !== 200 || !found.stream) throw mediaFailure("media_readback_failed", 500);
      const stored = await readBounded(found.stream);
      if (stored.length !== bytes.length || sha256(stored) !== digest) throw mediaFailure("media_hash_mismatch", 500);
    } else {
      try {
        await put(path, bytes, {
          access: "private", addRandomSuffix: false, allowOverwrite: false,
          contentType: "image/jpeg", cacheControlMaxAge: 60
        });
      } catch (error) {
        // A concurrent equal upload may win, but must be read back and match.
        await verifiedBytes(path, digest, bytes.length);
      }
    }
    await verifiedBytes(path, digest, bytes.length);
    const receipt = {
      format: "velvet-media-v54", key, source: item.source, id: item.id,
      sha256: digest, bytes: bytes.length, content_type: "image/jpeg", path
    };
    try {
      await put(INDEX_PREFIX + key + ".json", JSON.stringify(receipt), {
        access: "private", addRandomSuffix: false, allowOverwrite: false,
        contentType: "application/json", cacheControlMaxAge: 60
      });
    } catch (error) {
      const raced = await readReceipt(key);
      if (!raced || raced.sha256 !== digest || raced.bytes !== bytes.length) throw mediaFailure("media_already_bound");
    }
    const saved = await readReceipt(key);
    if (!saved || saved.sha256 !== digest || saved.bytes !== bytes.length) throw mediaFailure("receipt_verification_failed", 500);
    return { ...saved, created: true, verified: true };
  }
  async function open(key) {
    const receipt = await readReceipt(key);
    if (!receipt) return null;
    const result = await get(receipt.path, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) throw mediaFailure("media_unavailable", 500);
    return { receipt, stream: result.stream };
  }
  return { readReceipt, readRepairs, upload, open };
}

const HEADERS = Object.freeze({
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Robots-Tag": "noindex",
  "X-Velvet-Media": "54"
});
function json(value, status = 200) { return Response.json(value, { status, headers: HEADERS }); }
function publicReceipt(row) {
  return { media_version: 54, key: row.key, sha256: row.sha256, bytes: row.bytes,
    image_url: mediaDeliveryUrl(row.key), verified: row.verified === true, created: row.created === true };
}
export function createMediaHandler({ authorize, store, readLibrary }) {
  return async request => {
    try {
      if (!await authorize(request)) return json({ error: "unauthorized" }, 401);
    } catch (_) { return json({ error: "auth_unavailable" }, 503); }
    try {
      const url = new URL(request.url), key = url.searchParams.get("key");
      if (request.method === "GET" && url.searchParams.get("meta") === "1" && !key) {
        return json({ media_version: 54, max_bytes: MAX_MEDIA_BYTES, private: true, overwrite: false });
      }
      if (!key || !HEX.test(key)) return json({ error: "invalid_key" }, 400);
      if (request.method === "GET") {
        if (url.searchParams.get("meta") === "1") {
          const row = await store.readReceipt(key);
          return row ? json(publicReceipt(row)) : json({ error: "not_found" }, 404);
        }
        const result = await store.open(key);
        if (!result) return json({ error: "not_found" }, 404);
        return new Response(result.stream, { headers: {
          ...HEADERS, "Content-Type": "image/jpeg", "Content-Length": String(result.receipt.bytes),
          "X-Content-SHA256": result.receipt.sha256
        }});
      }
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const origin = request.headers.get("origin");
      if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
        return json({ error: "cross_origin_write" }, 403);
      }
      if ((request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() !== "image/jpeg") {
        return json({ error: "unsupported_media_type" }, 415);
      }
      const digest = request.headers.get("x-velvet-content-sha256") || "";
      if (!HEX.test(digest)) return json({ error: "invalid_digest" }, 400);
      if (Number(request.headers.get("content-length") || 0) > MAX_MEDIA_BYTES) return json({ error: "payload_too_large" }, 413);
      const bytes = await readBounded(request.body);
      const result = await store.upload(key, bytes, digest, readLibrary);
      return json(publicReceipt(result), 200);
    } catch (error) {
      const allowed = new Set([
        "invalid_key", "invalid_digest", "invalid_record", "empty_body", "payload_too_large",
        "invalid_jpeg", "image_dimensions_exceeded", "request_hash_mismatch", "media_already_bound",
        "target_not_unique", "target_already_has_media", "media_capacity_exceeded",
        "media_hash_mismatch", "media_readback_failed", "receipt_verification_failed"
      ]);
      const status = [400,409,413,415,500].includes(error?.statusCode) ? error.statusCode : 500;
      return json({ error: allowed.has(error?.message) ? error.message : "media_operation_failed" }, status);
    }
  };
}
