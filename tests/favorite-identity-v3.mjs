import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalMediaUrl, expandFavorite, unionMediaFavorites, mergeFavoriteDisplayRows } from "../src/favorite-identity-v3.js";
import { combineSyncStates, mergeSyncLibrary } from "../lib/velvet-sync-core.js";
import { planSharedFavoriteRecovery, normalizeRecoveryPairCode } from "../src/favorite-sync-recovery.js";
import { createFavoriteStore, CLIENT_PATHS, BASELINE_PATHS } from "../lib/velvet-sync-store-v3.js";
const fav = (id, image, page = "https://example.test/profile", source = "test") => ({ id, source, image_url: image, page_url: page });
const A = fav("a", "https://example.test/a.jpg");
const B = fav("b", "https://example.test/b.jpg");
const media = rows => new Set(rows.map(x => canonicalMediaUrl(x.image_url)).filter(Boolean));

test("regression: two different media at one page both survive", () => assert.equal(unionMediaFavorites([A], [B]).length, 2));
test("same post, multiple images are not duplicates", () => assert.equal(unionMediaFavorites([A], [{...B, page_url:A.page_url}]).length, 2));
test("same image under different labels collapses once", () => assert.equal(unionMediaFavorites([A], [{...A,id:"other",source:"other"}]).length, 1));
test("shared old ID cannot collapse different images", () => assert.equal(unionMediaFavorites([A], [{...B,id:"a",source:A.source}]).length, 2));
test("two sources with same ID and no media remain distinct", () => assert.equal(unionMediaFavorites([{id:"a",source:"x"}], [{id:"a",source:"y"}]).length, 2));
test("aliases are evidence, not instructions to unite media", () => {
  const alias = {ids:["a","b"],fingerprints:["p:"+A.page_url]};
  assert.equal(unionMediaFavorites([{...A,aliases:alias}], [{...B,aliases:alias}]).length,2);
});
test("historical media_urls are expanded without inventing images", () => {
  const rows = expandFavorite({...A, aliases:{ids:["a","b"],media_urls:[A.image_url,B.image_url]}});
  assert.deepEqual(media(rows),media([A,B]));
  assert.ok(rows.every(x=>x.recovery_split));
  assert.ok(rows.find(x=>x.image_url===B.image_url).recovery_evidence.page_association_unverified);
});
test("historical m: fingerprints are recovered independently", () => {
  const rows = expandFavorite({...A, aliases:{fingerprints:["m:"+B.image_url]}});
  assert.equal(rows.length,2);
});
test("expanded groups never re-collapse on a second sync", () => {
  const first = unionMediaFavorites([], [{...A,aliases:{media_urls:[A.image_url,B.image_url]}}]);
  assert.deepEqual(unionMediaFavorites(first,first), first);
});
test("unknown host token remains identity, not blanket-stripped", () => {
  const rows = unionMediaFavorites([], [fav("a","https://example.test/image?token=a"), fav("b","https://example.test/image?token=b")]);
  assert.equal(rows.length,2);
});
test("tracking-only query difference deduplicates media", () => assert.equal(unionMediaFavorites([A],[{...A,id:"x",image_url:A.image_url+"?utm_source=test"}]).length,1));
test("twimg size variants deduplicate without discarding distinct files", () => {
  const root="https://pbs.twimg.com/media/sample?format=jpg&name=";
  assert.equal(unionMediaFavorites([], [fav("a",root+"small"),fav("b",root+"large")]).length,1);
});
test("case-sensitive media paths remain distinct", () => assert.notEqual(canonicalMediaUrl("https://a.test/A.jpg"),canonicalMediaUrl("https://a.test/a.jpg")));
test("empty image_url falls back to camelCase URL", () => assert.equal(expandFavorite({id:"a",image_url:"",imageURL:A.image_url})[0].image_url,A.image_url));
test("thumbnail-only favorite remains renderable", () => assert.equal(mergeFavoriteDisplayRows([], [{id:"a",image_url:"",thumb_url:A.image_url}])[0].image_url,A.image_url));
test("metadata-only record remains a placeholder, not silently filtered", () => assert.equal(mergeFavoriteDisplayRows([], [{id:"a",source:"s"}]).length,1));
test("local favorite ID preserved when media matches", () => assert.equal(mergeFavoriteDisplayRows([A],[{...A,id:"shared-a"}])[0].id,"a"));
test("shared-only favorite displays without a catalog or liked-ID mapping", () => assert.equal(mergeFavoriteDisplayRows([], [A,B]).length,2));
test("source label is retained for TG display", () => assert.equal(expandFavorite({...A,sourceLabel:"TG裏垢"})[0].source_label,"TG裏垢"));
test("replay of same normalized library is idempotent", () => {
  const one = mergeSyncLibrary({items:[],orphan_ids:[]},{favorites:[A],likedIds:["orphan"]},"pwa");
  const two = mergeSyncLibrary(one,{favorites:[A],likedIds:["orphan"]},"pwa");
  assert.equal(two.changed,false);
});
test("empty incoming favorites never delete old records", () => assert.equal(mergeSyncLibrary({items:[A,B],orphan_ids:[]},{favorites:[]},"pwa").items.length,2));
test("more than the old server and orphan limits are preserved", () => {
  const rows=Array.from({length:1005},(_,i)=>fav(String(i),`https://example.test/${i}.jpg`));
  const orphans=Array.from({length:1205},(_,i)=>"orphan-"+i);
  const r=mergeSyncLibrary({items:[],orphan_ids:[]},{favorites:rows,likedIds:orphans},"scriptable");
  assert.equal(r.items.length,1005);assert.equal(r.orphan_ids.length,1205);
});
test("PWA planner does not discard existing IDs above 400", () => {
  const old=Array.from({length:450},(_,i)=>"old-"+i);
  const r=planSharedFavoriteRecovery({payload:{items:[A,B],orphan_ids:["meta"]},currentLikedIds:old,catalog:[A]});
  assert.equal(r.likedIds.length,453);assert.ok(old.every(x=>r.likedIds.includes(x)));
});
test("PWA planner does not match distinct images through their page", () => assert.equal(planSharedFavoriteRecovery({payload:{items:[A,B],orphan_ids:[]},catalog:[A]}).archiveItems.length,2));
test("legacy plus both clients is a media UNION", () => {
  const r=combineSyncStates([{state:{items:[A],orphan_ids:["a0"],revision:1}},{state:{items:[B],orphan_ids:["b0"],revision:2}}]);
  assert.equal(r.items.length,2);assert.equal(r.revision,3);assert.equal(r.orphan_ids.length,2);
});
test("malformed response is rejected before planning writes", () => assert.throws(()=>planSharedFavoriteRecovery({payload:{items:[]}})));
test("pairing JSON and surrounding whitespace remain supported", () => {
  const code="ABCD-ef12-GH34-ij56-KL78-mn90-OP12-qr34";
  assert.equal(normalizeRecoveryPairCode(JSON.stringify({pair_code:code})),code);
});

