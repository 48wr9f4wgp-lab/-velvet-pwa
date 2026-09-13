const LIVE_FEED_URL = "./velvet-content.json";
const MIN_LIVE_ITEMS = 3;
const AUTO_PROBE_DELAYS = [1200, 4000, 10000, 20000];

let feedInfo = window.__velvetFeedInfo || null;
let probeTimer = null;
let probeIndex = 0;
let probing = false;

function emitStatus(message, timeout = 2600) {
  window.dispatchEvent(new CustomEvent("velvet:feed-sync-status", {
    detail: { message, timeout }
  }));
}

function isDemoFeed() {
  return feedInfo?.demo === true;
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

function clearProbe() {
  clearTimeout(probeTimer);
  probeTimer = null;
  probeIndex = 0;
}

async function probeLiveFeed({ userRequested = false } = {}) {
  if (!isDemoFeed() || probing || document.hidden) return;
  probing = true;
  if (userRequested) emitStatus("最新フィードを確認しています", 1600);
  const live = await liveFeedAvailable();
  probing = false;

  if (live) {
    clearProbe();
    emitStatus("最新フィードを取得しました", 1200);
    setTimeout(() => location.reload(), 120);
    return;
  }

  if (userRequested) {
    emitStatus("フィード準備中です。自動で再確認します", 2800);
  }

  if (probeIndex >= AUTO_PROBE_DELAYS.length) return;
  const delay = AUTO_PROBE_DELAYS[probeIndex++];
  clearTimeout(probeTimer);
  probeTimer = setTimeout(() => probeLiveFeed(), delay);
}

window.addEventListener("velvet:feed-info", event => {
  feedInfo = event.detail || null;
  if (isDemoFeed()) {
    emitStatus("フィード準備中・自動で更新を確認します", 4200);
    clearProbe();
    probeTimer = setTimeout(() => probeLiveFeed(), 500);
  } else {
    clearProbe();
  }
});

window.addEventListener("velvet:media-tap", event => {
  if (!isDemoFeed()) return;
  event.stopImmediatePropagation();
  probeLiveFeed({ userRequested: true });
}, { capture: true });

window.addEventListener("velvet:feed-sync-request", () => {
  probeLiveFeed({ userRequested: true });
});

window.addEventListener("focus", () => probeLiveFeed());
window.addEventListener("pageshow", () => probeLiveFeed());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) probeLiveFeed();
});
