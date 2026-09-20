import {
  jsonError,
  noStore,
  pinterestConfig,
  pinterestFetch
} from "../server/pinterest-session.js";

function normalizeBoard(board) {
  return {
    id: String(board?.id || ""),
    name: String(board?.name || "Untitled"),
    description: String(board?.description || ""),
    privacy: String(board?.privacy || ""),
    pin_count: Number(board?.pin_count || 0),
    collaborator_count: Number(board?.collaborator_count || 0)
  };
}

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  if (!pinterestConfig().configured) return res.status(503).json({ ok: false, error: "NOT_CONFIGURED" });

  try {
    const boards = [];
    let bookmark = "";
    for (let page = 0; page < 8; page += 1) {
      const body = await pinterestFetch(req, res, "/boards", {
        query: { page_size: 250, bookmark }
      });
      for (const board of Array.isArray(body?.items) ? body.items : []) {
        const normalized = normalizeBoard(board);
        if (normalized.id) boards.push(normalized);
      }
      bookmark = String(body?.bookmark || "");
      if (!bookmark) break;
    }
    res.status(200).json({ ok: true, boards });
  } catch (error) {
    jsonError(res, error);
  }
}
