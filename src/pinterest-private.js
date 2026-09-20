const SOURCE_FILTER_KEY = "velvet_private_v3_source_filter";
const BOARD_KEY = "velvet_private_v50_pinterest_board_id";

const flowView = document.querySelector("#flowView");
const panel = document.querySelector("#pinterestPrivateView");
const gridShell = document.querySelector("#flowGridShell");

let statusCache = null;
let boardsCache = [];
let selectedBoardId = "";
let currentBookmark = "";
let loadingPins = false;

function readFilter() {
  try { return localStorage.getItem(SOURCE_FILTER_KEY) || "all"; }
  catch (_) { return "all"; }
}

function readBoardId() {
  try { return localStorage.getItem(BOARD_KEY) || ""; }
  catch (_) { return ""; }
}

function writeBoardId(value) {
  try {
    if (value) localStorage.setItem(BOARD_KEY, value);
    else localStorage.removeItem(BOARD_KEY);
  } catch (_) {}
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });
  let body = {};
  try { body = await response.json(); } catch (_) {}
  if (!response.ok) {
    const error = new Error(body?.error || "REQUEST_FAILED");
    error.status = response.status;
    error.code = body?.error || "REQUEST_FAILED";
    throw error;
  }
  return body;
}

function button(label, className = "button button--ghost") {
  const el = document.createElement("button");
  el.type = "button";
  el.className = className;
  el.textContent = label;
  return el;
}

function messageCard(title, copy) {
  const card = document.createElement("div");
  card.className = "pinterest-private-card";
  const h = document.createElement("h2");
  h.textContent = title;
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = copy;
  card.append(h, p);
  return card;
}

function renderLoading(text = "Pinterestを確認中…") {
  if (!panel) return;
  panel.replaceChildren();
  panel.append(messageCard("Pinterest", text));
}

function renderConfigNeeded(status) {
  panel.replaceChildren();
  const card = messageCard(
    "Pinterest APIの設定待ち",
    "非公開ボード対応のOAuth土台は準備済みです。Developer Appの秘密情報はVelvetの画面には入力しません。"
  );
  const label = document.createElement("p");
  label.className = "pinterest-private-meta";
  label.textContent = "Redirect URI";
  const code = document.createElement("code");
  code.className = "pinterest-private-code";
  code.textContent = status?.redirect_uri || location.origin + "/api/pinterest-callback";
  const env = document.createElement("p");
  env.className = "muted pinterest-private-small";
  env.textContent = "必要: PINTEREST_APP_ID / PINTEREST_APP_SECRET / VELVET_PINTEREST_SESSION_SECRET";
  card.append(label, code, env);
  panel.append(card);
}

function renderConnect() {
  panel.replaceChildren();
  const card = messageCard(
    "Pinterestを接続",
    "一度だけPinterestで許可すると、公開せずに許可済みのボードをVelvetから切り替えられます。"
  );
  const connect = document.createElement("a");
  connect.className = "button button--primary pinterest-private-connect";
  connect.href = "/api/pinterest-connect";
  connect.textContent = "Pinterestで許可";
  card.append(connect);
  panel.append(card);
}

function privacyLabel(board) {
  const value = String(board?.privacy || "").toLowerCase();
  if (value.includes("secret") || value.includes("private")) return " 🔒";
  return "";
}

function renderShell() {
  panel.replaceChildren();

  const head = document.createElement("div");
  head.className = "pinterest-private-head";

  const titleWrap = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "PINTEREST";
  const title = document.createElement("h2");
  title.textContent = "ボード";
  titleWrap.append(eyebrow, title);

  const disconnect = button("切断", "back-button");
  disconnect.addEventListener("click", async () => {
    disconnect.disabled = true;
    try {
      await fetchJson("/api/pinterest-disconnect", { method: "POST" });
    } catch (_) {}
    statusCache = null;
    boardsCache = [];
    selectedBoardId = "";
    currentBookmark = "";
    writeBoardId("");
    renderConnect();
  });
  head.append(titleWrap, disconnect);

  const boardRail = document.createElement("div");
  boardRail.id = "pinterestBoardRail";
  boardRail.className = "pinterest-board-rail";
  boardRail.setAttribute("aria-label", "Pinterestボード");

  const pins = document.createElement("div");
  pins.id = "pinterestPinsGrid";
  pins.className = "pinterest-pins-grid";

  const footer = document.createElement("div");
  footer.className = "pinterest-private-footer";
  const status = document.createElement("p");
  status.id = "pinterestPinsStatus";
  status.className = "muted pinterest-private-small";
  const more = button("さらに表示");
  more.id = "pinterestLoadMore";
  more.hidden = true;
  more.addEventListener("click", () => loadPins(selectedBoardId, { append: true }));

  footer.append(status, more);
  panel.append(head, boardRail, pins, footer);
}

