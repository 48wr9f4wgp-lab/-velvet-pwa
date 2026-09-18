const PRESETS = {
  soft: { targetIntensity: 1.8, explore: 0.05 },
  personal: { targetIntensity: 3.0, explore: 0.08 },
  pro: { targetIntensity: 3.4, explore: 0.05 },
  intense: { targetIntensity: 5.0, explore: 0.03 },
  favorites: { targetIntensity: 3.0, explore: 0 },
  explore: { targetIntensity: 3.0, explore: 0.55 }
};

const MODE_BASELINE = Object.freeze({
  soft: "mix",
  personal: "personal",
  pro: "pro",
  intense: "max",
  explore: "mix"
});

const FLOW_PRESET_KEY = "velvet_private_v2_flow_preset";
const SESSION_COUNTS = Object.freeze({ 3: 12, 5: 20, 10: 40 });
const runtimeFlowSources = [];
const runtimeFlowHandles = [];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function preferenceSignal(raw, scale = 8) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.tanh(n / scale);
}

function baselineNameForMode(mode) {
  return MODE_BASELINE[mode] || null;
}

function baselineProfile(item, mode) {
  const name = baselineNameForMode(mode);
  if (!name) return null;
  const profile = item?.baseline?.profiles?.[name];
  return profile?.eligible === true ? profile : null;
}

function baselineEligible(item, mode) {
  if (mode === "favorites") return true;
  if (!item?.baseline) return true;
  return !!baselineProfile(item, mode);
}

function itemIntensity(item, mode = null) {
  const profile = mode ? baselineProfile(item, mode) : null;
  const n = Number(profile?.intensity ?? item?.intensity);
  return Number.isFinite(n) ? clamp(n, 1, 5) : 3;
}

function intensityKey(item) {
  return `i${Math.round(itemIntensity(item))}`;
}

function sourceClassKey(item) {
  const value = typeof item?.source_class === "string" ? item.source_class.trim().toLowerCase() : "";
  return value || "unknown";
}

function scoreTags(item, state) {
  const values = (item.tags || [])
    .map(tag => preferenceSignal(state.tagWeights?.[tag], 8))
    .filter(Number.isFinite);
  if (!values.length) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const evidence = Math.min(1.25, 0.9 + values.length * 0.07);
  return average * 2.4 * evidence;
}

function scoreSource(item, state) {
  return preferenceSignal(state.sourceWeights?.[item.source], 6) * 1.2;
}

function scoreLearnedDimensions(item, state) {
  const intensity = preferenceSignal(state.intensityWeights?.[intensityKey(item)], 4) * 0.9;
  const sourceClass = preferenceSignal(state.sourceClassWeights?.[sourceClassKey(item)], 5) * 1.05;
  return intensity + sourceClass;
}

function noveltyScore(item, state) {
  const recentItems = state.recentItemIds || [];
  const pos = recentItems.indexOf(item.id);
  if (pos === 0) return -10;
  if (pos > 0 && pos < 8) return -4 + pos * 0.35;
  if (pos >= 8) return -0.3;
  return 0.9;
}

function recentSourcesFor(state, targetIntensity) {
  if (targetIntensity == null) return runtimeFlowSources;
  if (Array.isArray(state?.runtimeRecentSources)) return state.runtimeRecentSources;
  return Array.isArray(state?.recentSources) ? state.recentSources : [];
}

function recentHandlesFor(state, targetIntensity) {
  if (targetIntensity == null) return runtimeFlowHandles;
  return Array.isArray(state?.runtimeHandles) ? state.runtimeHandles : [];
}

function canonicalRecentScore(item, mode, recentSources, recentHandles) {
  const recent = recentSources.slice(0, 12);
  const recentHits = recent.filter(source => source === item.source).length;
  const immediate = recent[0] === item.source ? 0.14 : 0;
  let score = -recentHits * 0.04 - immediate;

  if (mode === "intense") {
    if (item.handle) {
      const pos = recentHandles.slice(0, 8).indexOf(item.handle);
      if (pos === 0) score -= 0.32;
      else if (pos > 0) score -= Math.max(0.06, 0.20 - pos * 0.02);
      else score += 0.08;
    }
    const sourceRecent = recent.slice(0, 4);
    if (sourceRecent[0] === item.source) score -= 0.12;
    else if (sourceRecent.length && !sourceRecent.slice(0, 3).includes(item.source)) score += 0.06;
  }
  return score;
}

