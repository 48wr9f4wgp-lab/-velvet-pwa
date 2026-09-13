const FX_STYLESHEET = "./effects.css?v=38";

if (!document.querySelector('link[data-velvet-effects]')) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = FX_STYLESHEET;
  link.dataset.velvetEffects = "1";
  document.head.append(link);
}

let layer = null;
let flashNode = null;
let vignetteNode = null;
let comboNode = null;
let pendingFlowDirection = null;
let pendingSessionDirection = null;
let clearGestureTimer = null;
let comboResetTimer = null;
let comboCount = 0;
let lastNavigationAt = 0;

function reducedMotion() {
  return document.documentElement.classList.contains("reduced-motion") ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function ensureLayer() {
  if (layer?.isConnected) return layer;
  layer = document.createElement("div");
  layer.className = "velvet-fx-layer";
  layer.setAttribute("aria-hidden", "true");

  const edge = document.createElement("div");
  edge.className = "velvet-fx-edge";
  vignetteNode = document.createElement("div");
  vignetteNode.className = "velvet-fx-vignette";
  flashNode = document.createElement("div");
  flashNode.className = "velvet-fx-flash";
  comboNode = document.createElement("div");
  comboNode.className = "velvet-fx-combo";
  layer.append(edge, vignetteNode, flashNode, comboNode);
  document.body.append(layer);
  return layer;
}

function centerOf(element, fallbackX = innerWidth / 2, fallbackY = innerHeight * 0.5) {
  if (!element) return { x: fallbackX, y: fallbackY };
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function restartClass(element, className, timeout = 520) {
  if (!element || reducedMotion()) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), timeout);
}

function flash(kind, power = 1) {
  if (reducedMotion()) return;
  ensureLayer();
  flashNode.style.setProperty("--fx-power", String(Math.min(1.45, power)));
  flashNode.className = "velvet-fx-flash";
  void flashNode.offsetWidth;
  flashNode.classList.add(`is-${kind}`);
  vignetteNode.className = "velvet-fx-vignette";
  void vignetteNode.offsetWidth;
  vignetteNode.classList.add(`is-${kind}`);
  setTimeout(() => {
    if (flashNode) flashNode.className = "velvet-fx-flash";
    if (vignetteNode) vignetteNode.className = "velvet-fx-vignette";
  }, 520);
}

function palette(kind, index) {
  const sets = {
    next: ["#65e7ff", "#a8f5ff", "#ffffff", "#67e8f9"],
    back: ["#f29cff", "#d8b4fe", "#ffffff", "#e879f9"],
    like: ["#f3c4ff", "#e9d5ff", "#ffffff", "#c084fc", "#f0abfc"],
    skip: ["#fb7185", "#fda4af", "#ffffff", "#fecdd3"]
  };
  const set = sets[kind] || sets.next;
  return set[index % set.length];
}

function burst({ x, y, kind, count = 16, directional = 0, hearts = false, power = 1 }) {
  if (reducedMotion()) return;
  const fx = ensureLayer();
  const safeCount = Math.min(46, Math.round(count * Math.min(1.35, power)));
  for (let index = 0; index < safeCount; index += 1) {
    const particle = document.createElement("i");
    const angle = hearts
      ? (-Math.PI * .9 + Math.random() * Math.PI * .8)
      : (Math.random() * Math.PI * 2);
    const distance = (hearts ? 55 + Math.random() * 140 : 65 + Math.random() * 185) * Math.min(1.25, power);
    const dx = Math.cos(angle) * distance + directional * (50 + Math.random() * 115);
    const dy = Math.sin(angle) * distance - (hearts ? 35 + Math.random() * 80 : 0);
    const size = hearts ? 13 + Math.random() * 20 : 3 + Math.random() * 8;
    const duration = 380 + Math.random() * 360;

    particle.className = "velvet-fx-particle";
    if (!hearts && index % 3 === 0) particle.classList.add("is-streak");
    if (!hearts && index % 7 === 0) particle.classList.add("is-spark");
    if (hearts && index % 2 === 0) {
      particle.classList.add("is-heart");
      particle.textContent = "♥";
    }
    particle.style.color = palette(kind, index);
    particle.style.setProperty("--x", `${x}px`);
    particle.style.setProperty("--y", `${y}px`);
    particle.style.setProperty("--dx", `${dx}px`);
    particle.style.setProperty("--dy", `${dy}px`);
    particle.style.setProperty("--size", `${size}px`);
    particle.style.setProperty("--dur", `${duration}ms`);
    particle.style.setProperty("--rot", `${-180 + Math.random() * 360}deg`);
    particle.style.setProperty("--scale", String(.72 + Math.random() * 1.35));
    fx.append(particle);
    setTimeout(() => particle.remove(), duration + 100);
  }
}

