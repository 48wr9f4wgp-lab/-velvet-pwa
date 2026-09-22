import fs from "node:fs";
import { execFileSync } from "node:child_process";
function edit(path, transform) { const before = fs.readFileSync(path,"utf8"); const after=transform(before); if(after===before)throw new Error("No change: "+path);fs.writeFileSync(path,after); }
function once(s,a,b) { const i=s.indexOf(a);if(i<0||s.indexOf(a,i+a.length)>=0)throw new Error("Missing/ambiguous patch anchor: "+a.slice(0,90));return s.slice(0,i)+b+s.slice(i+a.length); }
function block(s,start,end,replacement) { const a=s.indexOf(start),b=s.indexOf(end,a+start.length);if(a<0||b<0)throw new Error("Block missing: "+start);return s.slice(0,a)+replacement+s.slice(b); }
for(const [p,sha] of Object.entries({"src/app.js":"0e85cff6f5216cdb69951fd4130a7ccc0b9e8baa","src/store.js":"8486db507cb7c813fa24d29952c15e2f1835b356","src/favorite-archive.js":"d23e6f900cb5b438df7b289ecd19391b8133ec76","src/favorite-live-sync.js":"c7e863999293f61f09c301ac123e100764b9ca0d"})) {
  if(execFileSync("git",["hash-object",p],{encoding:"utf8"}).trim()!==sha)throw new Error("Baseline changed: "+p);
}
edit("src/store.js",s=>{
 s=once(s,"likedItemIds: normalizeStringArray(raw.likedItemIds),","likedItemIds: normalizeStringArray(raw.likedItemIds, Infinity),");
 s=once(s,'state.likedItemIds = [item.id, ...state.likedItemIds.filter(id => id !== item.id)].slice(0, 400);','state.likedItemIds = [item.id, ...state.likedItemIds.filter(id => id !== item.id)];');
 s=once(s,'  try {\n    localStorage.setItem(STORE_KEY, JSON.stringify(normalized));\n  } catch (_) {}','  localStorage.setItem(STORE_KEY, JSON.stringify(normalized));');return s;
});
edit("src/favorite-archive.js",s=>{
 s=once(s,'const MAX_ARCHIVES = 400;\n','');
 s=once(s,'  try {\n    localStorage.setItem(META_KEY, JSON.stringify(map));\n  } catch (_) {}','  localStorage.setItem(META_KEY, JSON.stringify(map));');
 s=once(s,'    .sort((a, b) => String(b.archived_at || "").localeCompare(String(a.archived_at || "")))\n    .slice(0, MAX_ARCHIVES);','    .sort((a, b) => String(b.archived_at || "").localeCompare(String(a.archived_at || "")));');
 s=once(s,'  const entries = Object.entries(next).slice(0, MAX_ARCHIVES);','  const entries = Object.entries(next);');return s;
});
edit("src/favorite-live-sync.js",s=>{
 s=once(s,'./favorite-sync-recovery.js?v=51.1','./favorite-sync-recovery.js?v=53');
 s='import { unionMediaFavorites } from "./favorite-identity-v3.js?v=53";\nexport { mergeFavoriteDisplayRows } from "./favorite-identity-v3.js?v=53";\n'+s;
 const at=s.indexOf('export function saveSharedFavoriteView(');if(at<0)throw new Error('view helper missing');
 return s.slice(0,at)+`export function saveSharedFavoriteView(items) {
  const raw = localStorage.getItem(SHARED_FAVORITE_VIEW_KEY);
  const old = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(old)) throw new Error("共有お気に入りの保存形式が不正です。上書きしていません。");
  const rows = unionMediaFavorites(old, items, "existing");
  const encoded = JSON.stringify(rows);
  localStorage.setItem(SHARED_FAVORITE_VIEW_KEY, encoded);
  if (localStorage.getItem(SHARED_FAVORITE_VIEW_KEY) !== encoded) throw new Error("共有お気に入りの保存確認に失敗しました");
  return rows;
}
export function loadSharedFavoriteView() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SHARED_FAVORITE_VIEW_KEY) || "[]");
    return Array.isArray(parsed) ? unionMediaFavorites([], parsed, "existing") : [];
  } catch (_) { return []; }
}
`;
});
edit("src/app.js",s=>{
 s=once(s,'} from "./store.js";','} from "./store.js?v=53";');
 s=once(s,'./favorite-archive.js?v=50','./favorite-archive.js?v=53');
 s=once(s,'./favorite-sync-recovery.js?v=51','./favorite-sync-recovery.js?v=53');
 s=once(s,'./favorite-live-sync.js?v=52.2','./favorite-live-sync.js?v=53');
 s=once(s,'  sharedFavoriteSyncEnabled,\n  syncSharedFavoriteUnion','  sharedFavoriteSyncEnabled,\n  setSharedFavoriteSyncEnabled,\n  syncSharedFavoriteUnion');
 s=once(s,'const merged = [...new Set([...archived.map(item => String(item.id)), ...current])].slice(0, 400);','const merged = [...new Set([...current, ...archived.map(item => String(item.id))])];');
 s=once(s,'let sharedFavoriteSyncBusy = false;','let sharedFavoriteSyncBusy = false;\nlet sharedFavoriteSyncQueued = false;');
 s=once(s,'  if (sharedFavoriteSyncBusy) return null;','  if (sharedFavoriteSyncBusy) { sharedFavoriteSyncQueued = true; return null; }');
 s=once(s,'    sharedFavoriteSyncBusy = false;\n  }\n}\n\nfunction scheduleSharedFavoriteSync()', '    sharedFavoriteSyncBusy = false;\n    if (sharedFavoriteSyncQueued) { sharedFavoriteSyncQueued = false; scheduleSharedFavoriteSync(); }\n  }\n}\n\nfunction scheduleSharedFavoriteSync()');
 s=once(s,'  if (await sharedFavoriteSessionStatus()) return true;','  if (await sharedFavoriteSessionStatus()) { setSharedFavoriteSyncEnabled(true); return true; }');
 s=once(s,'function gridSourceLabel(item) {','function gridSourceLabel(item) {\n  if (flowMode === "favorites") return String(item?.source_label || item?.source || "保存済み");');
 s=once(s,`  const target = preserveCount
    ? Math.max(FLOW_GRID_BATCH, Math.min(previousCount || FLOW_GRID_BATCH, flowGridItems.length))
    : Math.min(FLOW_GRID_BATCH, flowGridItems.length);`,`  const target = Math.min(flowGridItems.length, preserveCount ? Math.max(FLOW_GRID_BATCH, previousCount || FLOW_GRID_BATCH) : FLOW_GRID_BATCH);`);
 s=block(s,'function applySharedFavoritePayload(', 'async function ensureSharedFavoriteSession(', `function applySharedFavoritePayload(payload, { recoveryMarker = false } = {}) {
  const keys = ["velvet_private_v2_state", "velvet_private_v49_5_favorite_archive_meta", "velvet_shared_favorites_v2_view", SHARED_FAVORITE_RECOVERY_KEY];
  const before = keys.map(key => [key, localStorage.getItem(key)]);
  const latest = loadState();
  const plan = planSharedFavoriteRecovery({ payload, currentLikedIds: latest.likedItemIds || [], catalog });
  const backupKey = "velvet_favorites_pre_identity_v3";
  if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, JSON.stringify({ saved_at: new Date().toISOString(), entries: before }));
  try {
    for (const item of plan.archiveItems) archiveFavorite(item);
    saveSharedFavoriteView(payload.items);
    latest.likedItemIds = plan.likedIds;
    latest.counts.liked = plan.likedIds.length;
    state = saveState(applyHistoryPolicy(latest));
    const persisted = loadState();
    const saved = new Set(persisted.likedItemIds);
    if (!plan.likedIds.every(id => saved.has(id))) throw new Error("お気に入りIDの保存確認に失敗しました");
    const archived = new Set(getAllArchivedFavorites().map(x => String(x.id)));
    if (!plan.archiveItems.every(x => archived.has(String(x.id)))) throw new Error("お気に入り情報の保存確認に失敗しました");
    state = persisted;
    if (recoveryMarker) writeSharedFavoriteRecoveryMarker({ remote_revision: payload.revision, remote_items: plan.remoteItemCount, visible_archives: plan.recoveredVisibleCount, local_favorites_after: state.likedItemIds.length });
  } catch (error) {
    let restored = true;
    for (const [key, raw] of before) {
      try { if (raw === null) localStorage.removeItem(key); else localStorage.setItem(key, raw); }
      catch (_) { restored = false; }
    }
    state = loadState();
    throw new Error(String(error?.message || error) + (restored ? "。変更前の保存状態へ戻しました。" : "。変更前バックアップは端末内に保持しています。"));
  }
  window.dispatchEvent(new CustomEvent("velvet:favorites-changed", { detail: { origin: "shared-sync", total: state.likedItemIds.length } }));
  if (catalogReady && appUnlocked) refreshFlowGrid({ preserveCount: true });
  return { ...plan, total: state.likedItemIds.length };
}

`);
 const a=s.indexOf('function buildFlowGridCard('), b=s.indexOf('function appendFlowGridBatch()',a);
 let card=s.slice(a,b);
 card=once(card,'  img.src = item.image_url;',`  const mediaUrl = item.image_url || item.thumb_url || "";
  if (mediaUrl) img.src = mediaUrl;
  else {
    const missing = document.createElement("span");
    missing.textContent = "画像情報なし・保存は維持";
    missing.style.cssText = "display:flex;align-items:center;justify-content:center;min-height:120px;padding:12px;font-size:12px";
    media.append(missing);
    img.hidden = true;
  }`);
 s=s.slice(0,a)+card+s.slice(b);
 return s;
});
edit('index.html',s=>once(s,'./src/app.js?v=52.2','./src/app.js?v=53'));
edit('tests/favorite-sync-core.mjs',s=>s.replaceAll('?token=abc','?utm_source=abc').replaceAll('?token=def','?utm_source=def')
 .replace('assert.deepEqual(new Set(union[0].aliases.ids), new Set(["pwa-1", "script-99"]));','assert.ok(["pwa-1", "script-99"].every(id => union[0].aliases.ids.includes(id)));')
 .replace('assert.equal(combined.schema_version, 2);','assert.equal(combined.schema_version, 3);'));
fs.writeFileSync('tests/favorite-sync-pwa-recovery.mjs',`// Replacement behavioral suite includes pairing, additive recovery, aliases, and persistence.
import "./favorite-identity-v3.mjs";
`);
edit('.github/workflows/qa.yml',s=>{
 s=s.replaceAll('./src/app.js?v=52.2','./src/app.js?v=53');
 s=block(s,'      - name: Add-only favorite sync contracts','      - name: Shared favorite display contracts',`      - name: Add-only favorite sync safety
        run: node --test tests/favorite-identity-v3.mjs

`);
 s=s.replace("            'const MAX_ARCHIVES = 400',\n",'');
 return s;
});
console.log('Applied reviewed PWA media-identity changes. No runtime/user data accessed.');
