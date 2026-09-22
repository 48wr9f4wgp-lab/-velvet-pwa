import {
  loadState,
  saveState,
  recordView,
  recordReaction,
  recordModeUse,
  clearTaste,
  clearHistory,
  clearAll,
  applyHistoryPolicy
} from "./store.js";
import {
  chooseNext,
  rankCandidates
} from "./recommender.js?v=46";
import { loadCatalog, preloadImages } from "./content.js?v=46";
import {
  archiveFavorite,
  backfillFavoriteArchive,
  clearFavoriteArchive,
  getAllArchivedFavorites,
  getArchivedFavorites,
  removeFavoriteArchive
} from "./favorite-archive.js?v=50";
import {
  SHARED_FAVORITE_RECOVERY_KEY,
  planSharedFavoriteRecovery,
  unionSharedFavorites
} from "./favorite-sync-recovery.js?v=51";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

let state = loadState();

function recoverArchivedFavoriteState() {
  const archived = getAllArchivedFavorites();
  if (!archived.length) return 0;

  const current = Array.isArray(state.likedItemIds) ? state.likedItemIds : [];
  const merged = [...new Set([...archived.map(item => String(item.id)), ...current])].slice(0, 400);
  if (merged.length === current.length && merged.every((id, index) => id === current[index])) return 0;

  state.likedItemIds = merged;
  state.counts.liked = merged.length;
  state = saveState(state);
  return Math.max(0, merged.length - current.length);
}

let catalog = [];
let catalogInfo = null;
let catalogReady = false;
let appUnlocked = false;
let currentItem = null;
const FLOW_PRESET_KEY = "velvet_private_v2_flow_preset";
const VALID_FLOW_MODES = new Set(["soft", "personal", "pro", "intense", "favorites", "explore", "popular", "latest"]);