function shockwave({ x, y, kind, power = 1, count = 2 }) {
  if (reducedMotion()) return;
  const fx = ensureLayer();
  for (let index = 0; index < count; index += 1) {
    const ring = document.createElement("i");
    ring.className = "velvet-fx-shockwave";
    ring.style.color = palette(kind, index);
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.style.setProperty("--delay", `${index * 70}ms`);
    ring.style.setProperty("--power", String(power));
    fx.append(ring);
    setTimeout(() => ring.remove(), 700 + index * 80);
  }
}

function ghostTrail(card, direction, power = 1) {
  if (!card || reducedMotion()) return;
  const fx = ensureLayer();
  const rect = card.getBoundingClientRect();
  const count = power > 1.2 ? 3 : 2;
  for (let index = 0; index < count; index += 1) {
    const ghost = document.createElement("i");
    ghost.className = `velvet-fx-ghost is-${direction}`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.setProperty("--ghost-index", String(index));
    ghost.style.setProperty("--ghost-power", String(power));
    fx.append(ghost);
    setTimeout(() => ghost.remove(), 620);
  }
}

function kickShell(kind) {
  if (reducedMotion()) return;
  const experience = document.querySelector("#mainExperience");
  if (!experience) return;
  restartClass(experience, `fx-shell-${kind}`, 420);
}

function updateCombo() {
  const now = performance.now();
  comboCount = now - lastNavigationAt < 720 ? Math.min(5, comboCount + 1) : 1;
  lastNavigationAt = now;
  clearTimeout(comboResetTimer);
  comboResetTimer = setTimeout(() => {
    comboCount = 0;
    if (comboNode) comboNode.classList.remove("is-visible");
  }, 980);

  if (comboCount < 2 || reducedMotion()) return comboCount;
  ensureLayer();
  comboNode.textContent = `FLOW ×${comboCount}`;
  comboNode.classList.remove("is-visible", "is-pop");
  void comboNode.offsetWidth;
  comboNode.classList.add("is-visible", "is-pop");
  return comboCount;
}

function setGesture(detail = {}) {
  if (reducedMotion()) return;
  const fx = ensureLayer();
  const card = document.querySelector(detail.scope === "session" ? "#sessionMediaCard" : "#mediaCard");
  const dx = Number(detail.dx) || 0;
  const strength = Math.min(1, Math.abs(dx) / 90);
  const direction = dx < 0 ? "next" : "back";
  fx.dataset.gesture = direction;
  fx.style.setProperty("--velvet-fx-strength", String(Math.max(.15, strength)));
  fx.style.setProperty("--velvet-fx-shift", `${Math.max(-22, Math.min(22, dx * .11))}px`);
  card?.classList.toggle("fx-nav-pull-next", direction === "next");
  card?.classList.toggle("fx-nav-pull-back", direction === "back");
  clearTimeout(clearGestureTimer);
  clearGestureTimer = setTimeout(clearGesture, 220);
}

