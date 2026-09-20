const SOURCE_FILTER_KEY = "velvet_private_v3_source_filter";
const PINTEREST_URL_KEY = "velvet_private_v49_pinterest_url";
const PINTEREST_SCRIPT_ID = "velvetPinterestPinit";

const flowView = document.querySelector("#flowView");
const panel = document.querySelector("#pinterestPanel");
const gridShell = document.querySelector("#flowGridShell");
let renderedHref = "";

function readFilter() {
  try { return localStorage.getItem(SOURCE_FILTER_KEY) || "all"; }
  catch (_) { return "all"; }
}

function readPinterestUrl() {
  try { return localStorage.getItem(PINTEREST_URL_KEY) || ""; }
  catch (_) { return ""; }
}

function writePinterestUrl(value) {
  try { localStorage.setItem(PINTEREST_URL_KEY, value); }
  catch (_) {}
}

function clearPinterestUrl() {
  try { localStorage.removeItem(PINTEREST_URL_KEY); }
  catch (_) {}
}

function normalizePinterestUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;

  let url;
  try { url = new URL(value); }
  catch (_) { return null; }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const allowed = host === "pinterest.com"
    || host.endsWith(".pinterest.com")
    || host === "pinterest.jp"
    || host.endsWith(".pinterest.jp");
  if (!allowed) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (!parts.length || parts[0].toLowerCase() === "pin") return null;

  return {
    href: `https://www.pinterest.com/${parts.map(encodeURIComponent).join("/")}/`,
    type: parts.length >= 2 ? "board" : "profile"
  };
}

function loadPinterestScript() {
  if (document.querySelector(`#${PINTEREST_SCRIPT_ID}`)) return;
  const script = document.createElement("script");
  script.id = PINTEREST_SCRIPT_ID;
  script.async = true;
  script.defer = true;
  script.src = "https://assets.pinterest.com/js/pinit.js";
  document.body.append(script);
}

function buildSetup() {
  panel.replaceChildren();

  const card = document.createElement("div");
  card.className = "pinterest-setup";

  const title = document.createElement("h2");
  title.textContent = "Pinterestを接続";

  const copy = document.createElement("p");
  copy.className = "muted";
  copy.textContent = "公開プロフィールか公開ボードのURLを1回貼るだけ。Developer登録は不要です。";

  const form = document.createElement("form");
  form.className = "pinterest-setup__form";

  const input = document.createElement("input");
  input.type = "url";
  input.inputMode = "url";
  input.autocapitalize = "none";
  input.autocomplete = "off";
  input.placeholder = "https://www.pinterest.com/ユーザー/ボード/";
  input.setAttribute("aria-label", "PinterestのプロフィールまたはボードURL");

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "button button--primary";
  save.textContent = "表示する";

  const status = document.createElement("p");
  status.className = "muted pinterest-setup__status";
  status.setAttribute("aria-live", "polite");

  form.append(input, save);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const normalized = normalizePinterestUrl(input.value);
    if (!normalized) {
      status.textContent = "Pinterestの公開プロフィール/ボードURLを貼ってください";
      return;
    }
    writePinterestUrl(normalized.href);
    location.reload();
  });

  card.append(title, copy, form, status);
  panel.append(card);
}

function buildWidget(normalized) {
  panel.replaceChildren();

  const toolbar = document.createElement("div");
  toolbar.className = "pinterest-toolbar";

  const label = document.createElement("span");
  label.textContent = normalized.type === "board" ? "Pinterest Board" : "Pinterest Profile";

  const change = document.createElement("button");
  change.type = "button";
  change.className = "back-button";
  change.textContent = "変更";
  change.addEventListener("click", () => {
    clearPinterestUrl();
    location.reload();
  });

  toolbar.append(label, change);

  const widgetWrap = document.createElement("div");
  widgetWrap.className = "pinterest-widget-wrap";

  const anchor = document.createElement("a");
  anchor.href = normalized.href;
  anchor.dataset.pinDo = normalized.type === "board" ? "embedBoard" : "embedUser";
  anchor.dataset.pinScaleHeight = "1800";
  anchor.dataset.pinScaleWidth = "150";
  anchor.textContent = "Pinterest";

  widgetWrap.append(anchor);
  panel.append(toolbar, widgetWrap);

  renderedHref = normalized.href;
  loadPinterestScript();
}

function renderPinterest() {
  if (!panel) return;
  const normalized = normalizePinterestUrl(readPinterestUrl());
  if (!normalized) {
    renderedHref = "";
    buildSetup();
    return;
  }
  if (renderedHref === normalized.href && panel.childElementCount) return;
  buildWidget(normalized);
}

function syncMode() {
  if (!flowView || !panel || !gridShell) return;
  const active = readFilter() === "pinterest";
  flowView.classList.toggle("pinterest-mode", active);
  panel.classList.toggle("is-hidden", !active);
  if (active) renderPinterest();
}

window.addEventListener("velvet:flow-filter", () => queueMicrotask(syncMode));
document.querySelector("#clearAllButton")?.addEventListener("click", clearPinterestUrl);
syncMode();
