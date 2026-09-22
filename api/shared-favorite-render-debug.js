import { get } from "@vercel/blob";
import { combineSyncStates } from "../lib/velvet-sync-core.js";
import { planSharedFavoriteRecovery } from "../src/favorite-sync-recovery.js";
const PATH="velvet-sync/v2/clients/scriptable.json";
const PWA_PATH="velvet-sync/v2/clients/pwa.json";
const LEGACY_PATH="velvet-sync/v1/favorites.json";
function domain(u){try{return new URL(String(u||"")).hostname.toLowerCase()}catch(_){return""}}
async function readPath(path){
  const r=await get(path,{access:"private",useCache:false});
  if(!r)return {items:[],orphan_ids:[],revision:0};
  return JSON.parse(await new Response(r.stream).text());
}
async function read(){ return readPath(PATH); }
export default {
  async fetch(request){
    const [s,p,l]=await Promise.all([readPath(PATH),readPath(PWA_PATH),readPath(LEGACY_PATH)]);
    const combined=combineSyncStates([
      {source:"legacy",state:l},
      {source:"scriptable",state:s},
      {source:"pwa",state:p}
    ]);
    const feedRes=await fetch(new URL("/velvet-content.json",request.url),{cache:"no-store"});
    const feed=await feedRes.json();
    const catalog=Array.isArray(feed.items)?feed.items:[];
    const currentLiked=[...new Set([
      ...(Array.isArray(p.orphan_ids)?p.orphan_ids:[]),
      ...(Array.isArray(p.items)?p.items.flatMap(x=>[x?.id,...(Array.isArray(x?.aliases?.ids)?x.aliases.ids:[])]):[])
    ].filter(Boolean).map(String))];
    const plan=planSharedFavoriteRecovery({payload:combined,currentLikedIds:currentLiked,catalog});
    const items=Array.isArray(s.items)?s.items:[];
    const domains={};
    for(const x of items){
      const d=domain(x.image_url);
      if(d) domains[d]=(domains[d]||0)+1;
    }
    const sample=items.filter(x=>x&&x.image_url).slice(0,8);
    const checks=[];
    for(const x of sample){
      try{
        const res=await fetch(x.image_url,{method:"GET",redirect:"follow",headers:{"User-Agent":"Mozilla/5.0","Accept":"image/avif,image/webp,image/apng,image/*,*/*;q=0.8"}});
        checks.push({domain:domain(x.image_url),status:res.status,ok:res.ok,type:res.headers.get("content-type")||""});
        try{await res.body?.cancel()}catch(_){}
      }catch(e){checks.push({domain:domain(x.image_url),status:0,ok:false,error:String(e).slice(0,100)})}
    }
    return Response.json({
      scriptable_items:items.length,
      combined_items:combined.items.length,
      combined_orphans:combined.orphan_ids.length,
      reconstructed_current_liked:currentLiked.length,
      plan:{
        liked_ids:plan.likedIds.length,
        archive_items:plan.archiveItems.length,
        recovered_visible:plan.recoveredVisibleCount,
        represented_remote_ids:plan.representedRemoteIdCount,
        added_local_ids:plan.addedLocalIds
      },
      domains,
      checks
    },{headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex"}});
  }
};