function canonicalBaselineScore(item, mode) {
  const profile = baselineProfile(item, mode);
  if (!profile) return 0;
  let score = Number(profile.score || 0);
  if (profile.post_female) score += 0.15;
  else score += 0.07;
  if (profile.post_jp) score += 0.08;
  if (profile.age_target) score += 0.18;

  const rawConfidence = Number(profile.exposure_confidence);
  const exposureConfidence = Number.isFinite(rawConfidence)
    ? clamp(rawConfidence, 0, 1)
    : (profile.exposure_tier === "unknown" ? 0 : 1);
  if (profile.exposure_tier === "high") score += 0.34 * exposureConfidence;
  else if (profile.exposure_tier === "medium") score += 0.16 * exposureConfidence;
  else if (profile.exposure_tier === "low") score -= (mode === "pro" ? 0.82 : 0.28) * exposureConfidence;
  return score;
}

function baselineRunCap(item, mode) {
  const cap = Number(baselineProfile(item, mode)?.run_cap);
  return Number.isFinite(cap) ? Math.max(1, Math.min(10, Math.round(cap))) : null;
}

function applyCanonicalRunCaps(pool, mode, recentSources) {
  if (!MODE_BASELINE[mode] || recentSources.length < 1) return pool;
  const window = recentSources.slice(0, 10);
  const underCap = pool.filter(item => {
    const cap = baselineRunCap(item, mode);
    if (!cap) return true;
    const hits = window.filter(source => source === item.source).length;
    return hits < cap;
  });
  return underCap.length ? underCap : pool;
}

function applyHandleFreshness(pool, state, targetIntensity) {
  const handles = recentHandlesFor(state, targetIntensity);
  if (!handles.length) return pool;
  const fresh = pool.filter(item => !item.handle || !handles.includes(item.handle));
  return fresh.length ? fresh : pool;
}

function applyCanonicalMaxFlowFunnel(pool, mode, targetIntensity) {
  if (mode !== "intense" || targetIntensity != null || !pool.length) return pool;
  const maxProfile = item => baselineProfile(item, "intense");
  const femaleHigh = pool.filter(item => {
    const p = maxProfile(item);
    return p?.post_female === true && p?.exposure_tier === "high";
  });
  if (femaleHigh.length) return femaleHigh;

  const high = pool.filter(item => maxProfile(item)?.exposure_tier === "high");
  if (high.length) return high;

  const femaleMedium = pool.filter(item => {
    const p = maxProfile(item);
    return p?.post_female === true && p?.exposure_tier === "medium";
  });
  if (femaleMedium.length) return femaleMedium;

  const medium = pool.filter(item => maxProfile(item)?.exposure_tier === "medium");
  return medium.length ? medium : pool;
}

function rememberFlowSelection(item) {
  runtimeFlowSources.unshift(item?.source || "unknown");
  runtimeFlowSources.splice(12);
  if (item?.handle) {
    runtimeFlowHandles.unshift(item.handle);
    runtimeFlowHandles.splice(24);
  }
}

function modeFit(item, mode, preset) {
  const intensityDistance = Math.abs(itemIntensity(item, mode) - preset.targetIntensity);
  return -intensityDistance * 0.75;
}

