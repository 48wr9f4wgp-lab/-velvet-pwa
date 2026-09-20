import "./loading-guard.js";
import "./taste-snapshot.js";

const PRESET_KEY = "velvet_private_v2_flow_preset";
const SOURCE_FILTER_KEY = "velvet_private_v3_source_filter";
const LAST_ORDER_KEY = "velvet_private_v3_last_order";
const STATE_KEY = "velvet_private_v2_state";

const ORDERS = [
  { id: "personal", label: "おすすめ", note: "好みを優先" },
  { id: "popular", label: "人気", note: "ランキング上位" },
  { id: "latest", label: "新着", note: "新しい順" }
];

const FILTERS = [
  { id: "all", label: "すべて" },
  { id: "amateur", label: "素人" },
  { id: "pro", label: "プロ" },
  { id: "pinterest", label: "Pinterest" }
];

const VALID_ORDERS = new Set(ORDERS.map(row => row.id));
const VALID_FILTERS = new Set(FILTERS.map(row => row.id));

function readState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) || "null") || {};
  } catch (_) {
    return {};
  }
}

function hasFavorites() {
  const state = readState();
  return Array.isArray(state.likedItemIds) && state.likedItemIds.length > 0;
}

function legacyMigration() {
  try {
    const stored = localStorage.getItem(PRESET_KEY);
    if (stored === "pro") {
      localStorage.setItem(PRESET_KEY, "personal");
      if (!localStorage.getItem(SOURCE_FILTER_KEY)) localStorage.setItem(SOURCE_FILTER_KEY, "pro");
      localStorage.setItem(LAST_ORDER_KEY, "personal");
      return;
    }
    if (["soft", "intense", "explore"].includes(stored)) {
      localStorage.setItem(PRESET_KEY, "personal");
      localStorage.setItem(LAST_ORDER_KEY, "personal");
    }
  } catch (_) {}
}

function currentMode() {
  try {
    const value = localStorage.getItem(PRESET_KEY);
    if (value === "favorites" || VALID_ORDERS.has(value)) return value;
  } catch (_) {}
  return "personal";
}

function currentOrder() {
  const mode = currentMode();
  if (VALID_ORDERS.has(mode)) return mode;
  try {
    const saved = localStorage.getItem(LAST_ORDER_KEY);
    if (VALID_ORDERS.has(saved)) return saved;
  } catch (_) {}
  return "personal";
}

function currentFilter() {
  try {
    const value = localStorage.getItem(SOURCE_FILTER_KEY);
    return VALID_FILTERS.has(value) ? value : "all";
  } catch (_) {
    return "all";
  }
}

function writeMode(value) {
  const next = value === "favorites" || VALID_ORDERS.has(value) ? value : "personal";
  try {
    localStorage.setItem(PRESET_KEY, next);
    if (VALID_ORDERS.has(next)) localStorage.setItem(LAST_ORDER_KEY, next);
  } catch (_) {}
  return next;
}

function writeFilter(value) {
  const next = VALID_FILTERS.has(value) ? value : "all";
  try { localStorage.setItem(SOURCE_FILTER_KEY, next); } catch (_) {}
  return next;
}

function clearFlowUiState() {
  try {
    localStorage.removeItem(PRESET_KEY);
    localStorage.removeItem(SOURCE_FILTER_KEY);
    localStorage.removeItem(LAST_ORDER_KEY);
  } catch (_) {}
}

function announceMode(id) {
  window.dispatchEvent(new CustomEvent("velvet:flow-preset", { detail: { id } }));
}

function announceFilter(id) {
  window.dispatchEvent(new CustomEvent("velvet:flow-filter", { detail: { id } }));
}

legacyMigration();

function cleanupLegacyPinterestWidgetState() {
  try {
    localStorage.removeItem("velvet_private_v49_pinterest_url");
  } catch (_) {}
}

cleanupLegacyPinterestWidgetState();

const actions = document.querySelector(".topbar__actions");
const app = document.querySelector("#app");

