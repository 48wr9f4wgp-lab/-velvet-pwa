const $ = selector => document.querySelector(selector);

const privacyGate = $("#privacyGate");
const safeScreen = $("#safeScreen");
const safeTime = $("#safeTime");
const mainExperience = $("#mainExperience");
const quickHideButton = $("#quickHideButton");

function updateSafeTime() {
  if (!safeTime) return;
  safeTime.textContent = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function closeTransientUi() {
  for (const dialog of document.querySelectorAll("dialog[open]")) {
    try { dialog.close(); } catch (_) {}
  }
}

export function forcePrivacyShield() {
  closeTransientUi();
  updateSafeTime();
  mainExperience?.classList.add("is-hidden");
  privacyGate?.classList.add("is-hidden");
  safeScreen?.classList.remove("is-hidden");
}

// Close any top-layer UI before the app's existing Quick Hide handler runs.
quickHideButton?.addEventListener("click", closeTransientUi, { capture: true });

// iOS can snapshot the current surface for app switching. Move to the neutral
// screen as soon as the document is backgrounded; never auto-unlock on return.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") forcePrivacyShield();
});
window.addEventListener("pagehide", forcePrivacyShield);

// Defensive lock for browser lifecycle events used by some WebKit paths.
document.addEventListener("freeze", forcePrivacyShield);
