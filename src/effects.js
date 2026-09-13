const FX_STYLESHEET = "./effects.css?v=37";

if (!document.querySelector('link[data-velvet-effects]')) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = FX_STYLESHEET;
  link.dataset.velvetEffects = "1";
  document.head.append(link);
}

let layer = null;
let flashNode = null;
let pendingFlowDirection = null;
let pendingSessionDirection = null;
let clearGestureTimer = null;

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
  flashNode = document.createElement("div");
  flashNode.className = "velvet-fx-flash";
  layer.append(edge, flashNode);
  document.body.append(layer);
  return layer;
}

function centerOf(element, fallbackX = innerWidth / 2, fallbackY = innerHeight * 0.76) {
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

function flash(kind) {
  if (reducedMotion()) return;
  ensureLayer();
  flashNode.className = "velvet-fx-flash";
  void flashNode.offsetWidth;
  flashNode.classList.add(`is-${kind}`);
  setTimeout(() => {
    if (flashNode) flashNode.className = "velvet-fx-flash";
  }, 460);
}

function palette(kind, index) {
  const sets = {
    next: ["#65e7ff", "#a8f5ff", "#ffffff"],
    back: ["#f29cff", "#d8b4fe", "#ffffff"],
    like: ["#f3c4ff", "#e9d5ff", "#ffffff", "#c084fc"],
    skip: ["#fb7185", "#fda4af", "#ffffff"]
  };
  const set = sets[kind] || sets.next;
  return set[index % set.length];
}

function burst({ x, y, kind, count = 16, directional = 0, hearts = false }) {
  if (reducedMotion()) return;
  const fx = ensureLayer();
  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement("i");
    const angle = hearts
      ? (-Math.PI * .9 + Math.random() * Math.PI * .8)
      : (Math.random() * Math.PI * 2);
    const distance = hearts ? 48 + Math.random() * 115 : 55 + Math.random() * 150;
    const dx = Math.cos(angle) * distance + directional * (40 + Math.random() * 90);
    const dy = Math.sin(angle) * distance - (hearts ? 30 + Math.random() * 65 : 0);
    const size = hearts ? 12 + Math.random() * 18 : 3 + Math.random() * 7;
    const duration = 360 + Math.random() * 320;

    particle.className = "velvet-fx-particle";
    if (!hearts && index % 3 === 0) particle.classList.add("is-streak");
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
    particle.style.setProperty("--rot", `${-140 + Math.random() * 280}deg`);
    particle.style.setProperty("--scale", String(.7 + Math.random() * 1.15));
    fx.append(particle);
    setTimeout(() => particle.remove(), duration + 80);
  }
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
  document.querySelectorAll(".fx-nav-pull-next, .fx-nav-pull-back").forEach(card => {
    card.classList.remove("fx-nav-pull-next", "fx-nav-pull-back");
  });
}

function navigationImpact(scope, direction) {
  clearGesture();
  if (scope === "flow") pendingFlowDirection = direction;
  else pendingSessionDirection = direction;
  flash(direction);
  const x = direction === "next" ? innerWidth * .22 : innerWidth * .78;
  burst({
    x,
    y: innerHeight * .46,
    kind: direction,
    count: 18,
    directional: direction === "next" ? -1 : 1
  });
}

function enterCard(card, direction) {
  if (!direction || !card || reducedMotion()) return;
  restartClass(card, direction === "next" ? "fx-enter-next" : "fx-enter-back", 430);
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
    flash("like");
    restartClass(button, "fx-impact");
    burst({ ...origin, kind: "like", count: 24, hearts: true });
  } else if (reaction === "skip") {
    const button = document.querySelector("#skipButton");
    const origin = centerOf(button);
    flash("skip");
    restartClass(button, "fx-impact", 380);
    burst({ ...origin, kind: "skip", count: 14, directional: -0.25 });
  }
});

for (const [selector, kind] of [["#sessionLikeButton", "like"], ["#sessionSkipButton", "skip"]]) {
  document.querySelector(selector)?.addEventListener("click", () => {
    if (reducedMotion()) return;
    const button = document.querySelector(selector);
    const origin = centerOf(button);
    flash(kind);
    restartClass(button, "fx-impact");
    burst({ ...origin, kind, count: kind === "like" ? 20 : 12, hearts: kind === "like" });
  });
}
