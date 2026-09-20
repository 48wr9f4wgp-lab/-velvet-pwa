import {
  scoreItem as coreScoreItem,
  rankCandidates as coreRankCandidates,
  chooseNext as coreChooseNext,
  adaptSessionQueue as coreAdaptSessionQueue,
  buildSessionQueue as coreBuildSessionQueue,
  sessionPhase,
  sessionTargetIntensity,
  dominantLikedTags,
  recommendNextMode
} from "./recommender-core-v30.js?v=46";

// Source Lab 2026-08-27 winner mix.
// Exact target across a rolling 20-card window: AV1 40 / 1W 35 / AV2 15 / U 10.
const MIX_SOURCE_TARGETS = Object.freeze({ TGAV1: 0.40, TG1W: 0.35, TGAV2: 0.15, TGUra: 0.10 });
const MIX_WINDOW = 20;
const FLOW_PRESET_KEY = "velvet_private_v2_flow_preset";
const FLOW_SOURCE_FILTER_KEY = "velvet_private_v3_source_filter";
const VALID_MODES = new Set(["soft", "personal", "pro", "intense", "favorites", "explore", "popular", "latest"]);
const VALID_SOURCE_FILTERS = new Set(["all", "amateur", "pro", "pinterest"]);
const runtimeMixSources = [];
const SESSION_COUNTS = Object.freeze({ 3: 12, 5: 20, 10: 40 });

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function resolvedMode(mode, targetIntensity) {
  if (targetIntensity != null) return VALID_MODES.has(mode) ? mode : "personal";
  try {
    const stored = localStorage.getItem(FLOW_PRESET_KEY);
    if (stored && VALID_MODES.has(stored)) return stored;
  } catch (_) {}
  return VALID_MODES.has(mode) ? mode : "personal";
}

function sourceFilter() {
  try {
    const stored = localStorage.getItem(FLOW_SOURCE_FILTER_KEY);
    return VALID_SOURCE_FILTERS.has(stored) ? stored : "all";
  } catch (_) {
    return "all";
  }
}

function isAmateurItem(item) {
  const sourceClass = String(item?.source_class || "").toLowerCase();
  const source = String(item?.source || "");
  const tags = Array.isArray(item?.tags) ? item.tags : [];
  return sourceClass === "personal"
    || sourceClass === "amateur"
    || source === "TGUra"
    || source === "TGAma"
    || tags.includes("amateur");
}

function isProItem(item) {
  const sourceClass = String(item?.source_class || "").toLowerCase();
  const source = String(item?.source || "");
  const tags = Array.isArray(item?.tags) ? item.tags : [];
  return sourceClass === "pro"
    || source === "TGAV1"
    || source === "TGAV2"
    || tags.includes("pro");
}

function isPinterestItem(item) {
  const sourceClass = String(item?.source_class || "").toLowerCase();
  const source = String(item?.source || "").toLowerCase();
  return sourceClass === "pinterest" || source === "pinterest";
}

function filterFlowCatalog(catalog, mode, targetIntensity) {
  if (targetIntensity != null || mode === "favorites") return catalog;
  const filter = sourceFilter();
  if (filter === "amateur") return catalog.filter(isAmateurItem);
  if (filter === "pro") return catalog.filter(isProItem);
  if (filter === "pinterest") return catalog.filter(isPinterestItem);
  return catalog;
}

function isMixMode(mode, targetIntensity) {
  const resolved = resolvedMode(mode, targetIntensity);
  return resolved === "soft" || resolved === "explore" || resolved === "mix";
}

function mixRecentSources(state, targetIntensity) {
  const raw = targetIntensity == null
    ? runtimeMixSources
    : (Array.isArray(state?.runtimeRecentSources) ? state.runtimeRecentSources : (state?.recentSources || []));
  return raw.filter(source => Object.prototype.hasOwnProperty.call(MIX_SOURCE_TARGETS, source)).slice(0, MIX_WINDOW - 1);
}

function applyMixComposition(rows, state, targetIntensity) {
  const eligible = rows.filter(row => Object.prototype.hasOwnProperty.call(MIX_SOURCE_TARGETS, row?.item?.source));
  if (!eligible.length) return rows;

  const groups = new Map();
  for (const row of eligible) {
    const source = row.item.source;
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source).push(row);
  }

  const recent = mixRecentSources(state, targetIntensity);
  const step = Math.min(MIX_WINDOW, recent.length + 1);
  const counts = Object.fromEntries(Object.keys(MIX_SOURCE_TARGETS).map(source => [source, 0]));
  for (const source of recent) counts[source] = (counts[source] || 0) + 1;

  let bestDebt = -Infinity;
  let chosenSources = [];
  for (const [source] of groups) {
    const expected = MIX_SOURCE_TARGETS[source] * step;
    const debt = expected - Number(counts[source] || 0);
    if (debt > bestDebt + 1e-9) {
      bestDebt = debt;
      chosenSources = [source];
    } else if (Math.abs(debt - bestDebt) <= 1e-9) {
      chosenSources.push(source);
    }
  }

  const chosen = new Set(chosenSources);
  const constrained = eligible.filter(row => chosen.has(row.item.source));
  return constrained.length ? constrained : eligible;
}