function sharedFavoriteRecoveryDone() {
  try {
    const raw = localStorage.getItem(SHARED_FAVORITE_RECOVERY_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed?.ok === true;
  } catch (_) {
    return false;
  }
}

function writeSharedFavoriteRecoveryMarker(details) {
  try {
    localStorage.setItem(SHARED_FAVORITE_RECOVERY_KEY, JSON.stringify({
      ok: true,
      recovered_at: new Date().toISOString(),
      ...details
    }));
  } catch (_) {}
}
function readFlowMode() {
  try {
    const value = localStorage.getItem(FLOW_PRESET_KEY);
    if (VALID_FLOW_MODES.has(value)) return value;
    return "personal";
  } catch (_) {
    return "personal";
  }
}
let flowMode = readFlowMode();
let lastFlowAction = null;
let flowTransitionTimer = null;
let flowExclusions = new Set();
let flowBackStack = [];
let flowForwardStack = [];
const FLOW_NAV_LIMIT = 60;
const runtimeSeenByMode = new Map();
const FLOW_GRID_BATCH = 12;
let flowGridItems = [];
let flowViewerItems = [];
let flowGridRendered = 0;
let flowGridObserver = null;
let catalogSignatureValue = "";
let backgroundedAt = 0;
let foregroundRefreshTimer = null;
let foregroundRetryTimer = null;

function catalogSignature(items) {
  return (Array.isArray(items) ? items : [])
    .map(item => `${String(item?.id || "")}\u0000${String(item?.image_url || "")}`)
    .join("\u0001");
}

function runtimeSeenForMode(mode = flowMode) {
  if (!runtimeSeenByMode.has(mode)) runtimeSeenByMode.set(mode, new Set());
  return runtimeSeenByMode.get(mode);
}

function combinedFlowExclusions(mode = flowMode) {
  return new Set([...flowExclusions, ...runtimeSeenForMode(mode)]);
}

function isFavorite(item = currentItem) {
  return !!item?.id && Array.isArray(state.likedItemIds) && state.likedItemIds.includes(item.id);
}

function publishFlowItem(item = currentItem) {
  window.dispatchEvent(new CustomEvent("velvet:flow-item", {
    detail: {
      item: item || null,
      mode: flowMode,
      favorite: isFavorite(item)
    }
  }));
}

const els = {
  privacyGate: $("#privacyGate"),
  safeScreen: $("#safeScreen"),
  safeTime: $("#safeTime"),
  mainExperience: $("#mainExperience"),
  unlockButton: $("#unlockButton"),
  returnButton: $("#returnButton"),
  quickHideButton: $("#quickHideButton"),
  settingsButton: $("#settingsButton"),
  settingsDialog: $("#settingsDialog"),
  modeLabel: $("#modeLabel"),
  flowView: $("#flowView"),
  flowGridShell: $("#flowGridShell"),
  flowGrid: $("#flowGrid"),
  flowGridStatus: $("#flowGridStatus"),
  flowGridSentinel: $("#flowGridSentinel"),
  mediaCard: $("#mediaCard"),
  mediaImage: $("#mediaImage"),
  sourceLabel: $("#sourceLabel"),
  intensityLabel: $("#intensityLabel"),
  dragLike: $("#dragLike"),
  dragSkip: $("#dragSkip"),
  emptyState: $("#emptyState"),
  retryFeedButton: $("#retryFeedButton"),
  privacyBlurSetting: $("#privacyBlurSetting"),
  resumeSetting: $("#resumeSetting"),
  reducedMotionSetting: $("#reducedMotionSetting"),
  historyModeSetting: $("#historyModeSetting"),
  resetTasteButton: $("#resetTasteButton"),
  clearHistoryButton: $("#clearHistoryButton"),
  clearAllButton: $("#clearAllButton"),
  settingsStatus: $("#settingsStatus")
};

function setHidden(el, hidden) {
  el.classList.toggle("is-hidden", hidden);
}

function setView(view) {
  els.flowView.classList.toggle("view--active", view === els.flowView);
}

function setModeLabel(label) {
  els.modeLabel.textContent = label.toUpperCase();
}

function applyMotionPreference() {
  document.documentElement.classList.toggle("reduced-motion", !!state.settings.reducedMotion);
}

function updateSafeTime() {
  els.safeTime.textContent = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function showSafeScreen() {
  updateSafeTime();
  setHidden(els.mainExperience, true);
  setHidden(els.privacyGate, true);
  setHidden(els.safeScreen, false);
}

function revealApp() {
  appUnlocked = true;
  setHidden(els.privacyGate, true);
  setHidden(els.safeScreen, true);
  setHidden(els.mainExperience, false);
  setView(els.flowView);
  setModeLabel("Flow");
  if (catalogReady) refreshFlowGrid({ preserveCount: true });
}

function syncSettingsUi() {
  els.privacyBlurSetting.checked = !!state.settings.privacyBlur;
  els.resumeSetting.checked = !!state.settings.resumeLastItem;
  els.reducedMotionSetting.checked = !!state.settings.reducedMotion;
  els.historyModeSetting.value = state.settings.historyMode;
}

function imageFailed(img) {
  img.classList.add("image-failed");
}

function flowListItems() {
  if (!catalog.length) return [];
  if (flowMode === "favorites") {
    const byId = new Map(catalog.map(item => [item.id, item]));
    const archived = new Map(getArchivedFavorites(state.likedItemIds).map(item => [item.id, item]));
    return (state.likedItemIds || [])
      .map(id => archived.get(id) || byId.get(id))
      .filter(Boolean);
  }
  const limit = Math.max(1, catalog.length);
  return rankCandidates(catalog, state, flowMode, new Set(), null, limit).map(row => row.item);
}

function updateFlowGridStatus() {
  if (!els.flowGridStatus || !els.flowGridSentinel) return;
  if (!flowGridItems.length) {
    els.flowGridStatus.textContent = flowMode === "favorites"
      ? "お気に入りはまだありません"
      : "表示できる項目がありません";
    els.flowGridSentinel.hidden = true;
    return;
  }
  els.flowGridStatus.textContent = flowMode === "favorites"
    ? `${flowGridItems.length}件のお気に入り`
    : `${flowGridItems.length}件`;
  els.flowGridSentinel.hidden = flowGridRendered >= flowGridItems.length;
}

function gridSourceLabel(item) {
  if (item?.source_class === "pro") return "プロ";
  if (item?.source_class === "personal") return "素人";
  return "";
}

function buildFlowGridCard(item, index) {
  const card = document.createElement("article");
  card.className = "flow-grid-card";
  card.dataset.itemId = item.id;

  const media = document.createElement("button");
  media.type = "button";
  media.className = "flow-grid-card__media";
  media.setAttribute("aria-label", "画像を開く");

  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  img.decoding = "async";
  img.loading = index < 6 ? "eager" : "lazy";
  if ("fetchPriority" in img && index < 4) img.fetchPriority = "high";
  img.src = item.image_url;

  img.addEventListener("error", () => {
    const fallback = typeof item.thumb_url === "string" ? item.thumb_url.trim() : "";
    if (fallback && fallback !== img.src && img.dataset.velvetFallbackTried !== "1") {
      img.dataset.velvetFallbackTried = "1";
      img.src = fallback;
      return;
    }
    card.classList.add("image-failed");
  });
  img.addEventListener("load", () => card.classList.remove("image-failed"));

  media.append(img);
  media.addEventListener("click", () => openFlowGridItem(item));

  const source = gridSourceLabel(item);
  if (source) {
    const badge = document.createElement("span");
    badge.className = "flow-grid-card__source";
    badge.textContent = source;
    media.append(badge);
  }

  const favorite = document.createElement("button");
  favorite.type = "button";
  favorite.className = "flow-grid-card__favorite";
  favorite.dataset.favoriteId = item.id;
  favorite.setAttribute("aria-label", "お気に入り");
  favorite.textContent = "♥";
  const saved = isFavorite(item);
  favorite.classList.toggle("is-saved", saved);
  favorite.setAttribute("aria-pressed", saved ? "true" : "false");
  favorite.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    toggleFlowGridFavorite(item);
  });

  card.append(media, favorite);
  return card;
}

