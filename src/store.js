const STORE_KEY = "velvet_private_v2_state";

export const DEFAULT_STATE = Object.freeze({
  schemaVersion: 2,
  counts: { liked: 0, skipped: 0, viewed: 0 },
  tagWeights: {},
  sourceWeights: {},
  intensityWeights: {},
  sourceClassWeights: {},
  likedItemIds: [],
  skippedItemIds: [],
  viewedItemIds: [],
  recentItemIds: [],
  recentSources: [],
  modeUsage: {},
  sessionHistory: [],
  lastUsedAt: null,
  lastItemId: null,
  settings: {
    privacyBlur: true,
    resumeLastItem: false,
    reducedMotion: false,
    historyMode: "likes"
  }
});

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function normalizeStringArray(value, max = 400) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(v => typeof v === "string" && v.trim()).map(v => v.trim()))].slice(0, max);
}

function normalizeWeightMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const n = Number(raw);
    if (key && Number.isFinite(n)) out[key] = Math.max(-50, Math.min(50, n));
  }
  return out;
}

function intensityKey(item) {
  const n = Math.round(Number(item?.intensity));
  return Number.isFinite(n) ? `i${Math.max(1, Math.min(5, n))}` : "i3";
}

function sourceClassKey(item) {
  const value = typeof item?.source_class === "string" ? item.source_class.trim().toLowerCase() : "";
  return value || "unknown";
}

export function normalizeState(raw) {
  const base = cloneDefault();
  if (!raw || typeof raw !== "object") return base;

  const settings = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  const historyMode = ["off", "likes", "full"].includes(settings.historyMode) ? settings.historyMode : base.settings.historyMode;
  const resumeLastItem = settings.resumeLastItem === true;

  return {
    schemaVersion: 2,
    counts: {
      liked: Math.max(0, Number(raw.counts?.liked) || 0),
      skipped: Math.max(0, Number(raw.counts?.skipped) || 0),
      viewed: Math.max(0, Number(raw.counts?.viewed) || 0)
    },
    tagWeights: normalizeWeightMap(raw.tagWeights),
    sourceWeights: normalizeWeightMap(raw.sourceWeights),
    intensityWeights: normalizeWeightMap(raw.intensityWeights),
    sourceClassWeights: normalizeWeightMap(raw.sourceClassWeights),
    likedItemIds: normalizeStringArray(raw.likedItemIds),
    skippedItemIds: normalizeStringArray(raw.skippedItemIds),
    viewedItemIds: normalizeStringArray(raw.viewedItemIds),
    recentItemIds: normalizeStringArray(raw.recentItemIds, 80),
    recentSources: normalizeStringArray(raw.recentSources, 24),
    modeUsage: normalizeWeightMap(raw.modeUsage),
    sessionHistory: Array.isArray(raw.sessionHistory) ? raw.sessionHistory.slice(0, 30) : [],
    lastUsedAt: typeof raw.lastUsedAt === "string" ? raw.lastUsedAt : null,
    lastItemId: resumeLastItem && typeof raw.lastItemId === "string" ? raw.lastItemId : null,
    settings: {
      privacyBlur: settings.privacyBlur !== false,
      resumeLastItem,
      reducedMotion: settings.reducedMotion === true,
      historyMode
    }
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : cloneDefault();
  } catch (_) {
    return cloneDefault();
  }
}

export function saveState(state) {
  const normalized = normalizeState(state);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(normalized));
  } catch (_) {}
  return normalized;
}

export function applyHistoryPolicy(state) {
  const mode = state.settings.historyMode;
  if (mode === "off") {
    state.likedItemIds = [];
    state.skippedItemIds = [];
    state.viewedItemIds = [];
    state.recentItemIds = [];
    state.recentSources = [];
  } else if (mode === "likes") {
    state.skippedItemIds = [];
    state.viewedItemIds = [];
    state.recentItemIds = [];
    state.recentSources = [];
  }
  if (!state.settings.resumeLastItem) state.lastItemId = null;
  return state;
}

export function clearTaste(state) {
  state.tagWeights = {};
  state.sourceWeights = {};
  state.intensityWeights = {};
  state.sourceClassWeights = {};
  state.modeUsage = {};
  return saveState(state);
}

export function clearHistory(state) {
  state.likedItemIds = [];
  state.skippedItemIds = [];
  state.viewedItemIds = [];
  state.recentItemIds = [];
  state.recentSources = [];
  state.sessionHistory = [];
  state.lastItemId = null;
  return saveState(state);
}

export function clearAll() {
  try { localStorage.removeItem(STORE_KEY); } catch (_) {}
  return cloneDefault();
}

export function recordView(state, item) {
  state.counts.viewed += 1;
  state.lastUsedAt = new Date().toISOString();
  state.lastItemId = state.settings.resumeLastItem ? item.id : null;
  state.recentItemIds = [item.id, ...state.recentItemIds.filter(id => id !== item.id)].slice(0, 50);
  state.recentSources = [item.source || "unknown", ...state.recentSources.filter(s => s !== (item.source || "unknown"))].slice(0, 16);
  if (state.settings.historyMode === "full") {
    state.viewedItemIds = [item.id, ...state.viewedItemIds.filter(id => id !== item.id)].slice(0, 400);
  }
  return saveState(applyHistoryPolicy(state));
}

export function recordReaction(state, item, reaction) {
  const delta = reaction === "like" ? 2 : -1;
  if (reaction === "like") state.counts.liked += 1;
  if (reaction === "skip") state.counts.skipped += 1;

  for (const tag of item.tags || []) state.tagWeights[tag] = (state.tagWeights[tag] || 0) + delta;
  if (item.source) state.sourceWeights[item.source] = (state.sourceWeights[item.source] || 0) + delta * 0.35;

  const iKey = intensityKey(item);
  const cKey = sourceClassKey(item);
  state.intensityWeights[iKey] = (state.intensityWeights[iKey] || 0) + delta * 0.45;
  state.sourceClassWeights[cKey] = (state.sourceClassWeights[cKey] || 0) + delta * 0.55;

  if (reaction === "like" && state.settings.historyMode !== "off") {
    state.likedItemIds = [item.id, ...state.likedItemIds.filter(id => id !== item.id)].slice(0, 400);
  }
  if (reaction === "skip" && state.settings.historyMode === "full") {
    state.skippedItemIds = [item.id, ...state.skippedItemIds.filter(id => id !== item.id)].slice(0, 400);
  }

  return saveState(applyHistoryPolicy(state));
}

export function recordModeUse(state, mode) {
  state.modeUsage[mode] = (state.modeUsage[mode] || 0) + 1;
  return saveState(state);
}

export function recordSession(state, summary) {
  state.sessionHistory = [summary, ...state.sessionHistory].slice(0, 30);
  if (summary.completed && Array.isArray(summary.dominantTags)) {
    for (const tag of summary.dominantTags) state.tagWeights[tag] = (state.tagWeights[tag] || 0) + 1;
  }
  return saveState(state);
}
