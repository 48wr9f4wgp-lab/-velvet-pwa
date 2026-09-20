function svgData(seed, label) {
  const hue = (seed * 47) % 360;
  const hue2 = (hue + 48) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1400">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 28% 14%)"/><stop offset="1" stop-color="hsl(${hue2} 35% 7%)"/></linearGradient></defs>
    <rect width="900" height="1400" fill="url(#g)"/>
    <circle cx="${160 + (seed % 5) * 130}" cy="${260 + (seed % 4) * 180}" r="230" fill="rgba(255,255,255,.055)"/>
    <rect x="120" y="980" width="660" height="2" fill="rgba(255,255,255,.12)"/>
    <text x="120" y="1060" fill="rgba(255,255,255,.7)" font-size="42" font-family="system-ui">${label}</text>
    <text x="120" y="1120" fill="rgba(255,255,255,.35)" font-size="24" font-family="system-ui">DEMO FEED · PRIVATE UI TEST</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const DEMO_TAG_SETS = [
  ["soft", "portrait", "warm"],
  ["personal", "close", "natural"],
  ["pro", "studio", "clean"],
  ["intense", "contrast", "close"],
  ["personal", "casual", "warm"],
  ["pro", "editorial", "cool"],
  ["explore", "outdoor", "natural"],
  ["soft", "minimal", "cool"],
  ["intense", "dramatic", "studio"],
  ["personal", "portrait", "clean"],
  ["pro", "fashion", "contrast"],
  ["explore", "ambient", "warm"]
];

const PRELOADED_URLS = new Set();
const PRELOAD_MEMORY_LIMIT = 80;
const BASELINE_PROFILES = ["mix", "personal", "pro", "max"];

const X_EPOCH_MS = 1288834974657n;

function xStatusId(raw, fallbackId = "") {
  const page = typeof raw?.page_url === "string" ? raw.page_url : "";
  const pageMatch = page.match(/\/status\/(\d{15,22})/);
  if (pageMatch) return pageMatch[1];
  const idMatch = String(raw?.id || fallbackId).match(/status:(\d{15,22})/);
  return idMatch ? idMatch[1] : "";
}

function xPublishedAtMs(raw, fallbackId = "") {
  const explicit = Number(raw?.published_at_ms);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const statusId = xStatusId(raw, fallbackId);
  if (!statusId) return 0;
  try {
    return Number((BigInt(statusId) >> 22n) + X_EPOCH_MS);
  } catch (_) {
    return 0;
  }
}

export function demoCatalog() {
  return DEMO_TAG_SETS.map((tags, i) => ({
    id: `demo-${i + 1}`,
    image_url: svgData(i + 1, tags[0].toUpperCase()),
    thumb_url: null,
    title: "Demo item",
    source: `demo-${(i % 4) + 1}`,
    source_label: "Demo",
    source_class: tags.includes("pro") ? "pro" : tags.includes("personal") ? "personal" : "mixed",
    tags,
    published_at_ms: Date.now() - i * 60 * 60 * 1000,
    intensity: tags.includes("intense") ? 5 : tags.includes("soft") ? 1 : tags.includes("pro") ? 3.5 : 3,
    page_url: null,
    handle: null,
    rank: i + 1,
    baseline: null,
    rights_status: "demo-local",
    active: true
  }));
}

function normalizeBaselineProfile(raw) {
  if (!raw || typeof raw !== "object" || raw.eligible !== true) return null;
  const declaredTier = ["high", "medium", "low", "unknown"].includes(raw.exposure_tier) ? raw.exposure_tier : "unknown";
  const estimatedTier = ["high", "medium", "low", "unknown"].includes(raw.exposure_estimate_tier) ? raw.exposure_estimate_tier : "unknown";
  const exposureBasis = ["metadata", "source-prior", "unknown"].includes(raw.exposure_basis)
    ? raw.exposure_basis
    : (declaredTier === "unknown" ? "unknown" : "metadata");
  const tier = declaredTier !== "unknown"
    ? declaredTier
    : (exposureBasis === "source-prior" ? estimatedTier : "unknown");
  const score = Number(raw.score);
  const runCap = Number(raw.run_cap);
  const maxRank = Number(raw.max_rank);
  const intensity = Number(raw.intensity);
  const rawConfidence = Number(raw.exposure_confidence);
  const exposureConfidence = Number.isFinite(rawConfidence)
    ? Math.max(0, Math.min(1, rawConfidence))
    : (tier === "unknown" ? 0 : 1);
  return {
    eligible: true,
    score: Number.isFinite(score) ? score : 0,
    run_cap: Number.isFinite(runCap) ? Math.max(1, Math.min(10, Math.round(runCap))) : 3,
    max_rank: Number.isFinite(maxRank) ? Math.max(1, Math.min(100, Math.round(maxRank))) : 100,
    exposure_tier: tier,
    exposure_estimate_tier: estimatedTier,
    exposure_basis: exposureBasis,
    exposure_confidence: exposureConfidence,
    intensity: Number.isFinite(intensity) ? Math.max(1, Math.min(5, intensity)) : 3,
    post_jp: raw.post_jp === true,
    post_female: raw.post_female === true,
    age_target: raw.age_target === true
  };
}

function normalizeBaseline(raw) {
  if (!raw || typeof raw !== "object") return null;
  const profiles = {};
  for (const name of BASELINE_PROFILES) {
    const normalized = normalizeBaselineProfile(raw.profiles?.[name]);
    if (normalized) profiles[name] = normalized;
  }
  if (!Object.keys(profiles).length) return null;
  return {
    canonical: typeof raw.canonical === "string" ? raw.canonical : "unknown",
    profiles
  };
}

function normalizeItem(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const image = typeof raw.image_url === "string" ? raw.image_url.trim() : "";
  if (!image) return null;
  const id = String(raw.id || `item-${index}-${image.slice(-20)}`);
  const tags = Array.isArray(raw.tags) ? raw.tags.filter(v => typeof v === "string" && v.trim()).map(v => v.trim().toLowerCase()) : [];
  const rank = Number(raw.rank);
  return {
    id,
    image_url: image,
    thumb_url: typeof raw.thumb_url === "string" ? raw.thumb_url : null,
    title: typeof raw.title === "string" ? raw.title : "",
    source: String(raw.source || "unknown"),
    source_label: String(raw.source_label || raw.source || "Velvet"),
    source_class: raw.source_class === "amateur" ? "personal" : ["personal", "pro", "mixed", "pinterest"].includes(raw.source_class) ? raw.source_class : "mixed",
    tags,
    published_at_ms: xPublishedAtMs(raw, id),
    intensity: Math.max(1, Math.min(5, Number(raw.intensity) || 3)),
    page_url: typeof raw.page_url === "string" ? raw.page_url : null,
    handle: typeof raw.handle === "string" && raw.handle.trim() ? raw.handle.trim() : null,
    rank: Number.isFinite(rank) ? Math.max(1, Math.round(rank)) : index + 1,
    baseline: normalizeBaseline(raw.baseline),
    rights_status: String(raw.rights_status || "external-public-source"),
    active: raw.active !== false
  };
}

function normalizeCatalog(payload) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
  const seen = new Set();
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const item = normalizeItem(rows[i], i);
    if (!item || !item.active || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function normalizeCounts(value) {
  const raw = value && typeof value === "object" ? value : null;
  if (!raw) return null;
  const counts = input => {
    const out = {};
    if (!input || typeof input !== "object" || Array.isArray(input)) return out;
    for (const [key, count] of Object.entries(input)) {
      const n = Number(count);
      if (key && Number.isFinite(n) && n >= 0) out[key] = Math.floor(n);
    }
    return out;
  };
  return {
    total: Math.max(0, Math.floor(Number(raw.total) || 0)),
    by_reason: counts(raw.by_reason),
    by_source: counts(raw.by_source)
  };
}

function normalizeDiagnostics(payload) {
  const quarantine = normalizeCounts(payload?.diagnostics?.quarantine);
  const baselineRejections = normalizeCounts(payload?.diagnostics?.baseline_rejections);
  if (!quarantine && !baselineRejections) return null;
  return {
    quarantine: quarantine || { total: 0, by_reason: {}, by_source: {} },
    baseline_rejections: baselineRejections || { total: 0, by_reason: {}, by_source: {} }
  };
}

function publishFeedInfo(info) {
  if (typeof window === "undefined") return;
  window.__velvetFeedInfo = {
    visibleCount: Math.max(0, Number(info?.visibleCount) || 0),
    source: typeof info?.source === "string" ? info.source : "unknown",
    demo: info?.demo === true,
    canonicalBaseline: typeof info?.canonicalBaseline === "string" ? info.canonicalBaseline : null,
    diagnostics: info?.diagnostics || null
  };
  window.dispatchEvent(new CustomEvent("velvet:feed-info", { detail: window.__velvetFeedInfo }));
}

async function loadJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function feedAttempts() {
  const stamp = Date.now();
  const staticFeed = `./velvet-content.json?t=${stamp}`;
  const hostname = typeof location === "undefined" ? "" : String(location.hostname || "").toLowerCase();
  const onGitHubPages = hostname.endsWith("github.io");
  return onGitHubPages ? [staticFeed] : [staticFeed, "./api/feed?limit=120"];
}

export async function loadPinterestCatalog() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`./api/pinterest?t=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        catalog: [],
        source: "pinterest-api",
        configured: payload?.configured !== false,
        error: payload?.error || `HTTP ${response.status}`
      };
    }
    const catalog = normalizeCatalog(payload).filter(item => item.source_class === "pinterest");
    return {
      catalog,
      source: "pinterest-api",
      configured: payload?.configured !== false,
      error: catalog.length ? null : "Pinterest board has no displayable image Pins"
    };
  } catch (error) {
    return {
      catalog: [],
      source: "pinterest-api",
      configured: true,
      error: error?.name === "AbortError" ? "Pinterest request timed out" : (error?.message || String(error))
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function loadCatalog() {
  const attempts = feedAttempts();
  const errors = [];

  for (const url of attempts) {
    try {
      const payload = await loadJson(url);
      const catalog = normalizeCatalog(payload);
      if (catalog.length >= 3) {
        const diagnostics = normalizeDiagnostics(payload);
        const canonicalBaseline = typeof payload?.canonical_baseline === "string" ? payload.canonical_baseline : null;
        publishFeedInfo({ visibleCount: catalog.length, source: url, demo: false, canonicalBaseline, diagnostics });
        return { catalog, source: url, demo: false, errors, diagnostics, canonicalBaseline };
      }
      errors.push(`${url}: too few items`);
    } catch (error) {
      errors.push(`${url}: ${error?.message || error}`);
    }
  }

  const catalog = demoCatalog();
  publishFeedInfo({ visibleCount: catalog.length, source: "demo", demo: true, canonicalBaseline: null, diagnostics: null });
  return { catalog, source: "demo", demo: true, errors, diagnostics: null, canonicalBaseline: null };
}

function rememberPreload(url) {
  if (PRELOADED_URLS.has(url)) return false;
  PRELOADED_URLS.add(url);
  if (PRELOADED_URLS.size > PRELOAD_MEMORY_LIMIT) {
    const oldest = PRELOADED_URLS.values().next().value;
    if (oldest) PRELOADED_URLS.delete(oldest);
  }
  return true;
}

export function preloadImages(items) {
  for (const item of items.slice(0, 4)) {
    const url = item?.image_url;
    if (!url || !rememberPreload(url)) continue;
    const image = new Image();
    image.decoding = "async";
    image.src = url;
  }
}