function appendFlowGridBatch() {
  if (!els.flowGrid || flowGridRendered >= flowGridItems.length) {
    updateFlowGridStatus();
    return;
  }
  const end = Math.min(flowGridRendered + FLOW_GRID_BATCH, flowGridItems.length);
  const fragment = document.createDocumentFragment();
  for (let i = flowGridRendered; i < end; i++) fragment.append(buildFlowGridCard(flowGridItems[i], i));
  els.flowGrid.append(fragment);
  flowGridRendered = end;
  updateFlowGridStatus();
}

function refreshFlowGrid({ resetScroll = false, preserveCount = false } = {}) {
  if (!els.flowGrid) return;
  els.flowGrid.classList.toggle("flow-grid--favorites", flowMode === "favorites");
  const previousCount = flowGridRendered;
  flowGridItems = flowListItems();
  flowGridRendered = 0;
  els.flowGrid.replaceChildren();

  const target = preserveCount
    ? Math.max(FLOW_GRID_BATCH, Math.min(previousCount || FLOW_GRID_BATCH, flowGridItems.length))
    : Math.min(FLOW_GRID_BATCH, flowGridItems.length);
  while (flowGridRendered < target) appendFlowGridBatch();
  if (!target) updateFlowGridStatus();

  if (resetScroll && els.flowGridShell) els.flowGridShell.scrollTop = 0;
  preloadImages(flowGridItems.slice(0, 4));
}

function syncFlowGridFavoriteStates() {
  if (!els.flowGrid) return;
  els.flowGrid.querySelectorAll("[data-favorite-id]").forEach(button => {
    const saved = (state.likedItemIds || []).includes(button.dataset.favoriteId);
    button.classList.toggle("is-saved", saved);
    button.setAttribute("aria-pressed", saved ? "true" : "false");
  });
}

function openFlowGridItem(item) {
  if (!item?.id) return;
  flowViewerItems = flowGridItems.slice();
  currentItem = item;
  state = recordView(state, item);
  publishFlowItem(item);
  const index = flowGridItems.findIndex(row => row.id === item.id);
  if (index >= 0) preloadImages(flowGridItems.slice(index + 1, index + 4));
  window.dispatchEvent(new CustomEvent("velvet:media-tap", { detail: { scope: "flow" } }));
}

function navigateFlowViewer(direction) {
  const step = direction === "previous" ? -1 : direction === "next" ? 1 : 0;
  if (!step || !currentItem?.id) return;

  const sequence = flowViewerItems.length ? flowViewerItems : flowGridItems;
  const currentIndex = sequence.findIndex(item => item.id === currentItem.id);
  if (currentIndex < 0) return;

  const nextIndex = currentIndex + step;
  const item = sequence[nextIndex];
  if (!item?.id) {
    window.dispatchEvent(new CustomEvent("velvet:flow-viewer-edge", { detail: { direction } }));
    return;
  }

  currentItem = item;
  state = recordView(state, item);
  publishFlowItem(item);

  const preloadStart = Math.max(0, nextIndex - 1);
  preloadImages(sequence.slice(preloadStart, nextIndex + 3));
}

