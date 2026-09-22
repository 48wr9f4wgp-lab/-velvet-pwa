import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import * as store from '../src/store.js';
import * as archive from '../src/favorite-archive.js';
import * as live from '../src/favorite-live-sync.js';
import { planSharedFavoriteRecovery, SHARED_FAVORITE_RECOVERY_KEY } from '../src/favorite-sync-recovery.js';
const STATE='velvet_private_v2_state', META='velvet_private_v49_5_favorite_archive_meta', VIEW='velvet_shared_favorites_v2_view';
function memory() {
 const values=new Map();let fail=null;
 const api={getItem:k=>values.get(k)??null,setItem(k,v){if(fail===k){fail=null;throw new Error('quota simulated');}values.set(k,String(v));},removeItem:k=>values.delete(k)};
 globalThis.localStorage=api;
 return {api,values,failOnce:k=>{fail=k;}};
}
const a={id:'local-a',source:'TGUra',source_label:'TG裏垢',image_url:'https://example.test/a.jpg',page_url:'https://example.test/profile'};
const b={id:'remote-b',source:'TGUra',source_label:'TG裏垢',image_url:'https://example.test/b.jpg',page_url:a.page_url};
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function section(begin,end){const a=app.indexOf(begin),b=app.indexOf(end,a+begin.length);assert.ok(a>=0&&b>a);return app.slice(a,b);}
function applyContext(mem) {
 const context={localStorage:mem.api,...store,...archive,...live,planSharedFavoriteRecovery,SHARED_FAVORITE_RECOVERY_KEY,
 state:store.loadState(),catalog:[],catalogReady:true,appUnlocked:true,
 window:{dispatchEvent:()=>{}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
 writeSharedFavoriteRecoveryMarker:()=>{},refreshFlowGrid:()=>{}};
 vm.createContext(context);vm.runInContext(section('function applySharedFavoritePayload(', 'async function ensureSharedFavoriteSession('),context);
 return context;
}
test('real PWA state keeps explicit favorites beyond 400',()=>{
 memory();const state=store.normalizeState({likedItemIds:Array.from({length:501},(_,i)=>'old'+i),settings:{historyMode:'off'}});
 const after=store.recordReaction(state,a,'like');assert.equal(after.likedItemIds.length,502);assert.equal(store.loadState().likedItemIds.length,502);
});
test('real archive retains older metadata beyond 400',()=>{
 memory();for(let i=0;i<405;i++)archive.archiveFavorite({...a,id:'old'+i});assert.equal(archive.getAllArchivedFavorites().length,405);assert.ok(archive.getArchivedFavorite('old0'));
});
test('shared view remains an additive store on empty responses',()=>{
 memory();live.saveSharedFavoriteView([a,b]);live.saveSharedFavoriteView([]);assert.equal(live.loadSharedFavoriteView().length,2);
});
test('corrupted shared view is never silently overwritten',()=>{
 const m=memory();m.api.setItem(VIEW,'broken');assert.throws(()=>live.saveSharedFavoriteView([b]));assert.equal(m.api.getItem(VIEW),'broken');
});
test('real PWA apply retains old favorites and archive while adding distinct same-page image',()=>{
 const m=memory();store.saveState(store.normalizeState({likedItemIds:[a.id],sourceWeights:{keep:2}}));archive.archiveFavorite(a);
 const c=applyContext(m);c.applySharedFavoritePayload({items:[b],orphan_ids:[]});
 assert.ok(store.loadState().likedItemIds.includes(a.id));assert.ok(archive.getArchivedFavorite(a.id));assert.deepEqual(store.loadState().sourceWeights,{keep:2});assert.equal(live.mergeFavoriteDisplayRows([a],live.loadSharedFavoriteView()).length,2);
 assert.ok(m.api.getItem('velvet_favorites_pre_identity_v3'));
});
test('quota failure after partial apply restores previous storage, without success marker',()=>{
 const m=memory();store.saveState(store.normalizeState({likedItemIds:[a.id]}));archive.archiveFavorite(a);live.saveSharedFavoriteView([a]);
 const before=[STATE,META,VIEW,SHARED_FAVORITE_RECOVERY_KEY].map(k=>[k,m.api.getItem(k)]);const c=applyContext(m);m.failOnce(VIEW);
 assert.throws(()=>c.applySharedFavoritePayload({items:[b],orphan_ids:[]}),/quota simulated/);
 for(const [key,value] of before)assert.equal(m.api.getItem(key),value,key);assert.ok(m.api.getItem('velvet_favorites_pre_identity_v3'));
});
test('small favorite grids terminate instead of infinite append loops',()=>{
 for(const count of [0,1,5,11,12]){
 let calls=0;
 const c={els:{flowGrid:{classList:{toggle(){}},replaceChildren(){}},flowGridShell:{}},flowMode:'favorites',flowGridRendered:12,flowGridItems:[],FLOW_GRID_BATCH:12,
 flowListItems:()=>Array.from({length:count},()=>a),appendFlowGridBatch(){calls++;if(calls>3)throw new Error('non-terminating grid');c.flowGridRendered=Math.min(c.flowGridRendered+12,c.flowGridItems.length);},updateFlowGridStatus(){},preloadImages(){}};
 vm.createContext(c);vm.runInContext(section('function refreshFlowGrid(', 'function syncFlowGridFavoriteStates('),c);c.refreshFlowGrid({preserveCount:true});assert.equal(c.flowGridRendered,count);
 }
});
test('Favorites badge uses retained source label without changing ordinary feed labels',()=>{
 const c={flowMode:'favorites'};vm.createContext(c);vm.runInContext(section('function gridSourceLabel(', 'function buildFlowGridCard('),c);assert.equal(c.gridSourceLabel(a),'TG裏垢');c.flowMode='personal';assert.equal(c.gridSourceLabel({...a,source_class:'personal'}),'素人');
});
