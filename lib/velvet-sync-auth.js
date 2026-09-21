import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "velvet_sync_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error("Missing required environment variable: " + name);
  return value;
}

export function hashPairCode(code) {
  return createHash("sha256").update(String(code || ""), "utf8").digest("hex");
}

function safeHexEqual(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  if (!left.length || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyPairCode(code) {
  const raw = String(code || "");
  if (raw.length < 16 || raw.length > 256) return false;
  const expected = requiredEnv("VELVET_SYNC_PAIR_HASH");
  return safeHexEqual(hashPairCode(raw), expected);
}

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

function signPayload(payload) {
  return createHmac("sha256", requiredEnv("VELVET_SYNC_SESSION_SECRET"))
    .update(payload, "utf8")
    .digest("base64url");
}

export function issueSessionToken(nowMs = Date.now()) {
  const payload = b64url(JSON.stringify({
    v: 1,
    exp: Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS
  }));
  return payload + "." + signPayload(payload);
}

export function verifySessionToken(token, nowMs = Date.now()) {
  const [payload, signature, extra] = String(token || "").split(".");
  if (!payload || !signature || extra) return false;

  const expected = signPayload(payload);
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

export function isAuthorizedRequest(request) {
  const bearer = bearerToken(request);
  if (bearer && verifyPairCode(bearer)) return true;
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