function ensureFlowGridRenderedThrough(index) {
  if (!Number.isInteger(index) || index < 0) return;
  while (flowGridRendered <= index && flowGridRendered < flowGridItems.length) {
    appendFlowGridBatch();
  }
}

function restoreFlowGridPositionFromViewer(itemId) {
  if (!itemId || !els.flowGrid) return;
  const index = flowGridItems.findIndex(item => item.id === itemId);
  if (index < 0) return;
  ensureFlowGridRenderedThrough(index);
  requestAnimationFrame(() => {
    const card = [...els.flowGrid.querySelectorAll("[data-item-id]")]
      .find(node => node.dataset.itemId === itemId);
    card?.scrollIntoView({ block: "center", behavior: "auto" });
  });
}

function toggleFlowGridFavorite(item) {
  if (!item?.id) return;
  const stateBefore = JSON.parse(JSON.stringify(state));
  const wasSaved = isFavorite(item);

  if (wasSaved) {
    state.likedItemIds = state.likedItemIds.filter(id => id !== item.id);
    state = saveState(applyHistoryPolicy(state));
    removeFavoriteArchive(item);
    lastFlowAction = { item, stateBefore, kind: "unfavorite", modeBefore: flowMode };
    window.dispatchEvent(new CustomEvent("velvet:flow-feedback", { detail: { reaction: "unfavorite" } }));
  } else {
    state = recordReaction(state, item, "like");
    const saved = isFavorite(item);
    if (saved) archiveFavorite(item);
    lastFlowAction = { item, stateBefore, kind: "like", modeBefore: flowMode };
    window.dispatchEvent(new CustomEvent("velvet:flow-feedback", { detail: { reaction: "like", saved } }));
  }

  window.dispatchEvent(new CustomEvent("velvet:favorites-changed"));
  if (flowMode === "favorites") refreshFlowGrid({ preserveCount: true });
  else syncFlowGridFavoriteStates();
}

function setupFlowGridObserver() {
  if (!els.flowGridSentinel) return;
  if (!("IntersectionObserver" in window)) {
    while (flowGridRendered < flowGridItems.length) appendFlowGridBatch();
    return;
  }
  flowGridObserver?.disconnect();
  flowGridObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) appendFlowGridBatch();
  }, {
    root: els.flowGridShell || null,
    rootMargin: "360px 0px"
  });
  flowGridObserver.observe(els.flowGridSentinel);
}

function renderFlowItem(item, { recordExposure = true, rememberRuntime = true } = {}) {
  currentItem = item;
  if (!item) {
    els.emptyState.dataset.reason = flowMode === "favorites" ? "favorites" : "feed";
    setHidden(els.mediaCard, true);
    setHidden(els.emptyState, false);
    publishFlowItem(null);
    return;
  }
  delete els.emptyState.dataset.reason;
  setHidden(els.emptyState, true);
  setHidden(els.mediaCard, false);
  els.mediaImage.classList.remove("image-failed");
  els.mediaImage.src = item.image_url;
  els.mediaImage.alt = "Velvet feed item";
  els.sourceLabel.textContent = item.source_label || item.source || "Velvet";
  els.intensityLabel.textContent = `I${Math.round(Number(item.intensity) || 3)}`;
  els.mediaCard.style.transform = "";
  els.mediaCard.style.opacity = "";
  els.dragLike.style.opacity = "0";
  els.dragSkip.style.opacity = "0";

  if (recordExposure) state = recordView(state, item);
  flowExclusions.add(item.id);
  if (flowExclusions.size > 25) flowExclusions = new Set([...flowExclusions].slice(-18));
  if (rememberRuntime) runtimeSeenForMode().add(item.id);
  const rankedPreview = rankCandidates(catalog, state, flowMode, combinedFlowExclusions(), null, 4).map(row => row.item);
  preloadImages(rankedPreview);
  publishFlowItem(item);
}

function selectNextFlowItem({ preferResume = false } = {}) {
  if (!catalog.length) return null;

  let item = null;
  if (preferResume && state.settings.resumeLastItem && state.lastItemId) {
    item = catalog.find(row => row.id === state.lastItemId) || null;
  }
  if (!item) item = chooseNext(catalog, state, flowMode, combinedFlowExclusions());
  if (!item) {
    const currentId = currentItem?.id || null;
    runtimeSeenForMode().clear();
    flowExclusions.clear();
    if (currentId) {
      runtimeSeenForMode().add(currentId);
      flowExclusions.add(currentId);
    }
    item = chooseNext(catalog, state, flowMode, combinedFlowExclusions());
  }
  return item;
}

