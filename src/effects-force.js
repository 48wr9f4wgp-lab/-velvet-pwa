// Velvet v39 — inline/WAAPI effects fallback.
// This path intentionally avoids external CSS animation dependencies so effects remain visible on iOS.
const FX_VERSION = "v39";
let layer = null;
let combo = 0;
let lastNavAt = 0;
let comboTimer = null;

function reduced() {
  // Respect Velvet's explicit in-app setting only. System Reduce Motion must not silently disable
  // effects when the user has asked Velvet to keep them enabled.
  return document.documentElement.classList.contains("reduced-motion");
}

function ensureLayer() {
  if (layer?.isConnected) return layer;
  layer = document.createElement("div");
  layer.className = "velvet-force-fx";
  layer.dataset.version = FX_VERSION;
  Object.assign(layer.style, {
    position: "fixed",
    inset: "0",
    zIndex: "980",
    pointerEvents: "none",
    overflow: "hidden",
    contain: "strict"
  });
  document.body.append(layer);
  return layer;
}

function cleanup(node, ms = 900) {
  setTimeout(() => node?.remove(), ms);
}

function centerOf(el) {
  if (!el) return { x: innerWidth / 2, y: innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function colorFor(kind) {
  if (kind === "back") return "#ef8cff";
  if (kind === "like") return "#e8b5ff";
  if (kind === "skip") return "#ff718d";
  return "#63e6ff";
}

function flash(kind, power = 1) {
  if (reduced()) return;
  const host = ensureLayer();
  const node = document.createElement("div");
  const c = colorFor(kind);
  const fromLeft = kind === "next";
  Object.assign(node.style, {
    position: "absolute",
    inset: "0",
    background: kind === "like" || kind === "skip"
      ? `radial-gradient(circle at 50% 66%, ${c}99 0%, ${c}35 28%, transparent 68%)`
      : `linear-gradient(${fromLeft ? "90deg" : "270deg"}, ${c}b8 0%, ${c}4d 24%, transparent 62%)`,
    opacity: "0",
    mixBlendMode: "screen"
  });
  host.append(node);
  node.animate([
    { opacity: 0 },
    { opacity: Math.min(.92, .60 * power), offset: .18 },
    { opacity: .16, offset: .55 },
    { opacity: 0 }
  ], { duration: 520, easing: "cubic-bezier(.18,.9,.2,1)", fill: "forwards" });
  cleanup(node, 620);
}

function shockwave(kind, x, y, power = 1) {
  if (reduced()) return;
  const host = ensureLayer();
  const c = colorFor(kind);
  for (let i = 0; i < 3; i += 1) {
    const ring = document.createElement("div");
    Object.assign(ring.style, {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      width: "34px",
      height: "34px",
      marginLeft: "-17px",
      marginTop: "-17px",
      borderRadius: "999px",
      border: `${2 + i}px solid ${c}`,
      boxShadow: `0 0 28px ${c}`,
      opacity: "0"
    });
    host.append(ring);
    ring.animate([
      { transform: "scale(.35)", opacity: 0 },
      { transform: `scale(${1.8 + i * .45})`, opacity: .95, offset: .15 },
      { transform: `scale(${9 + i * 2.2 * power})`, opacity: 0 }
    ], { duration: 610 + i * 80, delay: i * 55, easing: "cubic-bezier(.08,.72,.2,1)", fill: "forwards" });
    cleanup(ring, 900);
  }
}

function streaks(kind, x, y, direction = 1, power = 1) {
  if (reduced()) return;
  const host = ensureLayer();
  const c = colorFor(kind);
  const count = Math.min(34, Math.round(18 * power));
  for (let i = 0; i < count; i += 1) {
    const p = document.createElement("i");
    const angle = (Math.random() - .5) * 1.55;
    const distance = 90 + Math.random() * 230 * power;
    const dx = Math.cos(angle) * distance * direction;
    const dy = Math.sin(angle) * distance;
    const width = 14 + Math.random() * 34;
    Object.assign(p.style, {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${2 + Math.random() * 4}px`,
      marginTop: "-2px",
      borderRadius: "999px",
      background: i % 4 === 0 ? "#fff" : c,
      boxShadow: `0 0 18px ${c}`,
      opacity: "0",
      transformOrigin: "left center"
    });
    host.append(p);
    p.animate([
      { transform: `translate(0,0) scaleX(.2) rotate(${angle}rad)`, opacity: 0 },
      { opacity: 1, offset: .12 },
      { transform: `translate(${dx}px,${dy}px) scaleX(1.7) rotate(${angle}rad)`, opacity: 0 }
    ], { duration: 360 + Math.random() * 260, easing: "cubic-bezier(.12,.76,.18,1)", fill: "forwards" });
    cleanup(p, 760);
  }
}

function heartBurst(x, y) {
  if (reduced()) return;
  const host = ensureLayer();
  for (let i = 0; i < 28; i += 1) {
    const h = document.createElement("span");
    h.textContent = "♥";
    const dx = (Math.random() - .5) * 260;
    const dy = -(55 + Math.random() * 220);
    Object.assign(h.style, {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      fontSize: `${14 + Math.random() * 22}px`,
      color: i % 3 === 0 ? "#fff" : colorFor("like"),
      textShadow: "0 0 18px #d79cff",
      opacity: "0"
    });
    host.append(h);
    h.animate([
      { transform: "translate(-50%,-50%) scale(.2) rotate(0deg)", opacity: 0 },
      { opacity: 1, offset: .1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${.8 + Math.random() * 1.3}) rotate(${(Math.random() - .5) * 120}deg)`, opacity: 0 }
    ], { duration: 520 + Math.random() * 320, easing: "cubic-bezier(.12,.78,.18,1)", fill: "forwards" });
    cleanup(h, 980);
  }
}

function popCombo() {
  if (reduced()) return;
  const now = performance.now();
  combo = now - lastNavAt < 780 ? Math.min(combo + 1, 6) : 1;
  lastNavAt = now;
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => { combo = 0; }, 1150);
  if (combo < 2) return;

  const host = ensureLayer();
  const badge = document.createElement("div");
  badge.textContent = `FLOW ×${combo}`;
  Object.assign(badge.style, {
    position: "absolute",
    left: "50%",
    top: "16%",
    transform: "translateX(-50%)",
    padding: "8px 14px",
    borderRadius: "999px",
    color: "#fff",
    font: "900 18px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
    letterSpacing: ".08em",
    background: "rgba(12,16,24,.62)",
    border: "1px solid rgba(255,255,255,.34)",
    boxShadow: "0 0 34px rgba(102,231,255,.38)",
    backdropFilter: "blur(8px)",
    opacity: "0"
  });
  host.append(badge);
  badge.animate([
    { transform: "translateX(-50%) scale(.55)", opacity: 0 },
    { transform: "translateX(-50%) scale(1.18)", opacity: 1, offset: .3 },
    { transform: "translateX(-50%) scale(1)", opacity: 1, offset: .65 },
    { transform: "translateX(-50%) scale(.92)", opacity: 0 }
  ], { duration: 620, easing: "cubic-bezier(.15,.92,.2,1)", fill: "forwards" });
  cleanup(badge, 720);
}

