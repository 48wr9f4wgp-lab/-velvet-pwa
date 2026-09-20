import crypto from "node:crypto";
import {
  clearOAuthState,
  clearTokenCookies,
  exchangeAuthorizationCode,
  pinterestConfig,
  pinterestRedirectUri,
  readOAuthState,
  setTokenCookies
} from "../server/pinterest-session.js";

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function redirectHome(req, res, status) {
  const origin = new URL(pinterestRedirectUri(req)).origin;
  res.statusCode = 302;
  res.setHeader("Location", `${origin}/?pinterest=${encodeURIComponent(status)}`);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end("Method Not Allowed");

  const config = pinterestConfig();
  if (!config.configured) return redirectHome(req, res, "not-configured");

  const code = String(req.query?.code || "");
  const state = String(req.query?.state || "");
  const expectedState = readOAuthState(req);
  clearOAuthState(res);

  if (!code || !safeEqual(state, expectedState)) {
    clearTokenCookies(res);
    return redirectHome(req, res, "state-error");
  }

  try {
    const token = await exchangeAuthorizationCode(code, pinterestRedirectUri(req));
    setTokenCookies(res, token);
    return redirectHome(req, res, "connected");
  } catch (_) {
    clearTokenCookies(res);
    return redirectHome(req, res, "error");
  }
}
