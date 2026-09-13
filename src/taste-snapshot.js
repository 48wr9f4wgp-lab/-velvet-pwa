const STATE_KEY = "velvet_private_v2_state";

function readState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) || "null") || {};
  } catch (_) {
    return {};
  }
}

function rankedEntries(map, direction = 1, limit = 3) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return [];
  return Object.entries(map)
    .map(([key, raw]) => [key, Number(raw)])
    .filter(([key, value]) => key && Number.isFinite(value) && (direction > 0 ? value > 0.15 : value < -0.15))
    .sort((a, b) => direction > 0 ? b[1] - a[1] : a[1] - b[1])
    .slice(0, limit);
}

function strongestLabel(map, formatter = value => value) {
  const row = rankedEntries(map, 1, 1)[0];
  return row ? formatter(row[0]) : "学習中";
}

function labels(entries) {
  return entries.length ? entries.map(([key]) => key).join(" · ") : "学習中";
}

function createRow(label) {
  const row = document.createElement("div");
  row.className = "taste-snapshot__row";
  const key = document.createElement("span");
  key.className = "taste-snapshot__key";
  key.textContent = label;
  const value = document.createElement("span");
  value.className = "taste-snapshot__value";
  row.append(key, value);
  return { row, value };
}

const sheet = document.querySelector(".settings-sheet");
const actions = document.querySelector(".settings-actions");

if (sheet && actions) {
  const style = document.createElement("style");
  style.textContent = `
    .settings-dialog{overflow-y:auto;-webkit-overflow-scrolling:touch}
    .taste-snapshot{margin:18px 0 2px;padding:16px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.025)}
    .taste-snapshot__head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:12px}
    .taste-snapshot__head p{margin:0}
    .taste-snapshot__badge{font-size:10px;color:var(--muted);letter-spacing:.04em}
    .taste-snapshot__grid{display:grid;gap:9px}
    .taste-snapshot__row{display:flex;justify-content:space-between;gap:14px;font-size:12px;line-height:1.35}
    .taste-snapshot__key{color:var(--muted);flex:0 0 auto}
    .taste-snapshot__value{text-align:right;overflow-wrap:anywhere}
  `;
  document.head.append(style);

  const panel = document.createElement("section");
  panel.className = "taste-snapshot";
  panel.setAttribute("aria-label", "端末内の好み学習");

  const head = document.createElement("div");
  head.className = "taste-snapshot__head";
  const titleWrap = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "TASTE";
  const title = document.createElement("p");
  title.textContent = "Velvetが学習していること";
  title.style.marginTop = "5px";
  titleWrap.append(eyebrow, title);
  const badge = document.createElement("span");
  badge.className = "taste-snapshot__badge";
  badge.textContent = "端末内のみ";
  head.append(titleWrap, badge);

  const grid = document.createElement("div");
  grid.className = "taste-snapshot__grid";
  const decisions = createRow("操作");
  const topTags = createRow("好みのタグ");
  const avoidTags = createRow("避けるタグ");
  const intensity = createRow("強度");
  const sourceClass = createRow("ソース傾向");
  const feed = createRow("Feed状態");
  grid.append(decisions.row, topTags.row, avoidTags.row, intensity.row, sourceClass.row, feed.row);

  panel.append(head, grid);
  sheet.insertBefore(panel, actions);

  function render() {
    const state = readState();
    const counts = state.counts || {};
    const favoriteCount = Array.isArray(state.likedItemIds) ? state.likedItemIds.length : 0;
    decisions.value.textContent = `お気に入り ${favoriteCount} · スキップ ${Number(counts.skipped) || 0} · 表示 ${Number(counts.viewed) || 0}`;
    topTags.value.textContent = labels(rankedEntries(state.tagWeights, 1, 3));
    avoidTags.value.textContent = labels(rankedEntries(state.tagWeights, -1, 3));
    intensity.value.textContent = strongestLabel(state.intensityWeights, key => key.toUpperCase());
    sourceClass.value.textContent = strongestLabel(state.sourceClassWeights);

    const info = window.__velvetFeedInfo;
    if (!info) {
      feed.value.textContent = "Feed待機中";
      return;
    }
    const visible = Math.max(0, Number(info.visibleCount) || 0);
    const quarantined = Math.max(0, Number(info.diagnostics?.quarantine?.total) || 0);
    feed.value.textContent = info.demo
      ? `デモ ${visible}件`
      : `候補 ${visible}件 · 除外 ${quarantined}件`;
  }

  document.querySelector("#settingsButton")?.addEventListener("click", render, { capture: true });
  for (const id of ["resetTasteButton", "clearHistoryButton", "clearAllButton"]) {
    document.querySelector(`#${id}`)?.addEventListener("click", () => queueMicrotask(render));
  }
  window.addEventListener("velvet:feed-info", render);
  window.addEventListener("velvet:favorites-changed", render);
  render();
}