function mockStore(initial = {}) {
  const values = new Map(Object.entries(initial).map(([p,state])=>[p,{state,etag:'"1"'}]));
  const writes=[]; let n=1;
  const sdk={
    async get(path, options) {
      assert.equal(options.useCache,false);
      const row=values.get(path); if(!row)return null;
      return {statusCode:200,stream:new Response(JSON.stringify(row.state)).body,blob:{etag:row.etag}};
    },
    async put(path, body, options) {
      const prev=values.get(path); writes.push({path,options});
      if ((prev && (!options.allowOverwrite || options.ifMatch!==prev.etag)) || (!prev && options.ifMatch)) throw Object.assign(new Error("precondition"),{statusCode:412});
      values.set(path,{state:JSON.parse(body),etag:'"'+(++n)+'"'});
    },
    pause:async()=>{}
  };
  return {sdk,values,writes};
}
test("read-only legacy recovery performs zero writes",async()=>{
  const m=mockStore({[BASELINE_PATHS[0]]:{items:[{...A,aliases:{media_urls:[A.image_url,B.image_url]}}],orphan_ids:[]}});
  const r=await createFavoriteStore(m.sdk).readFavoriteLibrary();
  assert.equal(r.items.length,2);assert.equal(m.writes.length,0);
});
test("writes are isolated in v3; v1/v2 originals remain unchanged",async()=>{
  const original={items:[A],orphan_ids:[],revision:1}; const m=mockStore({[BASELINE_PATHS[1]]:original});
  const r=await createFavoriteStore(m.sdk).unionFavoriteLibrary({favorites:[B]},"pwa");
  assert.equal(r.items.length,2);assert.deepEqual(m.values.get(BASELINE_PATHS[1]).state,original);
  assert.ok(m.writes.every(x=>x.path.startsWith("velvet-sync/v3/clients/")));
});
test("concurrent same-client additions converge instead of last-writer loss",async()=>{
  const m=mockStore(); const api=createFavoriteStore(m.sdk);
  await Promise.all([api.unionFavoriteLibrary({favorites:[A]},"pwa"),api.unionFavoriteLibrary({favorites:[B]},"pwa")]);
  assert.equal((await api.readFavoriteLibrary()).items.length,2);
});
test("an existing snapshot without ETag is never overwritten",async()=>{
  const m=mockStore({[CLIENT_PATHS.pwa]:{items:[A],orphan_ids:[]}});m.values.get(CLIENT_PATHS.pwa).etag=null;
  await assert.rejects(createFavoriteStore(m.sdk).unionFavoriteLibrary({favorites:[B]},"pwa"),/Missing ETag/);assert.equal(m.writes.length,0);
});
test("invalid stored data fails closed, not coerced to empty",async()=>{
  const m=mockStore({[CLIENT_PATHS.pwa]:{items:"broken",orphan_ids:[]}});
  await assert.rejects(createFavoriteStore(m.sdk).unionFavoriteLibrary({favorites:[B]},"pwa"),/Invalid favorite/);assert.equal(m.writes.length,0);
});
test("exhausted CAS retries preserve prior state and return conflict",async()=>{
  const original={items:[A],orphan_ids:[]};const m=mockStore({[CLIENT_PATHS.pwa]:original});
  m.sdk.put=async()=>{throw Object.assign(new Error("precondition"),{statusCode:412})};
  await assert.rejects(createFavoriteStore(m.sdk).unionFavoriteLibrary({favorites:[B]},"pwa"),e=>e.statusCode===409);
  assert.deepEqual(m.values.get(CLIENT_PATHS.pwa).state,original);
});