function showNextFlowItem(options = {}) {
  renderFlowItem(selectNextFlowItem(options));
}

function clearFlowNavigation() {
  flowBackStack = [];
  flowForwardStack = [];
}

function pushFlowBack(item = currentItem, { clearForward = true } = {}) {
  if (!item?.id) return;
  const last = flowBackStack[flowBackStack.length - 1];
  if (!last || last.id !== item.id) flowBackStack.push(item);
  if (flowBackStack.length > FLOW_NAV_LIMIT) flowBackStack = flowBackStack.slice(-FLOW_NAV_LIMIT);
  if (clearForward) flowForwardStack = [];
}

function animateFlowNavigation(direction, item, { recordExposure = true, rememberRuntime = true } = {}) {
  if (!item) return;
  clearTimeout(flowTransitionTimer);
  flowTransitionTimer = null;
  if (state.settings.reducedMotion) {
    renderFlowItem(item, { recordExposure, rememberRuntime });
    return;
  }
  const x = direction === "back" ? 110 : -110;
  els.mediaCard.style.transform = "translateX(" + x + "%) rotate(" + (direction === "back" ? 5 : -5) + "deg)";
  els.mediaCard.style.opacity = "0";
  flowTransitionTimer = setTimeout(() => {
    flowTransitionTimer = null;
    renderFlowItem(item, { recordExposure, rememberRuntime });
  }, 140);
}

function navigateFlowNext() {
  if (!currentItem) return;
  if (flowForwardStack.length) {
    pushFlowBack(currentItem, { clearForward: false });
    const item = flowForwardStack.pop();
    animateFlowNavigation("next", item, { recordExposure: false, rememberRuntime: false });
    return;
  }
  pushFlowBack(currentItem);
  const item = selectNextFlowItem();
  if (!item) return;
  preloadImages([item]);
  animateFlowNavigation("next", item);
}

function navigateFlowBack() {
  if (!currentItem || !flowBackStack.length) return;
  const item = flowBackStack.pop();
  if (!item) return;
  if (!flowForwardStack.length || flowForwardStack[flowForwardStack.length - 1]?.id !== currentItem.id) {
    flowForwardStack.push(currentItem);
    if (flowForwardStack.length > FLOW_NAV_LIMIT) flowForwardStack = flowForwardStack.slice(-FLOW_NAV_LIMIT);
  }
  animateFlowNavigation("back", item, { recordExposure: false, rememberRuntime: false });
}

function animateFlowDecision(direction, nextItem) {
  clearTimeout(flowTransitionTimer);
  flowTransitionTimer = null;
  if (state.settings.reducedMotion) {
    renderFlowItem(nextItem);
    return;
  }
  const x = direction === "like" ? 110 : -110;
  els.mediaCard.style.transform = `translateX(${x}%) rotate(${direction === "like" ? 7 : -7}deg)`;
  els.mediaCard.style.opacity = "0";
  flowTransitionTimer = setTimeout(() => {
    flowTransitionTimer = null;
    renderFlowItem(nextItem);
  }, 160);
}

function reactFlow(reaction) {
  if (!currentItem) return;
  const reactedItem = currentItem;
  const stateBefore = JSON.parse(JSON.stringify(state));
  const modeBefore = flowMode;
  pushFlowBack(reactedItem);
  state = recordReaction(state, reactedItem, reaction);
  lastFlowAction = { item: reactedItem, stateBefore, kind: reaction, modeBefore };
  const saved = reaction === "like" && isFavorite(reactedItem);
  if (reaction === "like") window.dispatchEvent(new CustomEvent("velvet:favorites-changed"));
  window.dispatchEvent(new CustomEvent("velvet:flow-feedback", { detail: { reaction, saved } }));
  const nextItem = selectNextFlowItem();
  if (nextItem) preloadImages([nextItem]);
  animateFlowDecision(reaction, nextItem);
}

