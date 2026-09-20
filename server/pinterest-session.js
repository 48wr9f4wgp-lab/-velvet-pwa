import crypto from "node:crypto";

export const PINTEREST_SCOPES = [
  "boards:read",
  "boards:read_secret",
  "pins:read",
  "pins:read_secret"
];

const API_BASE = "https://api.pinterest.com/v5";
const ACCESS_COOKIE = "velvet_pin_a_v50";
const REFRESH_COOKIE = "velvet_pin_r_v50";
const STATE_COOKIE = "velvet_pin_state_v50";
const COOKIE_PATH = "/";

function env(name) {
  return String(process.env[name] || "").trim();
}

export function pinterestConfig() {
  const appId = env("PINTEREST_APP_ID");
  const appSecret = env("PINTEREST_APP_SECRET");
  const sessionSecret = env("VELVET_PINTEREST_SESSION_SECRET");
  return {
    appId,
    appSecret,
    sessionSecret,
    configured: Boolean(appId && appSecret && sessionSecret.length >= 32)
  };
}

function cookieHeader(name, value, {
  maxAge = null,
  httpOnly = true,
  sameSite = "Lax"
} = {}) {
  const parts = [
    `${name}=${value}`,
    `Path=${COOKIE_PATH}`,
    "Secure",
    `SameSite=${sameSite}`
  ];
  if (httpOnly) parts.push("HttpOnly");
  if (Number.isFinite(maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  return parts.join("; ");
}

function appendSetCookie(res, value) {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", value);
    return;
  }
  const list = Array.isArray(current) ? current : [current];
  res.setHeader("Set-Cookie", [...list, value]);
}

export function requestOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || String(req.headers.host || "").trim();
  const proto = forwardedProto || "https";
  if (!host) throw new Error("Request host unavailable");
  return `${proto}://${host}`;
}

export function pinterestRedirectUri(req) {
  return `${requestOrigin(req)}/api/pinterest-callback`;
}

function keyFromSecret(secret) {
  return crypto.createHash("sha256").update(secret).digest();
}

