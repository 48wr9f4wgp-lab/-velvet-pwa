import { clearTokenCookies, noStore } from "../server/pinterest-session.js";

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  clearTokenCookies(res);
  res.status(200).json({ ok: true });
}