function removeCurrentFavorite() {
  if (!currentItem || !isFavorite(currentItem)) return false;
  const item = currentItem;
  const modeBefore = flowMode;
  const stateBefore = JSON.parse(JSON.stringify(state));
  const wasFavoritesMode = modeBefore === "favorites";

  state.likedItemIds = state.likedItemIds.filter(id => id !== item.id);
  state = saveState(applyHistoryPolicy(state));
  removeFavoriteArchive(item);
  lastFlowAction = { item, stateBefore, kind: "unfavorite", modeBefore };

  let nextFavorite = null;
  if (wasFavoritesMode) nextFavorite = selectNextFlowItem();

  window.dispatchEvent(new CustomEvent("velvet:flow-feedback", { detail: { reaction: "unfavorite" } }));
  window.dispatchEvent(new CustomEvent("velvet:favorites-changed"));

  if (wasFavoritesMode) {
    if (nextFavorite) {
      pushFlowBack(item);
      preloadImages([nextFavorite]);
      animateFlowDecision("skip", nextFavorite);
    } else {
      clearTimeout(flowTransitionTimer);
      flowTransitionTimer = null;
      showNextFlowItem();
    }
  } else {
    publishFlowItem(item);
  }
  return true;
}

function handleFlowLike() {
  if (isFavorite()) {
    removeCurrentFavorite();
    return;
  }
  reactFlow("like");
}

function undoLastFlowAction() {
  if (!lastFlowAction) return;
  const action = lastFlowAction;
  lastFlowAction = null;
  clearTimeout(flowTransitionTimer);
  flowTransitionTimer = null;
  state = saveState(action.stateBefore);
  if (action.kind === "unfavorite" && isFavorite(action.item)) archiveFavorite(action.item);
  if (action.kind === "like" && !isFavorite(action.item)) removeFavoriteArchive(action.item, 0);
  clearFlowNavigation();

  if (action.kind === "unfavorite" && action.modeBefore === "favorites") {
    try { localStorage.setItem(FLOW_PRESET_KEY, "favorites"); } catch (_) {}
    flowMode = "favorites";
  }

  flowExclusions.delete(action.item.id);
  runtimeSeenForMode(action.modeBefore || flowMode).delete(action.item.id);
  currentItem = null;
  window.dispatchEvent(new CustomEvent("velvet:favorites-changed"));
  refreshFlowGrid({ preserveCount: true });
  window.dispatchEvent(new CustomEvent("velvet:flow-undone"));
}

function resetActiveExperience() {
  flowViewerItems = [];
  flowExclusions.clear();
  runtimeSeenByMode.clear();
  clearFlowNavigation();
  currentItem = null;
  lastFlowAction = null;
  clearTimeout(flowTransitionTimer);
  flowTransitionTimer = null;
  setView(els.flowView);
  setModeLabel("Flow");
  if (catalogReady && appUnlocked) refreshFlowGrid({ resetScroll: true });
}

function status(message) {
  els.settingsStatus.textContent = message;
  setTimeout(() => {
    if (els.settingsStatus.textContent === message) els.settingsStatus.textContent = "";
  }, 2200);
}

async function maybeRecoverSharedFavorites() {
  if (sharedFavoriteRecoveryDone()) return { attempted: false, recovered: false };

  const code = window.prompt(
    "Velvet お気に入り復元\n\nScriptableから救出済みの共有お気に入りを、このPWAへ追加します。\n既存のお気に入りは削除しません。\n\n復旧コードを貼り付けてください。"
  );
  if (code === null) return { attempted: false, recovered: false };

  try {
    const localArchives = getAllArchivedFavorites();
    const payload = await unionSharedFavorites(code, {
      favorites: localArchives,
      likedIds: state.likedItemIds || []
    });

    const plan = planSharedFavoriteRecovery({
      payload,
      currentLikedIds: state.likedItemIds || [],
      catalog
    });

    for (const item of plan.archiveItems) archiveFavorite(item);

    state.likedItemIds = plan.likedIds;
    state.counts.liked = plan.likedIds.length;
    state = saveState(applyHistoryPolicy(state));
    backfillFavoriteArchive(state.likedItemIds, catalog);

    writeSharedFavoriteRecoveryMarker({
      remote_revision: Number(payload.revision || 0),
      remote_items: plan.remoteItemCount,
      remote_orphans: plan.remoteOrphanCount,
      remote_ids_represented: plan.representedRemoteIdCount,
      local_favorites_after: state.likedItemIds.length,
      visible_archives: plan.recoveredVisibleCount
    });

    try { localStorage.setItem(FLOW_PRESET_KEY, "favorites"); } catch (_) {}
    flowMode = "favorites";
    flowViewerItems = [];
    flowExclusions.clear();
    runtimeSeenByMode.clear();
    clearFlowNavigation();
    currentItem = null;

    window.dispatchEvent(new CustomEvent("velvet:favorites-changed"));
    window.dispatchEvent(new CustomEvent("velvet:favorites-recovered", {
      detail: {
        count: plan.addedLocalIds,
        total: state.likedItemIds.length,
        remoteRepresented: plan.representedRemoteIdCount
      }
    }));

    if (catalogReady && appUnlocked) refreshFlowGrid({ resetScroll: true });

    window.alert(
      "お気に入り復元完了\n\n" +
      "共有側で確認できたID: " + plan.representedRemoteIdCount + "\n" +
      "PWAのお気に入りID: " + state.likedItemIds.length + "\n" +
      "既存PWAデータは残したまま統合しました。"
    );

    return {
      attempted: true,
      recovered: true,
      total: state.likedItemIds.length,
      remoteRepresented: plan.representedRemoteIdCount
    };
  } catch (error) {
    window.alert(
      "お気に入り復元エラー\n\n" +
      String(error?.message || error).slice(0, 500) +
      "\n\nPWA側の既存お気に入りは変更していません。"
    );
    return { attempted: true, recovered: false, error };
  }
}