export function seal(value) {
  const { sessionSecret } = pinterestConfig();
  if (sessionSecret.length < 32) throw new Error("Pinterest session secret is not configured");
  const key = keyFromSecret(sessionSecret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function unseal(raw) {
  if (!raw) return null;
  const { sessionSecret } = pinterestConfig();
  if (sessionSecret.length < 32) return null;
  try {
    const buf = Buffer.from(String(raw), "base64url");
    if (buf.length < 29) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyFromSecret(sessionSecret), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    return JSON.parse(plaintext);
  } catch (_) {
    return null;
  }
}

export function parseCookies(req) {
  const raw = String(req.headers.cookie || "");
  const out = {};
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

export function setOAuthState(res, state) {
  appendSetCookie(res, cookieHeader(STATE_COOKIE, state, { maxAge: 600 }));
}

export function readOAuthState(req) {
  return parseCookies(req)[STATE_COOKIE] || "";
}

export function clearOAuthState(res) {
  appendSetCookie(res, cookieHeader(STATE_COOKIE, "", { maxAge: 0 }));
}

function safeLifetime(seconds, fallback) {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function setTokenCookies(res, token) {
  const now = Date.now();
  const accessSeconds = safeLifetime(token.expires_in, 2592000);
  const refreshSeconds = safeLifetime(token.refresh_token_expires_in, 5184000);
  const accessPayload = {
    token: String(token.access_token || ""),
    expires_at: now + accessSeconds * 1000,
    scope: String(token.scope || "")
  };
  if (!accessPayload.token) throw new Error("Pinterest access token missing");

  const sealedAccess = seal(accessPayload);
  if (sealedAccess.length > 3800) throw new Error("Pinterest access session exceeds cookie capacity");
  appendSetCookie(res, cookieHeader(ACCESS_COOKIE, sealedAccess, { maxAge: accessSeconds }));

  if (token.refresh_token) {
    const refreshPayload = {
      token: String(token.refresh_token),
      expires_at: Number(token.refresh_token_expires_at) > 0
        ? Number(token.refresh_token_expires_at) * 1000
        : now + refreshSeconds * 1000,
      scope: String(token.scope || "")
    };
    const sealedRefresh = seal(refreshPayload);
    if (sealedRefresh.length > 3800) throw new Error("Pinterest refresh session exceeds cookie capacity");
    appendSetCookie(res, cookieHeader(REFRESH_COOKIE, sealedRefresh, { maxAge: refreshSeconds }));
  }
}

export function clearTokenCookies(res) {
  appendSetCookie(res, cookieHeader(ACCESS_COOKIE, "", { maxAge: 0 }));
  appendSetCookie(res, cookieHeader(REFRESH_COOKIE, "", { maxAge: 0 }));
  clearOAuthState(res);
}

function readAccess(req) {
  const cookies = parseCookies(req);
  return unseal(cookies[ACCESS_COOKIE]);
}

function readRefresh(req) {
  const cookies = parseCookies(req);
  return unseal(cookies[REFRESH_COOKIE]);
}

export function pinterestSessionStatus(req) {
  const config = pinterestConfig();
  const now = Date.now();
  const access = config.configured ? readAccess(req) : null;
  const refresh = config.configured ? readRefresh(req) : null;
  const accessValid = Boolean(access?.token && Number(access.expires_at) > now + 60000);
  const refreshValid = Boolean(refresh?.token && Number(refresh.expires_at) > now + 60000);
  return {
    configured: config.configured,
    connected: accessValid || refreshValid,
    access_valid: accessValid,
    refresh_valid: refreshValid,
    scope: String(access?.scope || refresh?.scope || "")
  };
}

function basicAuth() {
  const { appId, appSecret } = pinterestConfig();
  return "Basic " + Buffer.from(`${appId}:${appSecret}`, "utf8").toString("base64");
}

async function tokenRequest(params) {
  const config = pinterestConfig();
  if (!config.configured) {
    const error = new Error("Pinterest OAuth is not configured");
    error.code = "NOT_CONFIGURED";
    throw error;
  }
  const response = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(params),
    cache: "no-store"
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_) {}
  if (!response.ok) {
    const error = new Error("Pinterest token request failed");
    error.code = "TOKEN_REQUEST_FAILED";
    error.status = response.status;
    error.details = body;
    throw error;
  }
  return body;
}

export async function exchangeAuthorizationCode(code, redirectUri) {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  });
}

async function refreshAccess(req, res) {
  const refresh = readRefresh(req);
  if (!refresh?.token || Number(refresh.expires_at) <= Date.now() + 60000) {
    const error = new Error("Pinterest refresh session unavailable");
    error.code = "NOT_CONNECTED";
    throw error;
  }
  const token = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refresh.token
  });
  if (!token.refresh_token) token.refresh_token = refresh.token;
  if (!token.refresh_token_expires_in && Number(refresh.expires_at) > Date.now()) {
    token.refresh_token_expires_in = Math.max(60, Math.floor((Number(refresh.expires_at) - Date.now()) / 1000));
  }
  setTokenCookies(res, token);
  return String(token.access_token || "");
}

async function ensureAccess(req, res) {
  const access = readAccess(req);
  if (access?.token && Number(access.expires_at) > Date.now() + 120000) {
    return access.token;
  }
  return refreshAccess(req, res);
}

export async function pinterestFetch(req, res, path, { query = null } = {}) {
  const url = new URL(`${API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
  }

  let accessToken = await ensureAccess(req, res);
  let response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (response.status === 401) {
    accessToken = await refreshAccess(req, res);
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      cache: "no-store"
    });
  }

  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_) {}
  if (!response.ok) {
    const error = new Error("Pinterest API request failed");
    error.code = response.status === 401 ? "NOT_CONNECTED" : "PINTEREST_API_FAILED";
    error.status = response.status;
    error.details = body;
    throw error;
  }
  return body;
}

export function noStore(res) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

export function jsonError(res, error) {
  const status = error?.code === "NOT_CONFIGURED" ? 503
    : error?.code === "NOT_CONNECTED" ? 401
    : Number(error?.status) >= 400 ? Number(error.status)
    : 500;
  const code = error?.code || "PINTEREST_ERROR";
  res.status(status).json({ ok: false, error: code });
}
