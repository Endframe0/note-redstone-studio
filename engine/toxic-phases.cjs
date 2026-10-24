'use strict';
const {merge,transform}=require('./parallel-layout.cjs');
function design(song,opt={},progress=()=>{}){
 const twenty=Number(opt.timeResolution??10)===20;
 const phases=twenty?[...new Set(song.notes.map(n=>Math.round(n.tick*2)%2))].sort():[0];
 const maxLayers=phases.length===2?12:25,perStripe=56*3*maxLayers;
 const peak=Math.max(...song.events.map(e=>e.notes.length)),stripes=Math.max(1,Math.ceil(peak/perStripe));
 if(stripes>3)throw Error(`毒曲 100×100 截面当前支持每刻最多 ${perStripe*3} 音，本曲 ${peak} 音；不会删音。`);
 const streams=[];
 for(const phase of phases)for(let stripe=0;stripe<stripes;stripe++){
  const notes=[];
  for(const e of song.events){if(twenty&&Math.round(e.tick*2)%2!==phase)continue;e.notes.forEach((n,j)=>{if(j%stripes===stripe)notes.push({...n,sourceMusicTick:n.tick,tick:twenty?(n.tick*2-phase)/2:n.tick})})}
  if(!notes.length)continue;
  const gm=new Map();for(const n of notes){if(!gm.has(n.tick))gm.set(n.tick,[]);gm.get(n.tick).push(n)}
  const p=Math.max(...[...gm.values()].map(ns=>ns.length)),banks=Math.min(3,Math.max(1,Math.ceil(p/560))),layers=Math.ceil(p/(56*banks));
  if(layers>maxLayers)throw Error('毒曲分轨层数超过截面限制');
  streams.push({phase,stripe,song:{...song,notes,events:[...gm].map(([tick,notes])=>({tick,notes}))},gm,layers,banks});
 }
 const ticks=new Set([0]);let last=0;
 for(const s of streams)for(const t of s.gm.keys()){ticks.add(t);last=Math.max(last,t)}ticks.add(last+10);
 const slots=[];let prev=0,x=0;
 for(const t of [...ticks].sort((a,b)=>a-b)){while(t-prev>4){prev+=4;slots.push({tick:prev})}if(slots.at(-1)?.tick!==t)slots.push({tick:t});prev=t}
 for(const slot of slots){slot.banks=Math.max(1,...streams.map(s=>Math.ceil((s.gm.get(slot.tick)?.length||0)/(56*s.layers))));slot.step=slot.banks*4;slot.x=x;x+=slot.step}
 const models=[],slices=new Map();let y=0;
 for(const phase of phases){let height=0;
  for(const s of streams.filter(s=>s.phase===phase)){
   const base=require('./toxic-layout.cjs').designBank(s.song,{...opt,bankCount:s.banks,layerCount:s.layers,slotPlan:slots},progress),offset=[0,y,34*s.stripe];
   const m=transform(base,{offset});height=Math.max(height,base.dimensions[1]);
   m.notes.forEach(n=>{n.tick+=twenty?phase/2:0;n.phaseGameTicks=phase});m.inputs.forEach(i=>i.phaseGameTicks=phase);
   for(const sl of base.toxic.slices){const bounds=sl.bounds.map((b,i)=>b.map(v=>v+offset[i]));if(!slices.has(sl.tick))slices.set(sl.tick,bounds);else slices.get(sl.tick).forEach((b,i)=>{b[0]=Math.min(b[0],bounds[i][0]);b[1]=Math.max(b[1],bounds[i][1])})}
   models.push(m);
  }y+=height+1;
 }
 const m=merge(models);m.busNetwork=true;m.phase20=twenty;m.toxic={peak,banks:Math.max(...streams.map(s=>s.banks)),layers:streams.reduce((a,s)=>a+s.layers,0),stripes,phases:phases.length,capacity:perStripe*3,slots,slices:[...slices].sort((a,b)=>a[0]-b[0]).map(([tick,bounds])=>({tick,bounds})),runtimeVerified:false};
 if(m.dimensions[1]>100||m.dimensions[2]>100)throw Error('毒曲合并截面超过 100 格');
 if(m.notes.length!==song.notes.length)throw Error('毒曲分轨丢音');
 return m;
}
module.exports={design};