function saveSettings() {
  state.settings.privacyBlur = els.privacyBlurSetting.checked;
  state.settings.resumeLastItem = els.resumeSetting.checked;
  state.settings.reducedMotion = els.reducedMotionSetting.checked;
  state.settings.historyMode = els.historyModeSetting.value;
  state = saveState(applyHistoryPolicy(state));
  applyMotionPreference();
  window.dispatchEvent(new CustomEvent("velvet:favorites-changed"));
  publishFlowItem();
  status("Saved locally");
}

async function reloadCatalog() {
  catalogReady = false;
  setHidden(els.emptyState, true);
  catalogInfo = await loadCatalog();
  catalog = catalogInfo.catalog;
  catalogSignatureValue = catalogSignature(catalog);
  catalogReady = true;
  backfillFavoriteArchive(state.likedItemIds, catalog);
  flowViewerItems = [];
  flowExclusions.clear();
  runtimeSeenByMode.clear();
  clearFlowNavigation();
  currentItem = null;
  if (appUnlocked) refreshFlowGrid({ resetScroll: true });
}

async function refreshCatalogIfChanged() {
  if (!catalogReady) return false;
  try {
    const nextInfo = await loadCatalog();
    const nextCatalog = nextInfo.catalog;
    const nextSignature = catalogSignature(nextCatalog);
    if (!nextSignature || nextSignature === catalogSignatureValue) return false;

    catalogInfo = nextInfo;
    catalog = nextCatalog;
    catalogSignatureValue = nextSignature;
    backfillFavoriteArchive(state.likedItemIds, catalog);
    flowViewerItems = [];
    flowExclusions.clear();
    runtimeSeenByMode.clear();
    clearFlowNavigation();
    currentItem = null;

    if (appUnlocked) refreshFlowGrid({ preserveCount: true });
    window.dispatchEvent(new CustomEvent("velvet:feed-refreshed", {
      detail: { count: catalog.length }
    }));
    return true;
  } catch (_) {
    return false;
  }
}

function scheduleForegroundFeedRefresh() {
  clearTimeout(foregroundRefreshTimer);
  clearTimeout(foregroundRetryTimer);

  foregroundRefreshTimer = setTimeout(() => {
    void refreshCatalogIfChanged();
  }, 1200);

  // GitHub publish can finish slightly before the Vercel production alias switches.
  // A second quiet check catches that handoff without requiring a manual app restart.
  foregroundRetryTimer = setTimeout(() => {
    void refreshCatalogIfChanged();
  }, 7000);
}

