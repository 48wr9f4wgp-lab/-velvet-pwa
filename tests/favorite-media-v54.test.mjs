import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMediaStore, createMediaHandler, mediaRecordKey, mediaDeliveryUrl, hydrateMediaState, readBounded, sha256, MAX_MEDIA_BYTES } from "../lib/velvet-private-media.js";
import { combineSyncStates } from "../lib/velvet-sync-core.js";
import { planSharedFavoriteRecovery } from "../src/favorite-sync-recovery.js";
import { mergeFavoriteDisplayRows } from "../src/favorite-live-sync.js";

const JPEG=Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDzGiiigD//2Q==","base64"), OTHER=Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDWooooA//Z","base64");
const row={source:"local",id:"missing-1",page_url:"https://example.test/profile",image_url:""};
const key=mediaRecordKey(row);
let seq=0;
function setup(items=[row]) {
  const data=new Map(),writes=[];
  const sdk={
    async get(path,opts) {
      assert.equal(opts.access,"private");
      return data.has(path)?{statusCode:200,stream:new Response(data.get(path)).body}:null;
    },
    async list({prefix}) { return {blobs:[...data.keys()].filter(x=>x.startsWith(prefix)).map(pathname=>({pathname})),hasMore:false}; },
    async put(path,bytes,opts) {
      assert.equal(opts.access,"private");assert.equal(opts.allowOverwrite,false);assert.equal(opts.addRandomSuffix,false);
      if(data.has(path))throw new Error("exists");
      data.set(path,Buffer.from(bytes));writes.push(path);return {pathname:path};
    }
  };
  const store=createMediaStore(sdk),readLibrary=async()=>({items,orphan_ids:[]});
  const authorize=async req=>req.headers.get("authorization")==="Bearer fake-test"||req.headers.get("cookie")==="session=fake-test";
  return {data,writes,sdk,store,readLibrary,handler:createMediaHandler({store,readLibrary,authorize})};
}
function req(keyArg=key,body=JPEG,headers={}) {
  return new Request("https://velvet-pwa-wine.vercel.app/api/favorite-media?key="+keyArg,{
    method:"POST",headers:{"authorization":"Bearer fake-test","content-type":"image/jpeg","x-velvet-content-sha256":sha256(body),...headers},body});
}
async function uploaded() {const h=setup();assert.equal((await h.handler(req())).status,200);return h;}
test("unauthenticated upload is rejected before storage access",async()=>{
  const h=setup();assert.equal((await h.handler(req(key,JPEG,{authorization:""}))).status,401);assert.equal(h.writes.length,0);
});
test("unauthenticated private image and metadata cannot be read",async()=>{
  const h=await uploaded();
  for(const tail of ["","&meta=1"])assert.equal((await h.handler(new Request(mediaDeliveryUrl(key)+tail))).status,401);
});
test("unknown IDs do not create image objects",async()=>{
  const h=setup();assert.equal((await h.handler(req("b".repeat(64)))).status,409);assert.equal(h.writes.length,0);
});
test("a record with existing media is not overwritten",async()=>{
  const h=setup([{...row,image_url:"https://example.test/already.jpg"}]);
  assert.equal((await h.handler(req())).status,409);assert.equal(h.writes.length,0);
});
test("upload must match client SHA256",async()=>{
  const h=setup();assert.equal((await h.handler(req(key,JPEG,{"x-velvet-content-sha256":"c".repeat(64)}))).status,400);assert.equal(h.writes.length,0);
});
test("non-JPEG content is rejected",async()=>{
  const h=setup();assert.equal((await h.handler(req(key,Buffer.from("<svg>not accepted</svg>")))).status,415);assert.equal(h.writes.length,0);
});
test("oversized binary body is rejected without writes",async()=>{
  const h=setup();assert.equal((await h.handler(req(key,Buffer.alloc(MAX_MEDIA_BYTES+1)))).status,413);assert.equal(h.writes.length,0);
});
test("cross-origin writes are rejected",async()=>{
  const h=setup();assert.equal((await h.handler(req(key,JPEG,{origin:"https://other.test"}))).status,403);assert.equal(h.writes.length,0);
});
test("JPEG is retained privately and read back byte-for-byte",async()=>{
  const h=setup(),res=await h.handler(req()),r=await res.json();
  assert.equal(res.status,200);assert.equal(r.verified,true);assert.equal(r.sha256,sha256(JPEG));assert.equal(r.bytes,JPEG.length);
  assert.equal(h.writes.length,2);assert.ok(h.writes.every(x=>x.startsWith("velvet-sync/v54/")));
  const got=await h.handler(new Request(r.image_url,{headers:{cookie:"session=fake-test"}}));
  assert.equal(got.status,200);assert.match(got.headers.get("cache-control"),/private, no-store/);
  assert.equal(got.headers.get("cross-origin-resource-policy"),"same-origin");
  assert.deepEqual(Buffer.from(await got.arrayBuffer()),JPEG);
});
test("equal re-run does not create or overwrite any extra object",async()=>{
  const h=await uploaded();const old=[...h.data].map(([k,v])=>[k,v.toString("hex")]);
  const r=await (await h.handler(req())).json();assert.equal(r.created,false);
  assert.deepEqual([...h.data].map(([k,v])=>[k,v.toString("hex")]),old);assert.equal(h.writes.length,2);
});
test("different bytes for an already bound ID are rejected without overwriting",async()=>{
  const h=await uploaded();const prior=[...h.data].map(([k,v])=>[k,v.toString("hex")]);
  assert.equal((await h.handler(req(key,OTHER))).status,409);
  assert.deepEqual([...h.data].map(([k,v])=>[k,v.toString("hex")]),prior);
});
test("concurrent equal uploads converge without loss",async()=>{
  const h=setup();const results=await Promise.all([h.handler(req()),h.handler(req())]);
  assert.ok(results.every(x=>x.status===200));assert.equal(h.data.size,2);
});
test("corrupt stored image is detected and not repaired over original",async()=>{
  const h=await uploaded(),path=h.writes.find(x=>x.endsWith(".jpg"));h.data.set(path,OTHER);
  assert.equal((await h.handler(req())).status,500);assert.deepEqual(h.data.get(path),OTHER);
});
test("failed image persistence cannot create a visible index",async()=>{
  const h=setup();h.sdk.put=async()=>{throw new Error("store unavailable")};
  const store=createMediaStore(h.sdk);
  await assert.rejects(store.upload(key,JPEG,sha256(JPEG),h.readLibrary));
  assert.equal(h.data.size,0);
});
test("mapping load errors fail closed",async()=>{
  const h=await uploaded();h.data.set(h.writes.find(x=>x.endsWith(".json")),Buffer.from("{}"));
  await assert.rejects(h.store.readRepairs());
});
test("44 missing rows hydrate while 153 existing rows remain unchanged",async()=>{
  const missing=Array.from({length:44},(_,i)=>({...row,id:"miss-"+i}));
  const present=Array.from({length:153},(_,i)=>({id:"keep-"+i,source:"pwa",image_url:"https://media.example.test/"+i+".jpg"}));
  const state={items:[...missing,...present],orphan_ids:["orphan"]};
  const original=JSON.stringify(state),repairs=new Map(missing.map(r=>[mediaRecordKey(r),{}]));
  const result=hydrateMediaState(state,repairs);
  const combined=combineSyncStates([{state:result}]);
  const plan=planSharedFavoriteRecovery({payload:combined,catalog:[]});
  const display=mergeFavoriteDisplayRows([],plan.archiveItems);
  assert.equal(combined.items.length,197);assert.equal(display.length,197);
  assert.equal(JSON.stringify(state),original);
  assert.deepEqual(result.items.slice(44),present);assert.ok(combined.orphan_ids.includes("orphan"));
});
test("same profile still does not merge different private record images",()=>{
  const rows=[row,{...row,id:"missing-2"}],repairs=new Map(rows.map(r=>[mediaRecordKey(r),{}]));
  const result=combineSyncStates([{state:hydrateMediaState({items:rows,orphan_ids:[]},repairs)}]);
  assert.equal(result.items.length,2);
});
test("mapping for same raw ID but another source does not attach",()=>{
  const repairs=new Map([[mediaRecordKey({...row,source:"other"}),{}]]);
  assert.equal(hydrateMediaState({items:[row]},repairs).items[0].image_url,"");
});
test("stable media record key rejects empty or oversized identity",()=>{
  assert.throws(()=>mediaRecordKey({id:"a",source:""}));assert.throws(()=>mediaRecordKey({source:"a",id:"x".repeat(513)}));
});
test("served metadata contains no private blob pathname or credential",async()=>{
  const h=await uploaded(),res=await h.handler(new Request(mediaDeliveryUrl(key)+"&meta=1",{headers:{authorization:"Bearer fake-test"}}));
  const text=await res.text();assert.ok(!text.includes("media-bytes"));assert.ok(!text.includes("fake-test"));
});
test("protected media bypasses unauthenticated caching on both cache paths",()=>{
  const sw=fs.readFileSync(new URL("../sw.js",import.meta.url),"utf8");
  const ar=fs.readFileSync(new URL("../src/favorite-archive.js",import.meta.url),"utf8");
  assert.match(sw,/pathname === "\/api\/favorite-media"\) return;/);
  assert.match(ar,/pathname === "\/api\/favorite-media"\) return false;/);
});
test("hydration precedes capacity validation for legacy clients",()=>{
  const s=fs.readFileSync(new URL("../lib/velvet-sync-journal.js",import.meta.url),"utf8");
  assert.ok(s.includes("favorites: hydrateMediaState({ items: document.payload.favorites }, repairs).items"));
  assert.ok(s.includes("hydrateMediaState(row.state, repairs)"));
});
