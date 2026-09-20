import crypto from "node:crypto";
import {
  PINTEREST_SCOPES,
  pinterestConfig,
  pinterestRedirectUri,
  setOAuthState
} from "../server/pinterest-session.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end("Method Not Allowed");

  const config = pinterestConfig();
  if (!config.configured) return res.status(503).end("Pinterest OAuth is not configured");

  const state = crypto.randomBytes(24).toString("base64url");
  setOAuthState(res, state);

  const url = new URL("https://www.pinterest.com/oauth/");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", pinterestRedirectUri(req));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", PINTEREST_SCOPES.join(","));
  url.searchParams.set("state", state);

  res.statusCode = 302;
  res.setHeader("Location", url.toString());
  res.setHeader("Cache-Control", "no-store");
  res.end();
}