if (actions && app) {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.id = "flowPresetButton";
  trigger.className = "back-button";
  trigger.setAttribute("aria-label", "Flowの表示を選ぶ");

  const dialog = document.createElement("dialog");
  dialog.id = "flowPresetDialog";
  dialog.className = "settings-dialog";

  const form = document.createElement("form");
  form.method = "dialog";
  form.className = "settings-sheet";

  const head = document.createElement("div");
  head.className = "settings-sheet__head";
  const copy = document.createElement("div");
  copy.innerHTML = '<p class="eyebrow">FLOW</p><h2>表示を選ぶ</h2>';
  const close = document.createElement("button");
  close.className = "icon-button";
  close.value = "close";
  close.setAttribute("aria-label", "表示設定を閉じる");
  close.textContent = "×";
  head.append(copy, close);

  function section(title) {
    const wrap = document.createElement("section");
    wrap.className = "flow-query-section";
    const label = document.createElement("p");
    label.className = "flow-query-section__label";
    label.textContent = title;
    const grid = document.createElement("div");
    grid.className = "flow-option-grid";
    wrap.append(label, grid);
    return { wrap, grid };
  }

  const orderSection = section("並び方");
  const filterSection = section("系統");
  filterSection.wrap.classList.add("flow-query-section--filters");
  const orderButtons = new Map();
  const filterButtons = new Map();

  for (const order of ORDERS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button--ghost flow-option";
    button.dataset.flowOrder = order.id;
    button.innerHTML = `<b>${order.label}</b><small>${order.note}</small>`;
    button.addEventListener("click", () => {
      writeMode(order.id);
      announceMode(order.id);
      refresh();
    });
    orderButtons.set(order.id, button);
    orderSection.grid.append(button);
  }

  for (const filter of FILTERS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button--ghost flow-option flow-option--compact";
    button.dataset.flowFilter = filter.id;
    button.textContent = filter.label;
    button.addEventListener("click", () => {
      const wasFavorites = currentMode() === "favorites";
      writeFilter(filter.id);
      if (wasFavorites) {
        const order = currentOrder();
        writeMode(order);
        announceMode(order);
      }
      announceFilter(filter.id);
      refresh();
    });
    filterButtons.set(filter.id, button);
    filterSection.grid.append(button);
  }

  const favoritesButton = document.createElement("button");
  favoritesButton.type = "button";
  favoritesButton.id = "flowFavoritesButton";
  favoritesButton.className = "button button--ghost button--wide flow-favorites-button";
  favoritesButton.textContent = "♡ お気に入り";
  favoritesButton.addEventListener("click", () => {
    if (!hasFavorites()) return;
    writeMode("favorites");
    announceMode("favorites");
    refresh();
    dialog.close();
  });

  const hint = document.createElement("p");
  hint.className = "muted settings-status";
  hint.textContent = "選ぶとすぐ反映します。";

  form.append(head, orderSection.wrap, filterSection.wrap, favoritesButton, hint);
  dialog.append(form);
  app.append(dialog);
  actions.prepend(trigger);

  function refresh() {
    let mode = currentMode();
    if (mode === "favorites" && !hasFavorites()) {
      mode = writeMode(currentOrder());
      announceMode(mode);
    }

    const order = currentOrder();
    const filter = currentFilter();
    const orderRow = ORDERS.find(row => row.id === order) || ORDERS[0];
    const filterRow = FILTERS.find(row => row.id === filter) || FILTERS[0];

    trigger.textContent = mode === "favorites" ? "お気に入り" : filter === "pinterest" ? "Pinterest" : `${orderRow.label}・${filterRow.label}`;
    trigger.dataset.flowMode = mode;
    trigger.dataset.flowFilter = filter;

    for (const [id, button] of orderButtons) {
      const active = mode !== "favorites" && id === order;
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.classList.toggle("is-active", active);
    }
    for (const [id, button] of filterButtons) {
      const active = mode !== "favorites" && id === filter;
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.classList.toggle("is-active", active);
    }

    const available = hasFavorites();
    favoritesButton.disabled = !available;
    favoritesButton.classList.toggle("is-active", mode === "favorites");
    favoritesButton.textContent = available ? "♡ お気に入り" : "♡ お気に入りはまだありません";
  }

  trigger.addEventListener("click", () => {
    refresh();
    dialog.showModal();
  });

  window.addEventListener("velvet:favorites-changed", () => queueMicrotask(refresh));

  document.querySelector("#clearAllButton")?.addEventListener("click", () => {
    clearFlowUiState();
    writeMode("personal");
    writeFilter("all");
    announceMode("personal");
    announceFilter("all");
    queueMicrotask(refresh);
  });

  refresh();
}
