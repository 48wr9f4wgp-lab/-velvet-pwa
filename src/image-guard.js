const targets = new Map([
  [document.querySelector("#mediaImage"), { scope: "flow", item: null }],
  [document.querySelector("#sessionMediaImage"), { scope: "session", item: null }]
]);

function update(scope, item) {
  for (const [img, state] of targets) {
    if (!img || state.scope !== scope) continue;
    state.item = item || null;
    img.dataset.velvetFallbackTried = "0";
    img.decoding = "async";
    if ("fetchPriority" in img) img.fetchPriority = "high";
  }
}

function fallbackUrl(item) {
  const primary = typeof item?.image_url === "string" ? item.image_url : "";
  const fallback = typeof item?.thumb_url === "string" ? item.thumb_url.trim() : "";
  if (!fallback || fallback === primary) return "";
  return fallback;
}

for (const [img, state] of targets) {
  if (!img) continue;
  img.addEventListener("error", event => {
    const fallback = fallbackUrl(state.item);
    if (!fallback || img.dataset.velvetFallbackTried === "1") return;
    img.dataset.velvetFallbackTried = "1";
    event.stopImmediatePropagation();
    img.classList.remove("image-failed");
    img.src = fallback;
  }, { capture: true });

  img.addEventListener("load", () => {
    img.classList.remove("image-failed");
  });
}

window.addEventListener("velvet:flow-item", event => update("flow", event.detail?.item));
window.addEventListener("velvet:session-item", event => update("session", event.detail?.item));
