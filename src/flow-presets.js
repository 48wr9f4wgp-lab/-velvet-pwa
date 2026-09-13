import "./loading-guard.js";
import "./session-ux.js";
import "./taste-snapshot.js";

const PRESET_KEY = "velvet_private_v2_flow_preset";
const STATE_KEY = "velvet_private_v2_state";

const PRESETS = [
  { id: "soft", label: "Soft", note: "穏やかに" },
  { id: "personal", label: "Personal", note: "好みを優先" },
  { id: "pro", label: "Pro", note: "プロ寄り" },
  { id: "intense", label: "Intense", note: "刺激強め" },
  { id: "favorites", label: "Favorites", note: "お気に入りのみ" },
  { id: "explore", label: "Explore", note: "発見を増やす" }
];

function readState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) || "null") || {};
  } catch (_) {
    return {};
  }
}

function currentPreset() {
  try {
    const value = localStorage.getItem(PRESET_KEY);
    return PRESETS.some(preset => preset.id === value) ? value : "personal";
  } catch (_) {
    return "personal";
  }
}

function hasFavorites() {
  const state = readState();
  return Array.isArray(state.likedItemIds) && state.likedItemIds.length > 0;
}

function writePreset(value) {
  const preset = PRESETS.find(row => row.id === value) || PRESETS[1];
  try { localStorage.setItem(PRESET_KEY, preset.id); } catch (_) {}
  return preset;
}

function clearPreset() {
  try { localStorage.removeItem(PRESET_KEY); } catch (_) {}
}

function announcePreset(id) {
  window.dispatchEvent(new CustomEvent("velvet:flow-preset", { detail: { id } }));
}

const actions = document.querySelector(".topbar__actions");
const app = document.querySelector("#app");

if (actions && app) {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.id = "flowPresetButton";
  trigger.className = "back-button";
  trigger.setAttribute("aria-label", "Flowモード");

  const dialog = document.createElement("dialog");
  dialog.id = "flowPresetDialog";
  dialog.className = "settings-dialog";

  const form = document.createElement("form");
  form.method = "dialog";
  form.className = "settings-sheet";

  const head = document.createElement("div");
  head.className = "settings-sheet__head";
  const copy = document.createElement("div");
  copy.innerHTML = '<p class="eyebrow">FLOW MODE</p><h2>Flowモード</h2>';
  const close = document.createElement("button");
  close.className = "icon-button";
  close.value = "close";
  close.setAttribute("aria-label", "Flowモードを閉じる");
  close.textContent = "×";
  head.append(copy, close);

  const list = document.createElement("div");
  list.className = "settings-actions";

  const buttons = new Map();
  for (const preset of PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button--ghost";
    button.dataset.preset = preset.id;
    button.textContent = `${preset.label} · ${preset.note}`;
    button.addEventListener("click", () => {
      if (preset.id === "favorites" && !hasFavorites()) return;
      writePreset(preset.id);
      announcePreset(preset.id);
      refresh();
      dialog.close();
    });
    buttons.set(preset.id, button);
    list.append(button);
  }

  const hint = document.createElement("p");
  hint.className = "muted settings-status";
  hint.textContent = "次のカードから反映します。";

  form.append(head, list, hint);
  dialog.append(form);
  app.append(dialog);
  actions.prepend(trigger);

  function refresh() {
    let active = currentPreset();
    if (active === "favorites" && !hasFavorites()) {
      active = writePreset("personal").id;
      announcePreset(active);
    }
    const current = PRESETS.find(row => row.id === active) || PRESETS[1];
    trigger.textContent = current.label;
    trigger.setAttribute("data-preset", current.id);

    const favorites = buttons.get("favorites");
    if (favorites) {
      const available = hasFavorites();
      favorites.disabled = !available;
      favorites.textContent = available ? "Favorites · お気に入りのみ" : "Favorites · まず1件保存";
    }

    for (const [id, button] of buttons) {
      button.setAttribute("aria-pressed", id === current.id ? "true" : "false");
    }
  }

  trigger.addEventListener("click", () => {
    refresh();
    dialog.showModal();
  });

  window.addEventListener("velvet:favorites-changed", () => queueMicrotask(refresh));

  document.querySelector("#historyModeSetting")?.addEventListener("change", event => {
    if (event.target?.value === "off" && currentPreset() === "favorites") {
      writePreset("personal");
      announcePreset("personal");
    }
    queueMicrotask(refresh);
  });

  document.querySelector("#clearHistoryButton")?.addEventListener("click", () => {
    if (currentPreset() === "favorites") {
      writePreset("personal");
      announcePreset("personal");
    }
    queueMicrotask(refresh);
  });

  document.querySelector("#clearAllButton")?.addEventListener("click", () => {
    clearPreset();
    announcePreset("personal");
    queueMicrotask(refresh);
  });

  refresh();
}
