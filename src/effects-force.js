// Velvet v39 — explicit FX runtime using inline styles + Web Animations API.
let layer = null;
let combo = 0;
let lastNavAt = 0;
let comboTimer = null;

function enabled() {
  return window.VelvetFX?.isEnabled?.() ?? true;
}

function signal(kind) {
  window.dispatchEvent(new CustomEvent("velvet:fx-fired", { detail: { kind } }));
}

function ensureLayer() {
  if (layer?.isConnected) return layer;
  layer = document.createElement("div");
  Object.assign(layer.style, {
    position: "fixed", inset: "0", zIndex: "9999", pointerEvents: "none",
    overflow: "hidden", contain: "strict"
  });
  layer.dataset.velvetFxLayer = "v39";
  document.body.append(layer);
  return layer;
}

function centerOf(el) {
  if (!el) return { x: innerWidth / 2, y: innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function color(kind) {
  if (kind === "back") return "#ef8cff";
  if (kind === "like") return "#f1b6ff";
  if (kind === "skip") return "#ff718d";
  return "#63e6ff";
}

function cleanup(node, ms) { setTimeout(() => node?.remove(), ms); }

function flash(kind, power = 1) {
  if (!enabled()) return;
  const host = ensureLayer();
  const node = document.createElement("div");
  const c = color(kind);
  Object.assign(node.style, {
    position: "absolute", inset: "0", opacity: "0", mixBlendMode: "screen",
    background: kind === "next"
      ? `linear-gradient(90deg, ${c}dd 0%, ${c}66 28%, transparent 70%)`
      : kind === "back"
        ? `linear-gradient(270deg, ${c}dd 0%, ${c}66 28%, transparent 70%)`
        : `radial-gradient(circle at 50% 62%, ${c}cc 0%, ${c}55 30%, transparent 72%)`
  });
  host.append(node);
  node.animate([
    { opacity: 0 },
    { opacity: Math.min(1, .72 * power), offset: .16 },
    { opacity: .18, offset: .55 },
    { opacity: 0 }
  ], { duration: 520, easing: "cubic-bezier(.15,.9,.2,1)", fill: "forwards" });
  cleanup(node, 620);
}

function shockwave(kind, x, y, power = 1) {
  if (!enabled()) return;
  const host = ensureLayer();
  const c = color(kind);
  for (let i = 0; i < 3; i += 1) {
    const ring = document.createElement("i");
    Object.assign(ring.style, {
      position: "absolute", left: `${x}px`, top: `${y}px`, width: "36px", height: "36px",
      marginLeft: "-18px", marginTop: "-18px", borderRadius: "50%",
      border: `${2 + i}px solid ${c}`, boxShadow: `0 0 32px ${c}`, opacity: "0"
    });
    host.append(ring);
    ring.animate([
      { transform: "scale(.25)", opacity: 0 },
      { transform: `scale(${2 + i * .5})`, opacity: .95, offset: .16 },
      { transform: `scale(${10 + i * 2.5 * power})`, opacity: 0 }
    ], { duration: 650 + i * 70, delay: i * 55, easing: "cubic-bezier(.08,.75,.18,1)", fill: "forwards" });
    cleanup(ring, 950);
  }
}

function streaks(kind, x, y, dir = 1, power = 1) {
  if (!enabled()) return;
  const host = ensureLayer();
  const c = color(kind);
  const count = Math.min(40, Math.round(22 * power));
  for (let i = 0; i < count; i += 1) {
    const p = document.createElement("i");
    const dy = (Math.random() - .5) * 190;
    const dx = dir * (120 + Math.random() * 270 * power);
    Object.assign(p.style, {
      position: "absolute", left: `${x}px`, top: `${y}px`, width: `${16 + Math.random() * 36}px`,
      height: `${2 + Math.random() * 5}px`, borderRadius: "999px",
      background: i % 4 === 0 ? "#fff" : c, boxShadow: `0 0 18px ${c}`, opacity: "0"
    });
    host.append(p);
    p.animate([
      { transform: "translate(0,0) scaleX(.2)", opacity: 0 },
      { opacity: 1, offset: .12 },
      { transform: `translate(${dx}px,${dy}px) scaleX(1.6)`, opacity: 0 }
    ], { duration: 380 + Math.random() * 260, easing: "cubic-bezier(.12,.76,.18,1)", fill: "forwards" });
    cleanup(p, 760);
  }
}

function hearts(x, y) {
  if (!enabled()) return;
  const host = ensureLayer();
  for (let i = 0; i < 32; i += 1) {
    const h = document.createElement("span");
    h.textContent = "♥";
    const dx = (Math.random() - .5) * 300;
    const dy = -(70 + Math.random() * 240);
    Object.assign(h.style, {
      position: "absolute", left: `${x}px`, top: `${y}px`, fontSize: `${15 + Math.random() * 24}px`,
      color: i % 3 === 0 ? "#fff" : color("like"), textShadow: "0 0 20px #e7a8ff", opacity: "0"
    });
    host.append(h);
    h.animate([
      { transform: "translate(-50%,-50%) scale(.2)", opacity: 0 },
      { opacity: 1, offset: .1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${.8 + Math.random() * 1.4}) rotate(${(Math.random() - .5) * 120}deg)`, opacity: 0 }
    ], { duration: 560 + Math.random() * 300, easing: "cubic-bezier(.12,.8,.18,1)", fill: "forwards" });
    cleanup(h, 980);
  }
}

function cardKick(scope, direction) {
  if (!enabled()) return;
  const card = document.querySelector(scope === "session" ? "#sessionMediaCard" : "#mediaCard");
  const shell = document.querySelector("#mainExperience");
  const sign = direction === "next" ? 1 : -1;
  card?.animate([
    { transform: `translateX(${sign * 52}px) scale(.93) rotate(${sign * 2.6}deg)`, filter: "brightness(1.5) saturate(1.3) blur(3px)" },
    { transform: `translateX(${-sign * 11}px) scale(1.03) rotate(${-sign * .5}deg)`, filter: "brightness(1.15)", offset: .62 },
    { transform: "translateX(0) scale(1)", filter: "none" }
  ], { duration: 430, easing: "cubic-bezier(.12,.9,.18,1)" });
  shell?.animate([
    { transform: "translateX(0)" },
    { transform: `translateX(${-sign * 8}px)`, offset: .25 },
    { transform: `translateX(${sign * 4}px)`, offset: .58 },
    { transform: "translateX(0)" }
  ], { duration: 300, easing: "ease-out" });
}

function comboPulse() {
  const now = performance.now();
  combo = now - lastNavAt < 760 ? Math.min(6, combo + 1) : 1;
  lastNavAt = now;
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => { combo = 0; }, 1150);
  if (!enabled() || combo < 2) return;
  const host = ensureLayer();
  const badge = document.createElement("div");
  badge.textContent = `FLOW ×${combo}`;
  Object.assign(badge.style, {
    position: "absolute", left: "50%", top: "14%", transform: "translateX(-50%)",
    padding: "9px 15px", borderRadius: "999px", color: "#fff", font: "900 19px -apple-system,sans-serif",
    letterSpacing: ".08em", background: "rgba(10,14,22,.72)", border: "1px solid rgba(255,255,255,.35)",
    boxShadow: "0 0 38px rgba(99,230,255,.48)", backdropFilter: "blur(10px)", opacity: "0"
  });
  host.append(badge);
  badge.animate([
    { transform: "translateX(-50%) scale(.5)", opacity: 0 },
    { transform: "translateX(-50%) scale(1.22)", opacity: 1, offset: .3 },
    { transform: "translateX(-50%) scale(1)", opacity: 1, offset: .68 },
    { transform: "translateX(-50%) scale(.92)", opacity: 0 }
  ], { duration: 650, easing: "cubic-bezier(.15,.92,.2,1)", fill: "forwards" });
  cleanup(badge, 760);
}

function navigation(scope, direction) {
  if (!enabled()) return;
  comboPulse();
  signal(direction);
  const card = document.querySelector(scope === "session" ? "#sessionMediaCard" : "#mediaCard");
  const origin = centerOf(card);
  const power = 1 + Math.max(0, combo - 1) * .14;
  flash(direction, power);
  shockwave(direction, origin.x, origin.y, power);
  streaks(direction, direction === "next" ? innerWidth * .84 : innerWidth * .16, origin.y, direction === "next" ? -1 : 1, power);
  cardKick(scope, direction);
}

function reaction(kind, button) {
  if (!enabled()) return;
  signal(kind);
  const origin = centerOf(button);
  flash(kind, kind === "like" ? 1.35 : 1.1);
  shockwave(kind, origin.x, origin.y, kind === "like" ? 1.35 : 1.05);
  if (kind === "like") hearts(origin.x, origin.y);
  else streaks(kind, origin.x, origin.y, -1, 1.1);
  button?.animate([
    { transform: "scale(1)" },
    { transform: kind === "like" ? "scale(1.3) rotate(-6deg)" : "scale(.76) rotate(10deg)", offset: .35 },
    { transform: "scale(1)" }
  ], { duration: 430, easing: "cubic-bezier(.2,1.25,.2,1)" });
}

window.addEventListener("velvet:flow-next", () => navigation("flow", "next"));
window.addEventListener("velvet:flow-back", () => navigation("flow", "back"));
window.addEventListener("velvet:session-next", () => navigation("session", "next"));
window.addEventListener("velvet:session-back", () => navigation("session", "back"));
window.addEventListener("velvet:flow-feedback", event => {
  if (event.detail?.reaction === "like") reaction("like", document.querySelector("#likeButton"));
  if (event.detail?.reaction === "skip") reaction("skip", document.querySelector("#skipButton"));
});
for (const [selector, kind] of [["#sessionLikeButton", "like"], ["#sessionSkipButton", "skip"]]) {
  document.querySelector(selector)?.addEventListener("click", () => reaction(kind, document.querySelector(selector)));
}
window.addEventListener("velvet:fx-test", () => {
  if (!enabled()) {
    window.dispatchEvent(new CustomEvent("velvet:fx-fired", { detail: { kind: "blocked" } }));
    return;
  }
  signal("test");
  const x = innerWidth / 2;
  const y = innerHeight * .46;
  flash("like", 1.5);
  shockwave("like", x, y, 1.5);
  hearts(x, y);
  streaks("next", innerWidth * .15, y, 1, 1.35);
  streaks("back", innerWidth * .85, y, -1, 1.35);
});
