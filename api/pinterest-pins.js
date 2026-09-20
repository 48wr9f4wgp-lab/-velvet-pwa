import {
  jsonError,
  noStore,
  pinterestConfig,
  pinterestFetch
} from "../server/pinterest-session.js";

function imageCandidates(value, out = []) {
  if (!value || typeof value !== "object") return out;
  if (typeof value.url === "string" && /^https:\/\//i.test(value.url)) {
    const width = Number(value.width || 0);
    const height = Number(value.height || 0);
    out.push({ url: value.url, area: width * height });
  }
  for (const child of Object.values(value)) imageCandidates(child, out);
  return out;
}

function bestImage(pin) {
  const candidates = imageCandidates(pin?.media?.images || pin?.media || {});
  candidates.sort((a, b) => b.area - a.area);
  return candidates[0]?.url || "";
}

function normalizePin(pin) {
  const id = String(pin?.id || "");
  return {
    id,
    title: String(pin?.title || ""),
    description: String(pin?.description || ""),
    image_url: bestImage(pin),
    page_url: id ? `https://www.pinterest.com/pin/${id}/` : "",
    dominant_color: String(pin?.dominant_color || "")
  };
}

function validBoardId(value) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(String(value || ""));
}

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  if (!pinterestConfig().configured) return res.status(503).json({ ok: false, error: "NOT_CONFIGURED" });

  const boardId = String(req.query?.board_id || "");
  const bookmark = String(req.query?.bookmark || "");
  if (!validBoardId(boardId)) return res.status(400).json({ ok: false, error: "INVALID_BOARD_ID" });
  if (bookmark.length > 2048) return res.status(400).json({ ok: false, error: "INVALID_BOOKMARK" });

  try {
    const body = await pinterestFetch(req, res, `/boards/${encodeURIComponent(boardId)}/pins`, {
      query: { page_size: 50, bookmark }
    });
    const pins = (Array.isArray(body?.items) ? body.items : [])
      .map(normalizePin)
      .filter(pin => pin.id && pin.image_url);
    res.status(200).json({
      ok: true,
      pins,
      bookmark: String(body?.bookmark || "")
    });
  } catch (error) {
    jsonError(res, error);
  }
}
