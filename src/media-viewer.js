let flowItem = null;
let flowFavorite = false;
let sessionItem = null;
let activeScope = null;
let zoom = 1;
let panX = 0;
let panY = 0;
let dragging = null;
let lastTapAt = 0;

function ensureViewer() {
  let viewer = document.querySelector("#mediaViewer");
  if (viewer) return viewer;

  viewer = document.createElement("div");
  viewer.id = "mediaViewer";
  viewer.className = "media-viewer";
  viewer.setAttribute("aria-hidden", "true");
  viewer.innerHTML = `
    <div class="media-viewer__top">
      <div class="media-viewer__meta">
        <span id="mediaViewerSource">Velvet</span>
        <span id="mediaViewerIntensity">—</span>
      </div>
      <div class="media-viewer__actions">
        <button id="mediaViewerFavorite" class="media-viewer__favorite" type="button" aria-label="お気に入りに追加" aria-pressed="false">♥</button>
        <button id="mediaViewerClose" class="media-viewer__close" type="button" aria-label="閉じる">×</button>
      </div>
    </div>
    <div class="media-viewer__stage">
      <img id="mediaViewerImage" alt="" draggable="false" />
    </div>
    <p class="media-viewer__hint">ダブルタップで拡大</p>
  `;
  document.body.append(viewer);

  viewer.querySelector("#mediaViewerClose")?.addEventListener("click", closeViewer);
  viewer.querySelector("#mediaViewerFavorite")?.addEventListener("click", () => {
    if (activeScope !== "flow" || !flowItem?.id) return;
    window.dispatchEvent(new CustomEvent("velvet:flow-toggle-favorite", {
      detail: { id: flowItem.id }
    }));
  });
  viewer.addEventListener("click", event => {
    if (event.target === viewer || event.target?.classList?.contains("media-viewer__stage")) closeViewer();
  });

  const image = viewer.querySelector("#mediaViewerImage");
  image?.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, panX, panY };
    image.setPointerCapture?.(event.pointerId);
  });
  image?.addEventListener("pointermove", event => {
    if (!dragging || dragging.id !== event.pointerId || zoom <= 1) return;
    event.preventDefault();
    panX = dragging.panX + event.clientX - dragging.x;
    panY = dragging.panY + event.clientY - dragging.y;
    clampPan();
    applyTransform();
  });
  image?.addEventListener("pointerup", event => {
    if (!dragging || dragging.id !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - dragging.x, event.clientY - dragging.y);
    image.releasePointerCapture?.(event.pointerId);
    dragging = null;
    if (moved > 8) return;
    const now = performance.now();
    if (now - lastTapAt < 320) {
      toggleZoom();
      lastTapAt = 0;
    } else {
      lastTapAt = now;
    }
  });
  image?.addEventListener("pointercancel", () => { dragging = null; });

  return viewer;
}

function clampPan() {
  if (zoom <= 1) {
    panX = 0;
    panY = 0;
    return;
  }
  const maxX = Math.max(0, window.innerWidth * (zoom - 1) * 0.38);
  const maxY = Math.max(0, window.innerHeight * (zoom - 1) * 0.34);
  panX = Math.max(-maxX, Math.min(maxX, panX));
  panY = Math.max(-maxY, Math.min(maxY, panY));
}

function applyTransform() {
  const image = document.querySelector("#mediaViewerImage");
  if (!image) return;
  image.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
  document.querySelector("#mediaViewer")?.classList.toggle("is-zoomed", zoom > 1);
}

function resetTransform() {
  zoom = 1;
  panX = 0;
  panY = 0;
  dragging = null;
  applyTransform();
}

function toggleZoom() {
  zoom = zoom > 1 ? 1 : 2.2;
  if (zoom === 1) {
    panX = 0;
    panY = 0;
  }
  clampPan();
  applyTransform();
}

function syncViewerFavoriteButton() {
  const button = document.querySelector("#mediaViewerFavorite");
  if (!button) return;
  const visible = activeScope === "flow" && !!flowItem?.id;
  button.hidden = !visible;
  button.classList.toggle("is-saved", visible && flowFavorite);
  button.setAttribute("aria-pressed", visible && flowFavorite ? "true" : "false");
  button.setAttribute("aria-label", flowFavorite ? "お気に入りから外す" : "お気に入りに追加");
}

function openViewer(scope) {
  const item = scope === "session" ? sessionItem : flowItem;
  if (!item?.image_url) return;
  const viewer = ensureViewer();
  const image = viewer.querySelector("#mediaViewerImage");
  const source = viewer.querySelector("#mediaViewerSource");
  const intensity = viewer.querySelector("#mediaViewerIntensity");
  activeScope = scope;
  resetTransform();
  image.src = item.image_url;
  image.alt = "Velvet image focus";
  source.textContent = item.source_label || item.source || "Velvet";
  intensity.textContent = `I${Math.round(Number(item.intensity) || 3)}`;
  syncViewerFavoriteButton();
  viewer.classList.add("is-open");
  viewer.setAttribute("aria-hidden", "false");
  document.documentElement.classList.add("media-viewer-open");
}

function closeViewer() {
  const viewer = document.querySelector("#mediaViewer");
  if (!viewer) return;
  viewer.classList.remove("is-open", "is-zoomed");
  viewer.setAttribute("aria-hidden", "true");
  document.documentElement.classList.remove("media-viewer-open");
  activeScope = null;
  resetTransform();
}

function isDemoItem(item) {
  return window.__velvetFeedInfo?.demo === true || item?.rights_status === "demo-local" || String(item?.id || "").startsWith("demo-");
}

function openScriptableFeedSync() {
  window.dispatchEvent(new CustomEvent("velvet:feed-sync-status", {
    detail: { message: "Scriptableでフィードを更新します", timeout: 2200 }
  }));
  window.location.href = "scriptable:///run/Velvet%20Feed%20Sync";
}

window.addEventListener("velvet:flow-item", event => {
  flowItem = event.detail?.item || null;
  flowFavorite = event.detail?.favorite === true;
  if (activeScope === "flow") syncViewerFavoriteButton();
});
window.addEventListener("velvet:session-item", event => { sessionItem = event.detail?.item || null; });
window.addEventListener("velvet:media-tap", event => {
  const scope = event.detail?.scope === "session" ? "session" : "flow";
  const item = scope === "session" ? sessionItem : flowItem;
  if (scope === "flow" && isDemoItem(item)) {
    openScriptableFeedSync();
    return;
  }
  openViewer(scope);
});
window.addEventListener("resize", () => {
  if (!activeScope) return;
  clampPan();
  applyTransform();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeViewer();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") closeViewer();
});
window.addEventListener("pagehide", closeViewer);
document.querySelector("#quickHideButton")?.addEventListener("click", closeViewer, { capture: true });