function renderBoards() {
  const rail = panel.querySelector("#pinterestBoardRail");
  if (!rail) return;
  rail.replaceChildren();

  if (!boardsCache.length) {
    const empty = document.createElement("p");
    empty.className = "muted pinterest-private-small";
    empty.textContent = "表示できるボードがありません";
    rail.append(empty);
    return;
  }

  if (!boardsCache.some(board => board.id === selectedBoardId)) {
    const stored = readBoardId();
    selectedBoardId = boardsCache.some(board => board.id === stored) ? stored : boardsCache[0].id;
    writeBoardId(selectedBoardId);
  }

  for (const board of boardsCache) {
    const chip = button(board.name + privacyLabel(board), "pinterest-board-chip");
    const active = board.id === selectedBoardId;
    chip.classList.toggle("is-active", active);
    chip.setAttribute("aria-pressed", active ? "true" : "false");
    chip.addEventListener("click", () => {
      if (selectedBoardId === board.id) return;
      selectedBoardId = board.id;
      writeBoardId(board.id);
      currentBookmark = "";
      renderBoards();
      loadPins(board.id, { append: false });
    });
    rail.append(chip);
  }
}

function pinCard(pin) {
  const link = document.createElement("a");
  link.className = "pinterest-pin-card";
  link.href = pin.page_url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", pin.title || "Pinterestで開く");

  const img = document.createElement("img");
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.src = pin.image_url;

  const caption = document.createElement("span");
  caption.textContent = pin.title || "Pinterest";
  caption.hidden = !pin.title;

  link.append(img, caption);
  return link;
}

async function loadPins(boardId, { append = false } = {}) {
  if (!boardId || loadingPins) return;
  loadingPins = true;

  const grid = panel.querySelector("#pinterestPinsGrid");
  const status = panel.querySelector("#pinterestPinsStatus");
  const more = panel.querySelector("#pinterestLoadMore");
  if (!grid || !status || !more) {
    loadingPins = false;
    return;
  }

  if (!append) {
    grid.replaceChildren();
    currentBookmark = "";
  }
  status.textContent = append ? "追加読込中…" : "Pinsを読込中…";
  more.hidden = true;

  try {
    const url = new URL("/api/pinterest-pins", location.origin);
    url.searchParams.set("board_id", boardId);
    if (append && currentBookmark) url.searchParams.set("bookmark", currentBookmark);
    const data = await fetchJson(url.pathname + url.search);
    for (const pin of data.pins || []) grid.append(pinCard(pin));
    currentBookmark = String(data.bookmark || "");
    status.textContent = grid.childElementCount ? `${grid.childElementCount}件表示` : "画像付きPinがありません";
    more.hidden = !currentBookmark;
  } catch (error) {
    if (error.status === 401) {
      statusCache = null;
      boardsCache = [];
      renderConnect();
    } else {
      status.textContent = "Pinterestの読込に失敗しました";
    }
  } finally {
    loadingPins = false;
  }
}

async function loadBoards() {
  renderShell();
  const rail = panel.querySelector("#pinterestBoardRail");
  if (rail) rail.textContent = "ボードを読込中…";

  try {
    const data = await fetchJson("/api/pinterest-boards");
    boardsCache = Array.isArray(data.boards) ? data.boards : [];
    selectedBoardId = readBoardId();
    renderBoards();
    if (selectedBoardId) await loadPins(selectedBoardId, { append: false });
  } catch (error) {
    if (error.status === 401) {
      statusCache = null;
      boardsCache = [];
      renderConnect();
      return;
    }
    panel.replaceChildren(messageCard("Pinterest", "ボード一覧を取得できませんでした"));
  }
}

async function ensurePinterest() {
  renderLoading();
  try {
    statusCache = await fetchJson("/api/pinterest-status");
  } catch (_) {
    panel.replaceChildren(messageCard("Pinterest", "接続状態を確認できませんでした"));
    return;
  }

  if (!statusCache.configured) {
    renderConfigNeeded(statusCache);
    return;
  }
  if (!statusCache.connected) {
    renderConnect();
    return;
  }
  await loadBoards();
}

function syncSurface() {
  if (!flowView || !panel || !gridShell) return;
  const active = readFilter() === "pinterest";
  flowView.classList.toggle("pinterest-private-mode", active);
  panel.classList.toggle("is-hidden", !active);
  if (active) ensurePinterest();
}

function clearPinterestLocalState() {
  writeBoardId("");
  statusCache = null;
  boardsCache = [];
  selectedBoardId = "";
  currentBookmark = "";
}

window.addEventListener("velvet:flow-filter", () => queueMicrotask(syncSurface));
document.querySelector("#clearAllButton")?.addEventListener("click", clearPinterestLocalState);

const result = new URL(location.href).searchParams.get("pinterest");
if (result) {
  const clean = new URL(location.href);
  clean.searchParams.delete("pinterest");
  history.replaceState(null, "", clean.pathname + clean.search + clean.hash);
}

syncSurface();
