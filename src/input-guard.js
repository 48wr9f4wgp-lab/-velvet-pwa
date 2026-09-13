import "./ui-ja.js?v=34";
import "./flow-feedback.js?v=34";
import "./feed-bridge.js?v=34";
import "./media-viewer.js?v=34";

const UX_STYLESHEET = "./flow-ux.css";
if (!document.querySelector('link[data-velvet-flow-ux]')) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = UX_STYLESHEET;
  link.dataset.velvetFlowUx = "1";
  document.head.append(link);
}

const LOCK_MS = 180;
const DECISION_DISTANCE = 52;
const FLICK_DISTANCE = 28;
const FLICK_VELOCITY = 0.45;
const TAP_DISTANCE = 9;
const TAP_MAX_MS = 420;
const lockedUntil = new Map();

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function acquire(group) {
  const t = now();
  if (t < (lockedUntil.get(group) || 0)) return false;
  lockedUntil.set(group, t + LOCK_MS);
  return true;
}

function resetDecisionCard(card) {
  card.style.transform = "";
  card.style.opacity = "";
  document.querySelector("#dragLike")?.style.setProperty("opacity", "0");
  document.querySelector("#dragSkip")?.style.setProperty("opacity", "0");
}

function isDemoFlow() {
  return window.__velvetFeedInfo?.demo === true || String(document.querySelector("#sourceLabel")?.textContent || "").trim().toLowerCase() === "demo";
}

function launchFeedSyncFromDemo() {
  window.dispatchEvent(new CustomEvent("velvet:feed-sync-status", {
    detail: { message: "Scriptableでフィードを更新します", timeout: 2200 }
  }));
  window.location.href = "scriptable:///run/Velvet%20Feed%20Sync";
}

function guardButton(selector, group, label) {
  const button = document.querySelector(selector);
  if (!button) return;
  if (label) button.dataset.label = label;
  button.addEventListener("click", event => {
    if (acquire(group)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });
}

function bindFastDecisionGesture({ cardSelector, likeSelector, skipSelector, showCues = false, scope = "flow" }) {
  const card = document.querySelector(cardSelector);
  const likeButton = document.querySelector(likeSelector);
  const skipButton = document.querySelector(skipSelector);
  if (!card || !likeButton || !skipButton) return;

  const gestures = new Map();

  card.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    gestures.set(event.pointerId, {
      startX: event.clientX,
      startY: event.clientY,
      x: 0,
      y: 0,
      startedAt: now(),
      vertical: false
    });
    card.setPointerCapture?.(event.pointerId);
    event.stopImmediatePropagation();
  }, { capture: true });

  card.addEventListener("pointermove", event => {
    const gesture = gestures.get(event.pointerId);
    if (!gesture) return;

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    gesture.x = dx;
    gesture.y = dy;

    if (!gesture.vertical && Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) * 1.35) {
      gesture.vertical = true;
    }

    if (!gesture.vertical) {
      event.preventDefault();
      const pct = Math.max(-1, Math.min(1, dx / DECISION_DISTANCE));
      card.style.transform = `translateX(${dx * 0.78}px) rotate(${pct * 5.5}deg)`;
      if (showCues) {
        document.querySelector("#dragLike")?.style.setProperty("opacity", String(Math.max(0, Math.min(1, pct * 1.15))));
        document.querySelector("#dragSkip")?.style.setProperty("opacity", String(Math.max(0, Math.min(1, -pct * 1.15))));
      }
    }

    event.stopImmediatePropagation();
  }, { capture: true });

  const finish = event => {
    if (!gestures.has(event.pointerId)) return;
    const gesture = gestures.get(event.pointerId);
    gestures.delete(event.pointerId);
    card.releasePointerCapture?.(event.pointerId);

    const elapsed = Math.max(1, now() - gesture.startedAt);
    const velocity = gesture.x / elapsed;
    const horizontalEnough = Math.abs(gesture.x) >= Math.abs(gesture.y) * 0.72;
    const distanceDecision = Math.abs(gesture.x) >= DECISION_DISTANCE;
    const flickDecision = Math.abs(gesture.x) >= FLICK_DISTANCE && Math.abs(velocity) >= FLICK_VELOCITY;
    const decided = !gesture.vertical && horizontalEnough && (distanceDecision || flickDecision);
    const tapped = !gesture.vertical && Math.abs(gesture.x) <= TAP_DISTANCE && Math.abs(gesture.y) <= TAP_DISTANCE && elapsed <= TAP_MAX_MS;

    event.preventDefault();
    event.stopImmediatePropagation();
    resetDecisionCard(card);

    if (decided) {
      if (gesture.x > 0) likeButton.click(); else skipButton.click();
      return;
    }

    if (tapped) {
      if (scope === "flow" && isDemoFlow()) {
        launchFeedSyncFromDemo();
        return;
      }
      window.dispatchEvent(new CustomEvent("velvet:media-tap", { detail: { scope } }));
    }
  };

  card.addEventListener("pointerup", finish, { capture: true });
  card.addEventListener("pointercancel", event => {
    gestures.delete(event.pointerId);
    resetDecisionCard(card);
    event.stopImmediatePropagation();
  }, { capture: true });
}

guardButton("#likeButton", "flow", "お気に入り");
guardButton("#skipButton", "flow", "スキップ");
guardButton("#sessionLikeButton", "session", "お気に入り");
guardButton("#sessionSkipButton", "session", "スキップ");

bindFastDecisionGesture({
  cardSelector: "#mediaCard",
  likeSelector: "#likeButton",
  skipSelector: "#skipButton",
  showCues: true,
  scope: "flow"
});

bindFastDecisionGesture({
  cardSelector: "#sessionMediaCard",
  likeSelector: "#sessionLikeButton",
  skipSelector: "#sessionSkipButton",
  scope: "session"
});