function weightedPick(ranked) {
  if (!ranked.length) return null;
  const min = Math.min(...ranked.map(row => row.score));
  const weights = ranked.map((row, i) => Math.max(0.02, (row.score - min + 0.12) * (1 - i * 0.006)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * total;
  let selected = ranked[0].item;
  for (let i = 0; i < ranked.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      selected = ranked[i].item;
      break;
    }
  }
  return selected;
}

function mergeRanked(rows, limit) {
  const bestById = new Map();
  for (const row of rows) {
    const id = row?.item?.id;
    if (!id) continue;
    const previous = bestById.get(id);
    if (!previous || row.score > previous.score) bestById.set(id, row);
  }
  return [...bestById.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Number(limit) || 70));
}

function rankRecommended(catalog, state, exclusions, limit) {
  const filter = sourceFilter();
  const requestLimit = Math.max(70, Number(limit) || 70);
  const rows = [];

  if (filter !== "pro") {
    rows.push(...coreRankCandidates(catalog, state, "personal", exclusions, 3.0, requestLimit));
  }
  if (filter !== "amateur") {
    rows.push(...coreRankCandidates(catalog, state, "pro", exclusions, 3.4, requestLimit));
  }
  if (filter === "all") {
    // Mixed-source candidates use the established mix baseline but a neutral target intensity.
    rows.push(...coreRankCandidates(catalog, state, "soft", exclusions, 3.0, requestLimit));
  }

  return mergeRanked(rows, limit);
}

function popularityScore(item) {
  const rank = Math.max(1, Number(item?.rank) || 999);
  const rankScore = 1000 - Math.min(999, rank);
  const published = Number(item?.published_at_ms) || 0;
  return rankScore + Math.min(0.999, published / 1e16);
}

function rankPopular(catalog, exclusions, limit) {
  return catalog
    .filter(item => item?.id && item?.image_url && !exclusions.has(item.id))
    .map(item => ({ item, score: popularityScore(item) }))
    .sort((a, b) =>
      b.score - a.score
      || (Number(b.item?.published_at_ms) || 0) - (Number(a.item?.published_at_ms) || 0)
      || String(a.item.id).localeCompare(String(b.item.id))
    )
    .slice(0, Math.max(1, Number(limit) || 70));
}

function rankLatest(catalog, exclusions, limit) {
  return catalog
    .filter(item => item?.id && item?.image_url && !exclusions.has(item.id))
    .map(item => ({
      item,
      score: Number(item?.published_at_ms) > 0
        ? Number(item.published_at_ms) / 1e12
        : -Math.max(1, Number(item?.rank) || 999)
    }))
    .sort((a, b) =>
      b.score - a.score
      || (Number(a.item?.rank) || 999) - (Number(b.item?.rank) || 999)
      || String(a.item.id).localeCompare(String(b.item.id))
    )
    .slice(0, Math.max(1, Number(limit) || 70));
}

function rankPinterest(catalog, mode, exclusions, limit) {
  const rows = catalog
    .filter(item => isPinterestItem(item) && item?.id && item?.image_url && !exclusions.has(item.id))
    .map(item => ({
      item,
      score: mode === "latest"
        ? (Number(item?.published_at_ms) || 0) / 1e12
        : 1000 - Math.min(999, Math.max(1, Number(item?.rank) || 999))
    }));
  rows.sort((a, b) =>
    b.score - a.score
    || (Number(a.item?.rank) || 999) - (Number(b.item?.rank) || 999)
    || String(a.item.id).localeCompare(String(b.item.id))
  );
  return rows.slice(0, Math.max(1, Number(limit) || 70));
}

export const scoreItem = coreScoreItem;