function cardImpact(scope, direction) {
  if (reduced()) return;
  const card = document.querySelector(scope === "session" ? "#sessionMediaCard" : "#mediaCard");
  if (!card) return;
  const sign = direction === "next" ? 1 : -1;
  card.animate([
    { transform: `translateX(${sign * 42}px) scale(.94) rotate(${sign * 2.2}deg)`, filter: "brightness(1.4) saturate(1.25) blur(2px)" },
    { transform: `translateX(${-sign * 10}px) scale(1.025) rotate(${-sign * .45}deg)`, filter: "brightness(1.12) saturate(1.1)", offset: .62 },
    { transform: "translateX(0) scale(1) rotate(0)", filter: "none" }
  ], { duration: 430, easing: "cubic-bezier(.12,.9,.18,1)", fill: "none" });
  const shell = document.querySelector("#mainExperience");
  shell?.animate([
    { transform: "translateX(0)" },
    { transform: `translateX(${-sign * 7}px)`, offset: .23 },
    { transform: `translateX(${sign * 3}px)`, offset: .52 },
    { transform: "translateX(0)" }
  ], { duration: 280, easing: "ease-out" });
}

function navigation(scope, direction) {
  if (reduced()) return;
  popCombo();
  const card = document.querySelector(scope === "session" ? "#sessionMediaCard" : "#mediaCard");
  const origin = centerOf(card);
  const power = 1 + Math.max(0, combo - 1) * .13;
  flash(direction, power);
  shockwave(direction, origin.x, origin.y, power);
  streaks(direction, direction === "next" ? innerWidth * .82 : innerWidth * .18, origin.y, direction === "next" ? -1 : 1, power);
  cardImpact(scope, direction);
}

function reaction(kind, button) {
  if (reduced()) return;
  const origin = centerOf(button);
  flash(kind, kind === "like" ? 1.35 : 1.1);
  shockwave(kind, origin.x, origin.y, kind === "like" ? 1.35 : 1.05);
  if (kind === "like") heartBurst(origin.x, origin.y);
  else streaks(kind, origin.x, origin.y, -1, 1.05);
  button?.animate([
    { transform: "scale(1)" },
    { transform: kind === "like" ? "scale(1.28) rotate(-6deg)" : "scale(.78) rotate(10deg)", offset: .35 },
    { transform: "scale(1)" }
  ], { duration: 420, easing: "cubic-bezier(.2,1.25,.2,1)" });
}

window.addEventListener("velvet:flow-next", () => navigation("flow", "next"));
window.addEventListener("velvet:flow-back", () => navigation("flow", "back"));
window.addEventListener("velvet:session-next", () => navigation("session", "next"));
window.addEventListener("velvet:session-back", () => navigation("session", "back"));

window.addEventListener("velvet:flow-feedback", event => {
  const kind = event.detail?.reaction;
  if (kind === "like") reaction("like", document.querySelector("#likeButton"));
  if (kind === "skip") reaction("skip", document.querySelector("#skipButton"));
});

for (const [selector, kind] of [["#sessionLikeButton", "like"], ["#sessionSkipButton", "skip"]]) {
  document.querySelector(selector)?.addEventListener("click", () => reaction(kind, document.querySelector(selector)));
}

window.addEventListener("visibilitychange", () => {
  if (document.hidden && layer) layer.replaceChildren();
});
