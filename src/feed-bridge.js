const SCRIPTABLE_SYNC_URL = "scriptable:///run/Velvet%20Feed%20Sync";
const PENDING_KEY = "velvet_feed_sync_pending_v1";
const LIVE_FEED_URL = "./velvet-content.json";
const MIN_LIVE_ITEMS = 3;
const MAX_PROBE_ATTEMPTS = 5;

let feedInfo = window.__velvetFeedInfo || null;
let probeTimer = null;
let probeAttempt = 0;
let probing = false;

function emitStatus(message, timeout = 2600) {
  window.dispatchEvent(new CustomEvent("velvet:feed-sync-status", {
    detail: { message, timeout }
  }));
}

function isDemoFeed() {
  return feedInfo?.demo === true;
}

function rememberPending() {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ startedAt: Date.now() }));
  } catch (_) {}
}

function hasPendingSync() {
  try {
    return !!sessionStorage.getItem(PENDING_KEY);
  } catch (_) {
    return false;
  }
}

function clearPending() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch (_) {}
  probeAttempt = 0;
}

async function liveFeedAvailable() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${LIVE_FEED_URL}?t=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal
    });
    if (!response.ok) return false;
    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
    return items.length >= MIN_LIVE_ITEMS;
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function probeAfterReturn() {
  if (!hasPendingSync() || probing || document.hidden) return;
  probing = true;
  const live = await liveFeedAvailable();
  probing = false;

  if (live) {
    clearPending();
    emitStatus("フィード更新を確認しました", 1400);
    setTimeout(() => location.reload(), 180);
    return;
  }

  probeAttempt += 1;
  if (probeAttempt >= MAX_PROBE_ATTEMPTS) {
    emitStatus("同期を確認できません。デモカードをタップして再試行", 4200);
    return;
  }

  clearTimeout(probeTimer);
  probeTimer = setTimeout(probeAfterReturn, 700 * probeAttempt);
}

function requestScriptableSync() {
  if (!isDemoFeed()) return false;
  rememberPending();
  emitStatus("Scriptableでフィードを更新します", 2200);
  window.location.href = SCRIPTABLE_SYNC_URL;
  clearTimeout(probeTimer);
  probeTimer = setTimeout(probeAfterReturn, 1800);
  return true;
}

window.addEventListener("velvet:feed-info", event => {
  feedInfo = event.detail || null;
  if (isDemoFeed()) {
    emitStatus("デモ表示中・カードをタップで同期", 5200);
  } else {
    clearPending();
  }
});

window.addEventListener("velvet:media-tap", event => {
  if (!isDemoFeed()) return;
  event.stopImmediatePropagation();
  requestScriptableSync();
}, { capture: true });

window.addEventListener("velvet:feed-sync-request", () => {
  requestScriptableSync();
});

window.addEventListener("focus", probeAfterReturn);
window.addEventListener("pageshow", probeAfterReturn);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) probeAfterReturn();
});

if (hasPendingSync()) {
  probeTimer = setTimeout(probeAfterReturn, 500);
}