export function rankCandidates(catalog, state, mode = "personal", exclusions = new Set(), targetIntensity = null, limit = 70) {
  const resolved = resolvedMode(mode, targetIntensity);
  const filteredCatalog = filterFlowCatalog(catalog, resolved, targetIntensity);
  const filter = sourceFilter();

  // Pinterest stays isolated from Velvet's cross-source preference model.
  if (targetIntensity == null && filter === "pinterest") {
    return rankPinterest(filteredCatalog, resolved, exclusions, limit);
  }

  if (targetIntensity == null && resolved === "personal") {
    return rankRecommended(filteredCatalog, state, exclusions, limit);
  }
  if (targetIntensity == null && resolved === "popular") {
    return rankPopular(filteredCatalog, exclusions, limit);
  }
  if (targetIntensity == null && resolved === "latest") {
    return rankLatest(filteredCatalog, exclusions, limit);
  }

  if (!isMixMode(resolved, targetIntensity)) {
    return coreRankCandidates(filteredCatalog, state, resolved, exclusions, targetIntensity, limit);
  }
  const ranked = coreRankCandidates(filteredCatalog, state, resolved, exclusions, targetIntensity, Math.max(70, Number(limit) || 70));
  return applyMixComposition(ranked, state, targetIntensity).slice(0, Math.max(1, Number(limit) || 70));
}

export function chooseNext(catalog, state, mode = "personal", exclusions = new Set(), targetIntensity = null) {
  const resolved = resolvedMode(mode, targetIntensity);

  if (targetIntensity == null && (resolved === "personal" || resolved === "popular" || resolved === "latest")) {
    const ranked = rankCandidates(catalog, state, resolved, exclusions, targetIntensity, 70);
    if (!ranked.length) return null;
    return resolved === "personal" ? weightedPick(ranked) : ranked[0].item;
  }

  const filteredCatalog = filterFlowCatalog(catalog, resolved, targetIntensity);
  if (!isMixMode(resolved, targetIntensity)) {
    return coreChooseNext(filteredCatalog, state, resolved, exclusions, targetIntensity);
  }
  const ranked = rankCandidates(filteredCatalog, state, resolved, exclusions, targetIntensity, 70);
  const selected = weightedPick(ranked);
  if (selected && targetIntensity == null) {
    runtimeMixSources.unshift(selected.source || "unknown");
    runtimeMixSources.splice(MIX_WINDOW - 1);
  }
  return selected;
}

function sessionCount(duration) {
  return SESSION_COUNTS[Number(duration)] || SESSION_COUNTS[5];
}

function seedSessionState(state, lockedItems) {
  const queueState = {
    ...state,
    recentItemIds: [...(state.recentItemIds || [])],
    recentSources: [...(state.recentSources || [])],
    runtimeRecentSources: [],
    runtimeHandles: []
  };
  for (const item of lockedItems) {
    queueState.recentItemIds = [item.id, ...queueState.recentItemIds.filter(id => id !== item.id)].slice(0, 50);
    queueState.runtimeRecentSources.unshift(item.source || "unknown");
    if (item.handle) queueState.runtimeHandles.unshift(item.handle);
  }
  queueState.runtimeRecentSources = queueState.runtimeRecentSources.slice(0, MIX_WINDOW - 1);
  queueState.runtimeHandles = queueState.runtimeHandles.slice(0, 24);
  return queueState;
}

export function adaptSessionQueue(catalog, state, {
  duration = 5,
  mood = "personal",
  queue = [],
  index = 0,
  excludedIds = []
} = {}) {
  if (!isMixMode(mood, 3)) {
    return coreAdaptSessionQueue(catalog, state, { duration, mood, queue, index, excludedIds });
  }

  const count = sessionCount(duration);
  const lockedCount = clamp(Math.floor(Number(index) || 0), 0, Math.min(count, queue.length));
  const locked = queue.slice(0, lockedCount);
  const used = new Set([...locked.map(item => item.id), ...excludedIds]);
  const queueState = seedSessionState(state, locked);
  const nextQueue = [...locked];

  for (let i = lockedCount; i < count; i++) {
    const p = count <= 1 ? 1 : i / (count - 1);
    const target = sessionTargetIntensity(p, mood);
    const item = chooseNext(catalog, queueState, mood, used, target);
    if (!item) break;
    nextQueue.push({ ...item, session_target_intensity: target, session_phase: sessionPhase(p) });
    used.add(item.id);
    queueState.recentItemIds = [item.id, ...queueState.recentItemIds.filter(id => id !== item.id)].slice(0, 50);
    queueState.runtimeRecentSources.unshift(item.source || "unknown");
    queueState.runtimeRecentSources = queueState.runtimeRecentSources.slice(0, MIX_WINDOW - 1);
    if (item.handle) {
      queueState.runtimeHandles.unshift(item.handle);
      queueState.runtimeHandles = queueState.runtimeHandles.slice(0, 24);
    }
  }
  return nextQueue;
}

export function buildSessionQueue(catalog, state, { duration = 5, mood = "personal" } = {}) {
  if (!isMixMode(mood, 3)) return coreBuildSessionQueue(catalog, state, { duration, mood });
  return adaptSessionQueue(catalog, state, { duration, mood, queue: [], index: 0 });
}

export { sessionPhase, sessionTargetIntensity, dominantLikedTags, recommendNextMode };
