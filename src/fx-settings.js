import "./image-guard.js?v=43";
import "./session-cues.js?v=43";

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
  if (mode === "off") return "off";
  if (mode === "high") return "high";
  if (appReduceMotion() || systemReduceMotion()) return "standard-reduced";
  return "standard";
}

function stateLabel(mode = readMode()) {
  const state = effectiveState(mode);
  if (state === "off") return "演出：オフ";
  if (state === "high") return "演出：強";
  if (state === "standard-reduced") return "演出：標準（動きを抑制中）";
  return "演出：標準";
}

function localizeControls() {
  const select = document.querySelector("#fxModeSetting");
  const label = select?.closest("label");
  if (label) {
    const title = label.querySelector("b");
    const note = label.querySelector("small");
    if (title) title.textContent = "演出";
    if (note) note.textContent = "スワイプやボタンの演出強度を選びます。";
  }
  if (select) {
    const labels = { off: "オフ", standard: "標準", high: "強" };
    [...select.options].forEach(option => {
      if (labels[option.value]) option.textContent = labels[option.value];
    });
  }
  const test = document.querySelector("#fxTestButton");
  if (test) test.textContent = "演出テスト";
}

function updateUi() {
  const mode = readMode();
  document.documentElement.dataset.velvetFx = mode;
  const select = document.querySelector("#fxModeSetting");
  const status = document.querySelector("#fxDiagnosticStatus");
  localizeControls();
  if (select) select.value = mode;
  if (status) {
    status.textContent = `${stateLabel(mode)} · 端末の視差軽減 ${systemReduceMotion() ? "ON" : "OFF"}`;
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
  const kind = String(event.detail?.kind || "event").toUpperCase();
  status.textContent = `演出テストOK · ${kind}`;
  clearTimeout(window.__velvetFxStatusTimer);
  window.__velvetFxStatusTimer = setTimeout(updateUi, 1400);
});

new MutationObserver(updateUi).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
updateUi();
