import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { unionFavorites, mergeSyncLibrary } from '../lib/velvet-sync-core.js';
import { planSharedFavoriteRecovery } from '../src/favorite-sync-recovery.js';
import { mergeFavoriteDisplayRows, saveSharedFavoriteView, SHARED_FAVORITE_VIEW_KEY } from '../src/favorite-live-sync.js';
const row = (id, image = id) => ({ id, source: 'test', page_url: 'https://example.test/profile', image_url: 'https://media.example.test/' + image + '.jpg' });
let sequence = 0;
async function storeHarness() {
  const data = new Map(); const writes = [];
  const sdk = {
    async get(path) { return data.has(path) ? { statusCode: 200, stream: new Response(data.get(path)).body } : null; },
    async list({prefix}) { return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(pathname => ({pathname})), hasMore: false }; },
    async put(path, text, options) {
      assert.equal(options.access, 'private'); assert.equal(options.allowOverwrite, false);
      assert.ok(path.startsWith('velvet-sync/v53/input/'));
      if (data.has(path)) throw new Error('already exists');
      data.set(path, text); writes.push({path, options}); return { pathname: path };
    }
  };
  globalThis.__v53Mock = sdk;
  const code = fs.readFileSync(new URL('../lib/velvet-sync-journal.js', import.meta.url), 'utf8')
    .replace('import { get, put, list } from "@vercel/blob";', 'const {get, put, list} = globalThis.__v53Mock;')
    .replace('"./velvet-sync-core.js"', JSON.stringify(new URL('../lib/velvet-sync-core.js', import.meta.url).href));
  const module = await import('data:text/javascript;base64,' + Buffer.from(code + '\n// case ' + sequence++).toString('base64'));
  delete globalThis.__v53Mock;
  return { ...module, data, writes };
}
test('legacy aliases are not offered to Scriptable as verified image-ID matches', () => {
  const a = row('a'), b = row('b');
  const poisoned = { ...a, aliases: { ids: ['a','b'], media_urls: [a.image_url,b.image_url], fingerprints: ['p:'+a.page_url] } };
  const result = unionFavorites([poisoned],[b],'scriptable');
  const first = result.find(x=>x.image_url === a.image_url);
  assert.ok(!first.aliases.ids.includes('b')); assert.ok(first.legacy_aliases.ids.includes('b'));
});
test('colliding IDs get distinct safe primary IDs and no ambiguous active aliases',()=>{
  const result=unionFavorites([row('same','a')],[row('same','b')],'scriptable');
  assert.equal(result.length,2);assert.equal(new Set(result.map(x=>x.id)).size,2);
  for(const r of result)assert.ok(!r.aliases.ids.includes('same'));
});
test('server capacity violation aborts rather than returning truncated data',()=>{
  assert.throws(()=>unionFavorites([],Array.from({length:1001},(_,i)=>row('n'+i)),'test'),/capacity/);
});
test('PWA plan capacity aborts before caller can write local storage',()=>{
  assert.throws(()=>planSharedFavoriteRecovery({payload:{items:[row('extra')],orphan_ids:[]},currentLikedIds:Array.from({length:400},(_,i)=>'old'+i)}),/上限/);
});
test('display capacity reports an error rather than silently hiding records',()=>{
  assert.throws(()=>mergeFavoriteDisplayRows([],Array.from({length:401},(_,i)=>row('x'+i))),/capacity/);
});
test('shared view storage failure is surfaced',()=>{
  globalThis.localStorage={getItem(){return null},setItem(){throw new Error('quota')}};
  assert.throws(()=>saveSharedFavoriteView([row('a')]),/quota/);delete globalThis.localStorage;
});
test('shared view snapshot is retained before update and is not overwritten on replay',()=>{
  const values=new Map([[SHARED_FAVORITE_VIEW_KEY,'[{"id":"old"}]']]);
  globalThis.localStorage={getItem(k){return values.get(k)??null},setItem(k,v){values.set(k,String(v))}};
  saveSharedFavoriteView([row('a')]);saveSharedFavoriteView([row('b')]);
  assert.equal(values.get(SHARED_FAVORITE_VIEW_KEY+'_pre_v53'),'[{"id":"old"}]');delete globalThis.localStorage;
});
test('legacy cloud snapshot bytes are never changed by recovery',async()=>{
  const h=await storeHarness(),key='velvet-sync/v2/clients/pwa.json';
  const original=JSON.stringify({items:[row('pwa-only')],orphan_ids:['orphan'],revision:1});h.data.set(key,original);
  const result=await h.unionFavoriteLibrary({favorites:[row('script')],likedIds:['script']},'recovery');
  assert.equal(h.data.get(key),original);assert.equal(result.items.length,2);assert.ok(result.orphan_ids.includes('orphan'));
  assert.equal(result.receipt_verified,true);assert.equal(result.identity_version,53);
});
test('repeated identical import produces one immutable journal object',async()=>{
  const h=await storeHarness(),payload={favorites:[row('a')],likedIds:['a']};
  await h.unionFavoriteLibrary(payload,'recovery');const result=await h.unionFavoriteLibrary(payload,'recovery');
  assert.equal(h.writes.length,1);assert.equal(result.client_write_performed,false);assert.equal(result.items.length,1);
});
test('concurrent distinct client writes both survive subsequent reads',async()=>{
  const h=await storeHarness();
  await Promise.all(['a','b'].map(id=>h.unionFavoriteLibrary({favorites:[row(id)],likedIds:[id]},'pwa')));
  assert.equal((await h.readFavoriteLibrary()).items.length,2);assert.equal(h.writes.length,2);
});
test('concurrent identical submissions are verified without overwriting',async()=>{
  const h=await storeHarness(),payload={favorites:[row('same')],likedIds:['same']};
  await Promise.all([h.unionFavoriteLibrary(payload,'pwa'),h.unionFavoriteLibrary(payload,'pwa')]);
  assert.equal(h.writes.length,1);assert.equal((await h.readFavoriteLibrary()).items.length,1);
});
test('corrupt existing cloud state blocks recovery writes',async()=>{
  const h=await storeHarness();h.data.set('velvet-sync/v2/clients/pwa.json','{"not":"a state"}');
  await assert.rejects(h.unionFavoriteLibrary({favorites:[row('a')],likedIds:['a']},'recovery'));assert.equal(h.writes.length,0);
});
test('legacy Scriptable capacity is checked before any new journal write',async()=>{
  const h=await storeHarness();h.data.set('velvet-sync/v1/favorites.json',JSON.stringify({items:[row('extra')],orphan_ids:[]}));
  const favorites=Array.from({length:240},(_,i)=>row('old'+i));
  await assert.rejects(h.unionFavoriteLibrary({favorites,likedIds:favorites.map(x=>x.id)},'scriptable'),/capacity/);assert.equal(h.writes.length,0);
});
test('URL-less records remain metadata, not a fabricated inherited media URL',()=>{
  const result=mergeSyncLibrary({items:[],orphan_ids:[]},{favorites:[{id:'meta',source:'local',aliases:{media_urls:['https://media.example.test/other.jpg']}}],likedIds:['meta']},'scriptable');
  assert.equal(result.items[0].image_url,'');assert.equal(result.items.length,1);
});