function clearGesture() {
  clearTimeout(clearGestureTimer);
  const fx = ensureLayer();
  delete fx.dataset.gesture;
  fx.style.removeProperty("--velvet-fx-strength");
  fx.style.removeProperty("--velvet-fx-shift");
  document.querySelectorAll(".fx-nav-pull-next, .fx-nav-pull-back").forEach(card => {
    card.classList.remove("fx-nav-pull-next", "fx-nav-pull-back");
  });
}

function navigationImpact(scope, direction) {
  clearGesture();
  if (scope === "flow") pendingFlowDirection = direction;
  else pendingSessionDirection = direction;
  const combo = updateCombo();
  const power = 1 + Math.max(0, combo - 1) * .12;
  const card = document.querySelector(scope === "session" ? "#sessionMediaCard" : "#mediaCard");
  const origin = centerOf(card);
  flash(direction, power);
  kickShell(direction);
  ghostTrail(card, direction, power);
  shockwave({ ...origin, kind: direction, power, count: combo >= 3 ? 3 : 2 });
  const x = direction === "next" ? innerWidth * .18 : innerWidth * .82;
  burst({
    x,
    y: origin.y,
    kind: direction,
    count: 22 + combo * 3,
    directional: direction === "next" ? -1 : 1,
    power
  });
}

function enterCard(card, direction) {
  if (!direction || !card || reducedMotion()) return;
  restartClass(card, direction === "next" ? "fx-enter-next" : "fx-enter-back", 500);
  restartClass(card, "fx-card-settle", 560);
}

window.addEventListener("velvet:gesture-progress", event => setGesture(event.detail));
window.addEventListener("velvet:gesture-end", clearGesture);

window.addEventListener("velvet:flow-next", () => navigationImpact("flow", "next"));
window.addEventListener("velvet:flow-back", () => navigationImpact("flow", "back"));
window.addEventListener("velvet:session-next", () => navigationImpact("session", "next"));
window.addEventListener("velvet:session-back", () => navigationImpact("session", "back"));

window.addEventListener("velvet:flow-item", () => {
  if (!pendingFlowDirection) return;
  const direction = pendingFlowDirection;
  pendingFlowDirection = null;
  requestAnimationFrame(() => enterCard(document.querySelector("#mediaCard"), direction));
});

window.addEventListener("velvet:session-item", () => {
  if (!pendingSessionDirection) return;
  const direction = pendingSessionDirection;
  pendingSessionDirection = null;
  requestAnimationFrame(() => enterCard(document.querySelector("#sessionMediaCard"), direction));
});

window.addEventListener("velvet:flow-feedback", event => {
  const reaction = event.detail?.reaction;
  if (reaction === "like") {
    const button = document.querySelector("#likeButton");
    const origin = centerOf(button);
    flash("like", 1.22);
    kickShell("like");
    restartClass(button, "fx-impact", 560);
    shockwave({ ...origin, kind: "like", power: 1.18, count: 3 });
    burst({ ...origin, kind: "like", count: 34, hearts: true, power: 1.18 });
  } else if (reaction === "skip") {
    const button = document.querySelector("#skipButton");
    const origin = centerOf(button);
    flash("skip", 1.05);
    kickShell("skip");
    restartClass(button, "fx-impact", 430);
    shockwave({ ...origin, kind: "skip", power: .95, count: 2 });
    burst({ ...origin, kind: "skip", count: 20, directional: -0.35, power: 1.02 });
  }
});

for (const [selector, kind] of [["#sessionLikeButton", "like"], ["#sessionSkipButton", "skip"]]) {
  document.querySelector(selector)?.addEventListener("click", () => {
    if (reducedMotion()) return;
    const button = document.querySelector(selector);
    const origin = centerOf(button);
    flash(kind, kind === "like" ? 1.18 : 1);
    kickShell(kind);
    restartClass(button, "fx-impact");
    shockwave({ ...origin, kind, power: 1, count: kind === "like" ? 3 : 2 });
    burst({ ...origin, kind, count: kind === "like" ? 30 : 18, hearts: kind === "like", power: 1.1 });
  });
}
