import "./ui-ja.js?v=38";
import "./flow-feedback.js?v=38";
import "./feed-bridge.js?v=38";
import "./media-viewer.js?v=38";
import "./effects.js?v=38";
import "./effects-force.js?v=39";

const UX_STYLESHEET = "./flow-ux.css";
if (!document.querySelector('link[data-velvet-flow-ux]')) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = UX_STYLESHEET;
  link.dataset.velvetFlowUx = "1";
  document.head.append(link);
}

const LOCK_MS = 180;
const NAV_DISTANCE = 52;
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

function resetNavigationCard(card) {
  card.style.transform = "";
  card.style.opacity = "";
  document.querySelector("#dragLike")?.style.setProperty("opacity", "0");
  document.querySelector("#dragSkip")?.style.setProperty("opacity", "0");
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

function bindFastNavigationGesture({ cardSelector, showCues = false, scope = "flow" }) {
  const card = document.querySelector(cardSelector);
  if (!card) return;
  const gestures = new Map();

  card.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    gestures.set(event.pointerId, { startX: event.clientX, startY: event.clientY, x: 0, y: 0, startedAt: now(), vertical: false });
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
    if (!gesture.vertical && Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) * 1.35) gesture.vertical = true;
    if (!gesture.vertical) {
      event.preventDefault();
      const pct = Math.max(-1, Math.min(1, dx / NAV_DISTANCE));
      card.style.transform = "translateX(" + (dx * 0.78) + "px) rotate(" + (pct * 4.5) + "deg) scale(" + (1 - Math.min(.035, Math.abs(pct) * .025)) + ")";
      if (showCues) {
        document.querySelector("#dragLike")?.style.setProperty("opacity", String(Math.max(0, Math.min(1, pct * 1.15))));
        document.querySelector("#dragSkip")?.style.setProperty("opacity", String(Math.max(0, Math.min(1, -pct * 1.15))));
      }
      window.dispatchEvent(new CustomEvent("velvet:gesture-progress", {
        detail: { scope, dx, dy, pct }
      }));
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
    const distanceNavigation = Math.abs(gesture.x) >= NAV_DISTANCE;
    const flickNavigation = Math.abs(gesture.x) >= FLICK_DISTANCE && Math.abs(velocity) >= FLICK_VELOCITY;
    const navigated = !gesture.vertical && horizontalEnough && (distanceNavigation || flickNavigation);
    const tapped = !gesture.vertical && Math.abs(gesture.x) <= TAP_DISTANCE && Math.abs(gesture.y) <= TAP_DISTANCE && elapsed <= TAP_MAX_MS;
    event.preventDefault();
    event.stopImmediatePropagation();
    resetNavigationCard(card);
    window.dispatchEvent(new CustomEvent("velvet:gesture-end", { detail: { scope } }));
    if (navigated) {
      const direction = gesture.x > 0 ? "back" : "next";
      window.dispatchEvent(new CustomEvent("velvet:" + scope + "-" + direction));
      return;
    }
    if (tapped) window.dispatchEvent(new CustomEvent("velvet:media-tap", { detail: { scope } }));
  };

  card.addEventListener("pointerup", finish, { capture: true });
  card.addEventListener("pointercancel", event => {
    gestures.delete(event.pointerId);
    resetNavigationCard(card);
    window.dispatchEvent(new CustomEvent("velvet:gesture-end", { detail: { scope } }));
    event.stopImmediatePropagation();
  }, { capture: true });
}

guardButton("#likeButton", "flow", "お気に入り");
guardButton("#skipButton", "flow", "スキップ");
guardButton("#sessionLikeButton", "session", "お気に入り");
guardButton("#sessionSkipButton", "session", "スキップ");

const backCue = document.querySelector("#dragLike");
const nextCue = document.querySelector("#dragSkip");
if (backCue) backCue.textContent = "戻る";
if (nextCue) nextCue.textContent = "進む";

bindFastNavigationGesture({ cardSelector: "#mediaCard", showCues: true, scope: "flow" });
bindFastNavigationGesture({ cardSelector: "#sessionMediaCard", scope: "session" });
