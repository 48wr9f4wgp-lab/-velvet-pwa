const selectors = [
  "#likeButton",
  "#skipButton",
  "#sessionsButton",
  "#sessionForm button[type='submit']"
];

const controls = selectors
  .map(selector => document.querySelector(selector))
  .filter(Boolean);

let feedReady = !!window.__velvetFeedInfo;

function setFeedReady(ready) {
  feedReady = !!ready;
  for (const control of controls) {
    control.disabled = !feedReady;
    control.setAttribute("aria-disabled", feedReady ? "false" : "true");
    control.style.opacity = feedReady ? "" : "0.38";
  }

  const flowView = document.querySelector("#flowView");
  if (flowView) flowView.setAttribute("aria-busy", feedReady ? "false" : "true");
}

const sessionForm = document.querySelector("#sessionForm");
sessionForm?.addEventListener("submit", event => {
  if (feedReady) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, { capture: true });

setFeedReady(feedReady);

window.addEventListener("velvet:feed-info", () => {
  setFeedReady(true);
});