function bindEvents() {
  window.addEventListener("velvet:flow-undo", undoLastFlowAction);
  window.addEventListener("velvet:flow-toggle-favorite", event => {
    const requestedId = String(event.detail?.id || "");
    if (!currentItem?.id || currentItem.id !== requestedId) return;
    toggleFlowGridFavorite(currentItem);
    publishFlowItem(currentItem);
  });
  window.addEventListener("velvet:flow-viewer-navigate", event => {
    navigateFlowViewer(event.detail?.direction);
  });
  window.addEventListener("velvet:media-viewer-close", event => {
    if (event.detail?.scope !== "flow") return;
    restoreFlowGridPositionFromViewer(String(event.detail?.id || ""));
  });
  window.addEventListener("velvet:flow-preset", event => {
    const requested = event.detail?.id;
    flowMode = VALID_FLOW_MODES.has(requested) ? requested : "personal";
    lastFlowAction = null;
    flowViewerItems = [];
    flowExclusions.clear();
    runtimeSeenByMode.clear();
    clearFlowNavigation();
    currentItem = null;
    state = recordModeUse(state, `flow:${flowMode}`);
    if (catalogReady && appUnlocked) refreshFlowGrid({ resetScroll: true });
  });
  window.addEventListener("velvet:flow-filter", () => {
    lastFlowAction = null;
    flowViewerItems = [];
    flowExclusions.clear();
    runtimeSeenByMode.clear();
    clearFlowNavigation();
    currentItem = null;
    if (catalogReady && appUnlocked) refreshFlowGrid({ resetScroll: true });
  });
  els.unlockButton.addEventListener("click", revealApp);
  els.returnButton.addEventListener("click", () => {
    if (state.settings.privacyBlur) {
      setHidden(els.safeScreen, true);
      setHidden(els.privacyGate, false);
    } else {
      revealApp();
    }
  });
  els.quickHideButton.addEventListener("click", showSafeScreen);
  els.settingsButton.addEventListener("click", () => {
    syncSettingsUi();
    els.settingsDialog.showModal();
  });
  els.retryFeedButton.addEventListener("click", reloadCatalog);
  $$('[data-back-flow]').forEach(button => button.addEventListener("click", () => {
    setView(els.flowView);
    setModeLabel("Flow");
    refreshFlowGrid({ preserveCount: true });
  }));

  for (const control of [els.privacyBlurSetting, els.resumeSetting, els.reducedMotionSetting, els.historyModeSetting]) {
    control.addEventListener("change", saveSettings);
  }
  els.resetTasteButton.addEventListener("click", () => {
    state = clearTaste(state);
    resetActiveExperience();
    status("Taste reset");
  });
  els.clearHistoryButton.addEventListener("click", () => {
    state = clearHistory(state);
    resetActiveExperience();
    window.dispatchEvent(new CustomEvent("velvet:favorites-changed"));
    status("History cleared · favorites kept");
  });
  els.clearAllButton.addEventListener("click", () => {
    state = clearAll();
    void clearFavoriteArchive();
    syncSettingsUi();
    applyMotionPreference();
    resetActiveExperience();
    window.dispatchEvent(new CustomEvent("velvet:favorites-changed"));
    status("All local Velvet data cleared");
  });

  els.mediaImage.addEventListener("error", () => {
    imageFailed(els.mediaImage);
    if (currentItem?.id) flowExclusions.add(currentItem.id);
    setTimeout(showNextFlowItem, 80);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      backgroundedAt = Date.now();
      clearTimeout(foregroundRefreshTimer);
      clearTimeout(foregroundRetryTimer);
      return;
    }

    const awayMs = backgroundedAt ? Date.now() - backgroundedAt : 0;
    backgroundedAt = 0;
    if (awayMs >= 1200) scheduleForegroundFeedRefresh();
  });

  setupFlowGridObserver();
}

async function init() {
  const recoveredFavorites = recoverArchivedFavoriteState();
  applyMotionPreference();
  bindEvents();
  syncSettingsUi();

  if (recoveredFavorites > 0) {
    window.dispatchEvent(new CustomEvent("velvet:favorites-recovered", {
      detail: { count: recoveredFavorites }
    }));
  }

  if (!state.settings.privacyBlur) revealApp();

  catalogInfo = await loadCatalog();
  catalog = catalogInfo.catalog;
  catalogSignatureValue = catalogSignature(catalog);
  catalogReady = true;
  backfillFavoriteArchive(state.likedItemIds, catalog);
  await maybeRecoverSharedFavorites();
  state = recordModeUse(state, "flow");

  if (appUnlocked) {
    refreshFlowGrid({ resetScroll: true });
  } else if (state.settings.privacyBlur) {
    setHidden(els.privacyGate, false);
    setHidden(els.mainExperience, true);
  } else {
    revealApp();
  }

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js?v=50").catch(() => {});
  }
}

init();