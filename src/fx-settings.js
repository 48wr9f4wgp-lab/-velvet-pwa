// Velvet FX control + diagnostic surface v39
const KEY = "velvet_fx_mode_v1";
const VALID = new Set(["off", "standard", "high"]);

function readMode() {
  try {
    const raw = localStorage.getItem(KEY);
    return VALID.has(raw) ? raw : "high";
  } catch (_) {
    return "high";
  }
}

function writeMode(mode) {
  const next = VALID.has(mode) ? mode : "high";
  try { localStorage.setItem(KEY, next); } catch (_) {}
  document.documentElement.dataset.velvetFx = next;
  window.dispatchEvent(new CustomEvent("velvet:fx-mode-change", { detail: { mode: next } }));
  return next;
}

function systemReduceMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function appReduceMotion() {
  return document.documentElement.classList.contains("reduced-motion");
}

function effectiveState(mode = readMode()) {
  if (mode === "off") return "OFF";
  if (mode === "high") return "HIGH / FORCE";
  if (appReduceMotion() || systemReduceMotion()) return "STANDARD / REDUCED";
  return "STANDARD / READY";
}

function updateUi() {
  const mode = readMode();
  document.documentElement.dataset.velvetFx = mode;
  const select = document.querySelector("#fxModeSetting");
  const status = document.querySelector("#fxDiagnosticStatus");
  const badge = document.querySelector("#fxLiveBadge");
  if (select) select.value = mode;
  const text = `FX ${effectiveState(mode)} · iOS視差 ${systemReduceMotion() ? "ON" : "OFF"} · Velvet低モーション ${appReduceMotion() ? "ON" : "OFF"}`;
  if (status) status.textContent = text;
  if (badge) {
    badge.textContent = mode === "off" ? "FX OFF" : mode === "high" ? "FX HIGH" : "FX STD";
    badge.dataset.mode = mode;
  }
}

window.VelvetFX = {
  getMode: readMode,
  setMode: writeMode,
  isEnabled() {
    const mode = readMode();
    if (mode === "off") return false;
    if (mode === "high") return true;
    return !appReduceMotion() && !systemReduceMotion();
  },
  effectiveState
};

const select = document.querySelector("#fxModeSetting");
select?.addEventListener("change", () => {
  writeMode(select.value);
  updateUi();
});

document.querySelector("#fxTestButton")?.addEventListener("click", event => {
  event.preventDefault();
  window.dispatchEvent(new CustomEvent("velvet:fx-test"));
});

window.matchMedia?.("(prefers-reduced-motion: reduce)")?.addEventListener?.("change", updateUi);
window.addEventListener("velvet:fx-mode-change", updateUi);
window.addEventListener("velvet:fx-fired", event => {
  const status = document.querySelector("#fxDiagnosticStatus");
  if (!status) return;
  const kind = event.detail?.kind || "event";
  status.textContent = `FX FIRED: ${kind.toUpperCase()} · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  clearTimeout(window.__velvetFxStatusTimer);
  window.__velvetFxStatusTimer = setTimeout(updateUi, 1600);
});

new MutationObserver(updateUi).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
updateUi();
