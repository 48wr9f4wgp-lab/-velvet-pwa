const flowView = document.querySelector("#flowView");
const likeButton = document.querySelector("#likeButton");

let hideTimer = null;
let currentMode = "personal";
let currentFavorite = false;

function ensureBar() {
  let bar = document.querySelector("#flowFeedback");
  if (bar) return bar;
  if (!flowView) return null;

  bar = document.createElement("div");
  bar.id = "flowFeedback";
  bar.className = "flow-feedback";
  bar.setAttribute("role", "status");
  bar.setAttribute("aria-live", "polite");

  const message = document.createElement("span");
  message.className = "flow-feedback__message";

  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "flow-feedback__undo";
  undo.textContent = "戻す";
  undo.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("velvet:flow-undo"));
  });

  bar.append(message, undo);
  flowView.append(bar);
  return bar;
}

function dismissFeedback() {
  clearTimeout(hideTimer);
  hideTimer = null;
  const bar = document.querySelector("#flowFeedback");
  if (!bar) return;
  bar.classList.remove("is-visible", "is-like");
}

function syncFavoriteButton() {
  if (!likeButton) return;
  likeButton.classList.toggle("is-saved", currentFavorite);
  likeButton.setAttribute("aria-pressed", currentFavorite ? "true" : "false");
  likeButton.setAttribute("aria-label", currentFavorite ? "お気に入りから外す" : "お気に入りに保存");
  likeButton.dataset.label = currentFavorite
    ? (currentMode === "favorites" ? "解除" : "保存済み")
    : "お気に入り";
}

function show(message, { undo = false, liked = false, timeout = 4600 } = {}) {
  const bar = ensureBar();
  if (!bar) return;
  clearTimeout(hideTimer);

  bar.querySelector(".flow-feedback__message").textContent = message;
  bar.querySelector(".flow-feedback__undo").hidden = !undo;
  bar.classList.toggle("is-like", liked);
  bar.classList.add("is-visible");

  if (liked && likeButton) {
    likeButton.classList.remove("is-confirmed");
    requestAnimationFrame(() => likeButton.classList.add("is-confirmed"));
    setTimeout(() => likeButton.classList.remove("is-confirmed"), 360);
  }

  hideTimer = setTimeout(() => bar.classList.remove("is-visible"), timeout);
}

window.addEventListener("velvet:flow-item", event => {
  currentMode = event.detail?.mode || currentMode;
  currentFavorite = event.detail?.favorite === true;
  syncFavoriteButton();
});

window.addEventListener("velvet:flow-feedback", event => {
  const reaction = event.detail?.reaction;
  if (reaction === "like") {
    const saved = event.detail?.saved !== false;
    show(saved ? "お気に入りに保存" : "好みに反映しました", { undo: true, liked: saved });
  } else if (reaction === "unfavorite") {
    show("お気に入りから外しました", { undo: true });
  } else if (reaction === "skip") {
    show("スキップしました", { undo: true });
  }
});

for (const eventName of [
  "velvet:flow-next",
  "velvet:flow-back",
  "velvet:session-next",
  "velvet:session-back"
]) {
  window.addEventListener(eventName, dismissFeedback);
}

window.addEventListener("velvet:flow-undone", () => {
  show("ひとつ前に戻しました", { undo: false, timeout: 1800 });
});

window.addEventListener("velvet:flow-preset", event => {
  const labels = {
    soft: "Soft",
    personal: "Personal",
    pro: "Pro",
    intense: "Intense",
    favorites: "Favorites",
    explore: "Explore"
  };
  const label = labels[event.detail?.id];
  if (label) show(`${label}に変更`, { undo: false, timeout: 1500 });
});

window.addEventListener("velvet:feed-sync-status", event => {
  const message = typeof event.detail?.message === "string" ? event.detail.message.trim() : "";
  if (!message) return;
  const timeout = Math.max(800, Math.min(8000, Number(event.detail?.timeout) || 2600));
  show(message, { undo: false, timeout });
});
