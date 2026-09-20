const API_BASE = "https://api.pinterest.com/v5";
const DEFAULT_LIMIT = 120;
const MAX_LIMIT = 160;

function clampLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.round(n)));
}

function collectImageCandidates(value, out = [], depth = 0) {
  if (!value || depth > 4) return out;
  if (typeof value === "string") {
    if (/^https:\/\//i.test(value)) out.push({ url: value, area: 0 });
    return out;
  }
  if (Array.isArray(value)) {
    for (const row of value) collectImageCandidates(row, out, depth + 1);
    return out;
  }
  if (typeof value !== "object") return out;

  const url = typeof value.url === "string" ? value.url.trim() : "";
  if (/^https:\/\//i.test(url)) {
    const width = Math.max(0, Number(value.width) || 0);
    const height = Math.max(0, Number(value.height) || 0);
    out.push({ url, area: width * height });
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") collectImageCandidates(child, out, depth + 1);
  }
  return out;
}

function pinImages(pin) {
  const candidates = [];
  collectImageCandidates(pin?.media?.images, candidates);
  collectImageCandidates(pin?.media?.cover_image_url, candidates);
  collectImageCandidates(pin?.media_source, candidates);
  collectImageCandidates(pin?.image, candidates);

  const seen = new Set();
  const unique = candidates.filter(row => {
    if (!row.url || seen.has(row.url)) return false;
    seen.add(row.url);
    return true;
  });
  unique.sort((a, b) => b.area - a.area);
  return {
    image: unique[0]?.url || "",
    thumb: unique[unique.length - 1]?.url || unique[0]?.url || ""
  };
}

function normalizePin(pin, index) {
  const id = String(pin?.id || "").trim();
  if (!id) return null;
  const { image, thumb } = pinImages(pin);
  if (!image) return null;

  const created = Date.parse(pin?.created_at || pin?.created_time || "");
  return {
    id: `pinterest:${id}`,
    image_url: image,
    thumb_url: thumb && thumb !== image ? thumb : null,
    title: String(pin?.title || pin?.description || "").trim(),
    source: "Pinterest",
    source_label: "Pinterest",
    source_class: "pinterest",
    tags: ["pinterest"],
    published_at_ms: Number.isFinite(created) ? created : 0,
    intensity: 3,
    page_url: `https://www.pinterest.com/pin/${encodeURIComponent(id)}/`,
    handle: null,
    rank: index + 1,
    baseline: null,
    rights_status: "pinterest-api-live",
    active: true
  };
}

function sendJson(res, status, body) {
  res.status(status).json(body);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, max-age=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const token = String(process.env.PINTEREST_ACCESS_TOKEN || "").trim();
  const boardId = String(process.env.PINTEREST_BOARD_ID || "").trim();
  if (!token || !boardId) {
    return sendJson(res, 503, {
      configured: false,
      error: "Pinterest connection is not configured"
    });
  }

  const limit = clampLimit(req.query?.limit);
  const url = `${API_BASE}/boards/${encodeURIComponent(boardId)}/pins?page_size=${limit}`;

  let upstream;
  try {
    upstream = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      cache: "no-store"
    });
  } catch (_) {
    return sendJson(res, 502, {
      configured: true,
      error: "Pinterest API is temporarily unreachable"
    });
  }

  if (!upstream.ok) {
    return sendJson(res, 502, {
      configured: true,
      error: upstream.status === 401 || upstream.status === 403
        ? "Pinterest authorization failed"
        : `Pinterest API returned HTTP ${upstream.status}`
    });
  }

  let payload;
  try {
    payload = await upstream.json();
  } catch (_) {
    return sendJson(res, 502, {
      configured: true,
      error: "Pinterest API returned an invalid response"
    });
  }

  const rows = Array.isArray(payload?.items) ? payload.items : [];
  const items = rows.map(normalizePin).filter(Boolean);

  return sendJson(res, 200, {
    configured: true,
    source: "pinterest-api-live",
    items
  });
}
