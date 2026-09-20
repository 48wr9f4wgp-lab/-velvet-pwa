import {
  PINTEREST_SCOPES,
  noStore,
  pinterestConfig,
  pinterestRedirectUri,
  pinterestSessionStatus
} from "../server/pinterest-session.js";

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

  const config = pinterestConfig();
  const session = pinterestSessionStatus(req);
  res.status(200).json({
    ok: true,
    configured: config.configured,
    connected: session.connected,
    access_valid: session.access_valid,
    refresh_valid: session.refresh_valid,
    scope: session.scope,
    required_scopes: PINTEREST_SCOPES,
    redirect_uri: pinterestRedirectUri(req)
  });
}
