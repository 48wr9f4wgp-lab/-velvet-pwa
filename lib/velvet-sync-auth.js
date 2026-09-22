import { createHmac, timingSafeEqual } from "node:crypto";
import { hashPairCode, readSyncConfig } from "./velvet-sync-config.js";

const COOKIE_NAME = "velvet_sync_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function safeHexEqual(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  if (!left.length || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function verifyPairCode(code) {
  const raw = String(code || "").trim();
  if (raw.length < 16 || raw.length > 256) return false;
  const config = await readSyncConfig();
  if (!config) throw new Error("Velvet sync is not configured");
  return safeHexEqual(hashPairCode(raw), config.pair_hash);
}

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

function signPayload(payload, secret) {
  return createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("base64url");
}

export async function issueSessionToken(nowMs = Date.now()) {
  const config = await readSyncConfig();
  if (!config) throw new Error("Velvet sync is not configured");
  const payload = b64url(JSON.stringify({
    v: 1,
    exp: Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS
  }));
  return payload + "." + signPayload(payload, config.session_secret);
}

export async function verifySessionToken(token, nowMs = Date.now()) {
  const [payload, signature, extra] = String(token || "").split(".");
  if (!payload || !signature || extra) return false;

  const config = await readSyncConfig();
  if (!config) return false;
  const expected = signPayload(payload, config.session_secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return decoded?.v === 1
      && Number.isFinite(Number(decoded.exp))
      && Number(decoded.exp) > Math.floor(nowMs / 1000);
  } catch (_) {
    return false;
  }
}

function cookieValue(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

function bearerToken(request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export async function isAuthorizedRequest(request) {
  const bearer = bearerToken(request);
  if (bearer && await verifyPairCode(bearer)) return true;
  return verifySessionToken(cookieValue(request, COOKIE_NAME));
}

export function makeSessionCookie(token) {
  return [
    COOKIE_NAME + "=" + token,
    "Path=/api",
    "Max-Age=" + SESSION_TTL_SECONDS,
    "HttpOnly",
    "Secure",
    "SameSite=Strict"
  ].join("; ");
}

export function clearSessionCookie() {
  return [
    COOKIE_NAME + "=",
    "Path=/api",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Strict"
  ].join("; ");
}
