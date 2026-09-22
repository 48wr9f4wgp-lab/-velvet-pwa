import { get } from "@vercel/blob";
const PATH="velvet-sync/v2/clients/scriptable.json";
function domain(u){try{return new URL(String(u||"")).hostname.toLowerCase()}catch(_){return""}}
async function read(){
  const r=await get(PATH,{access:"private",useCache:false});
  if(!r)return {items:[]};
  return JSON.parse(await new Response(r.stream).text());
}
export default {
  async fetch(){
    const s=await read();
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
    return Response.json({items:items.length,domains,checks},{headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex"}});
  }
};