function stableNoise(item) {
  let h = 2166136261;
  const s = String(item.id || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function storedFlowPreset() {
  try {
    if (typeof localStorage === "undefined") return null;
    const value = localStorage.getItem(FLOW_PRESET_KEY);
    return value && PRESETS[value] ? value : null;
  } catch (_) {
    return null;
  }
}

function resolveMode(mode, targetIntensity) {
  if (targetIntensity != null) return PRESETS[mode] ? mode : "personal";
  return storedFlowPreset() || (PRESETS[mode] ? mode : "personal");
}

function sessionCount(duration) {
  return SESSION_COUNTS[Number(duration)] || SESSION_COUNTS[5];
}

export function scoreItem(item, state, mode = "personal", targetIntensity = null) {
  const resolvedMode = resolveMode(mode, targetIntensity);
  const preset = PRESETS[resolvedMode] || PRESETS.personal;
  const effective = targetIntensity == null ? preset : { ...preset, targetIntensity };

  if (resolvedMode === "favorites" && !(state.likedItemIds || []).includes(item.id)) return -9999;
  if (!baselineEligible(item, resolvedMode)) return -9999;

  const baseline = canonicalBaselineScore(item, resolvedMode);
  const tag = scoreTags(item, state);
  const source = scoreSource(item, state);
  const learnedDimensions = scoreLearnedDimensions(item, state);
  const novelty = noveltyScore(item, state);
  const canonicalRecency = canonicalRecentScore(
    item,
    resolvedMode,
    recentSourcesFor(state, targetIntensity),
    recentHandlesFor(state, targetIntensity)
  );
  const fit = modeFit(item, resolvedMode, effective);
  const explore = stableNoise(item) * effective.explore * 8;
  const liked = (state.likedItemIds || []).includes(item.id) ? 1.25 : 0;
  const skipped = (state.skippedItemIds || []).includes(item.id) ? -2.2 : 0;

  return baseline + tag + source + learnedDimensions + novelty + canonicalRecency + fit + explore + liked + skipped;
}

export function rankCandidates(catalog, state, mode = "personal", exclusions = new Set(), targetIntensity = null, limit = 70) {
  const resolvedMode = resolveMode(mode, targetIntensity);
  const liked = new Set(state.likedItemIds || []);
  let pool = catalog.filter(item =>
    item?.id &&
    item?.image_url &&
    !exclusions.has(item.id) &&
    baselineEligible(item, resolvedMode) &&
    (resolvedMode !== "favorites" || liked.has(item.id))
  );

  pool = applyHandleFreshness(pool, state, targetIntensity);
  pool = applyCanonicalMaxFlowFunnel(pool, resolvedMode, targetIntensity);
  pool = applyCanonicalRunCaps(pool, resolvedMode, recentSourcesFor(state, targetIntensity));

  return pool
    .map(item => ({ item, score: scoreItem(item, state, resolvedMode, targetIntensity) }))
    .filter(row => Number.isFinite(row.score) && row.score > -9000)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Number(limit) || 70));
}

export function chooseNext(catalog, state, mode = "personal", exclusions = new Set(), targetIntensity = null) {
  const ranked = rankCandidates(catalog, state, mode, exclusions, targetIntensity, 70);
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

  if (targetIntensity == null) rememberFlowSelection(selected);
  return selected;
}

export function sessionPhase(progress) {
  if (progress < 0.2) return "START";
  if (progress < 0.55) return "BUILD";
  if (progress < 0.85) return "PEAK";
  return "FINISH";
}

export function sessionTargetIntensity(progress, mood = "personal") {
  const preset = PRESETS[mood] || PRESETS.personal;
  const p = clamp(Number(progress) || 0, 0, 1);
  const start = mood === "soft" ? 1.15 : 1.45;
  const build = lerp(start, preset.targetIntensity, 0.58);
  const peak = preset.targetIntensity;
  const finish = Math.max(start + 0.35, peak - (mood === "intense" ? 0.75 : 0.55));

  if (p < 0.2) return lerp(start, build, smoothstep(p / 0.2));
  if (p < 0.55) return lerp(build, peak, smoothstep((p - 0.2) / 0.35));
  if (p < 0.85) return peak;
  return lerp(peak, finish, smoothstep((p - 0.85) / 0.15));
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
  queueState.runtimeRecentSources = queueState.runtimeRecentSources.slice(0, 12);
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

    nextQueue.push({
      ...item,
      session_target_intensity: target,
      session_phase: sessionPhase(p)
    });
    used.add(item.id);
    queueState.recentItemIds = [item.id, ...queueState.recentItemIds.filter(id => id !== item.id)].slice(0, 50);
    queueState.runtimeRecentSources.unshift(item.source || "unknown");
    queueState.runtimeRecentSources = queueState.runtimeRecentSources.slice(0, 12);
    if (item.handle) {
      queueState.runtimeHandles.unshift(item.handle);
      queueState.runtimeHandles = queueState.runtimeHandles.slice(0, 24);
    }
  }

  return nextQueue;
}

export function buildSessionQueue(catalog, state, { duration = 5, mood = "personal" } = {}) {
  return adaptSessionQueue(catalog, state, { duration, mood, queue: [], index: 0 });
}

export function dominantLikedTags(items, likedIds, limit = 4) {
  const counts = new Map();
  const liked = new Set(likedIds);
  for (const item of items) {
    if (!liked.has(item.id)) continue;
    for (const tag of item.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

export function recommendNextMode({ likes = 0, skips = 0, mood = "personal", completion = 1 } = {}) {
  const total = likes + skips;
  const likeRate = total ? likes / total : 0;
  if (completion < 0.5) return "Try a shorter 3-minute Personal session.";
  if (likeRate > 0.65 && mood !== "intense") return "Strong match. Intense may be worth trying next.";
  if (likeRate < 0.25 && mood !== "soft") return "Low hit rate. Soft or Explore should diversify the next run.";
  return "Personal remains the best default for the next session.";
}
