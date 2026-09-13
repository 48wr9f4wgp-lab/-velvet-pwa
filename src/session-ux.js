const VIEW_IDS = ["flowView", "sessionSetupView", "sessionPlayerView", "sessionSummaryView"];

const mainExperience = document.querySelector("#mainExperience");
const quickHideButton = document.querySelector("#quickHideButton");
const unlockButton = document.querySelector("#unlockButton");
const returnButton = document.querySelector("#returnButton");
const modeLabel = document.querySelector("#modeLabel");

let returnViewId = "flowView";
let returnModeLabel = "FLOW";

function captureActiveView() {
  const active = VIEW_IDS
    .map(id => document.getElementById(id))
    .find(view => view?.classList.contains("view--active"));
  if (!active) return;
  returnViewId = active.id;
  returnModeLabel = modeLabel?.textContent || "FLOW";
}

function restoreActiveViewIfUnlocked() {
  if (!mainExperience || mainExperience.classList.contains("is-hidden")) return;
  const target = document.getElementById(returnViewId);
  if (!target || returnViewId === "flowView") return;

  for (const id of VIEW_IDS) document.getElementById(id)?.classList.remove("view--active");
  target.classList.add("view--active");
  if (modeLabel) modeLabel.textContent = returnModeLabel;
}

function restoreAfterAppHandler() {
  queueMicrotask(restoreActiveViewIfUnlocked);
}

// Privacy shield must not silently destroy an in-progress Session. Capture the
// active view before/while the app is hidden, then restore it only after the
// owner explicitly returns/unlocks. If WebKit discards the page, nothing is persisted.
quickHideButton?.addEventListener("click", captureActiveView, { capture: true });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") captureActiveView();
});
window.addEventListener("pagehide", captureActiveView);

unlockButton?.addEventListener("click", restoreAfterAppHandler);
returnButton?.addEventListener("click", restoreAfterAppHandler);

// Session durations are card-count targets (~15 s/item), not countdown timers.
// Make the UI explicit so the label never promises exact wall-clock duration.
const durationLegend = document.querySelector("#durationOptions")?.closest("fieldset")?.querySelector("legend");
if (durationLegend) durationLegend.textContent = "Approx. duration";
for (const input of document.querySelectorAll('#durationOptions input[name="duration"]')) {
  const label = input.parentElement?.querySelector("span");
  if (label) label.textContent = `~${input.value} min`;
}
