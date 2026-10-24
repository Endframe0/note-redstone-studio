'use strict';
const {transform,measure}=require('./parallel-layout.cjs'),{fits}=require('./objective.cjs');
// Conservative physical separation. Keep all occupied cells and external pulse
// positions at least one empty Chebyshev layer apart, including vertical dust
// connections. This is not a simulator for the timer's internal circuitry.
function packScheduledBank(bus,bank,opt={}){
 function exclusion(m){const out=new Set();for(const p of [...m.blocks.map(b=>b.position),...m.inputs.map(i=>i.wire)])for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)out.add([p[0]+x,p[1]+y,p[2]+z].join());return out}
 const forbidden=exclusion(bus),modules=bank.specs.map(s=>require('./scheduled-repeat.cjs').designScheduledRepeat(s));
 function* placements(module,blocked){for(let rotation=0;rotation<4;rotation++){
  const b=transform(module,{rotation}),min=b.bounds.map(v=>v[0]),size=b.dimensions,relative=[...b.blocks.map(v=>v.position),...b.inputs.map(i=>i.wire)].map(p=>p.map((v,i)=>v-min[i]));
  // Prefer existing voids, especially the partially filled final layer.
  for(let y=bus.bounds[1][1]-size[1]+1;y>=bus.bounds[1][0];y--)for(let z=bus.bounds[2][1]-size[2]+1;z>=bus.bounds[2][0];z--)for(let x=bus.bounds[0][0];x<=bus.bounds[0][1]-size[0]+1;x++){
   if(relative.some(p=>blocked.has([x+p[0],y+p[1],z+p[2]].join())))continue;
   const placed=transform(b,{offset:[x-min[0],y-min[1],z-min[2]]});
   yield{placed,rotation,offset:[x-min[0],y-min[1],z-min[2]]};
  }
 }}
 let attempts=0;
 function pack(index,blocked,chosen){if(index===modules.length)return chosen;
  for(const p of placements(modules[index],blocked)){
   if(++attempts>256)return null;const next=new Set(blocked);for(const key of exclusion(p.placed))next.add(key);
   const result=pack(index+1,next,[...chosen,p]);if(result)return result;
  }return null;
 }
 const arranged=pack(0,forbidden,[]);if(!arranged)return null;const parts=arranged.map(a=>a.placed);
 const m=measure({blocks:[...bus.blocks,...parts.flatMap(p=>p.blocks)],notes:[...bus.notes,...parts.flatMap(p=>p.notes)],inputs:[...bus.inputs,...parts.flatMap(p=>p.inputs)],containers:parts.flatMap(p=>p.containers),connections:[],groups:[],clockSolids:[],rowInfo:[],branchMode:'bus-scheduled-rhythm-hybrid',template:'hybrid-reuse',hopperTimer:{experimental:true},hybridNetwork:true,bankPlacement:arranged.map(({rotation,offset})=>({rotation,offset})),busParams:bus.busParams,bankSpecs:bank.specs,safeRestartAfterTicks:bank.safeRestartAfterTicks});
 return fits(m.dimensions,opt)?m:null;
}
module.exports={packScheduledBank};
