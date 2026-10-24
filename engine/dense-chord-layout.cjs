'use strict';
const fs=require('node:fs');
const {splitSong,transform,merge}=require('./parallel-layout.cjs');
const {designChordBus,compileBus}=require('./chord-bus-layout.cjs');
const {auditSignals}=require('./signal-audit.cjs');
const {fits,shapePenalty}=require('./objective.cjs');
function tracks(song,split){
 if(split.separateSnare){
  const main=song.notes.filter(n=>n.instrument!==3),sand=song.notes.filter(n=>n.instrument===3);
  const events=source=>{const g=new Map();for(const n of source){if(!g.has(n.tick))g.set(n.tick,[]);g.get(n.tick).push(n)}return [...g].map(([tick,notes])=>({tick,notes}))};
  return [...splitSong({...song,notes:main,events:events(main)},{count:split.count-1,scheme:'voices'}),...(sand.length?[{notes:sand,events:events(sand)}]:[])];
 }
 return splitSong(song,{count:split.count,scheme:'voices'});
}
function designDenseChord(song,recipe,{support='cobblestone',partitionDeadline=Infinity}={}){
 if(!recipe||!Number.isInteger(recipe.split?.count)||recipe.split.count<2||recipe.split.count>8)throw Error('Invalid dense chord track count');
 const lanes=tracks(song,recipe.split);if(lanes.length!==recipe.parts.length)throw Error('Dense chord parts mismatch');
 let height=0;const models=lanes.map((lane,i)=>{
  const params=recipe.parts[i],m=designChordBus(lane,{...params,support,partitionDeadline});
  const offset=m.bounds.map((b,axis)=>-b[0]+(axis===1?height:0));height+=m.dimensions[1]+(recipe.gap??0);
  return transform(m,{offset});
 });
 const m=merge(models),signature=ns=>ns.map(n=>[n.tick,n.instrument,n.key,n.layer].join()).sort().join(';');
 if(signature(m.notes)!==signature(song.notes))throw Error('Dense chord split changed notes');
 const audit=auditSignals(m);if(!audit.pass)throw Error('Dense chord signal audit failed: '+audit.errors[0]?.type);
 return {...m,audit,busNetwork:true,template:'dense-chord',branchMode:'dense-chord-bus',denseChord:{recipe,tracks:lanes.length,runtimeVerified:false},searchParams:{kind:'dense-chord',recipe}};
}
function* denseChordSeeds(song,opt,deadline=Infinity){
 if(!opt.externalInputs||!require('./versions.cjs').supports(opt.target,'compression'))return;
 const maximum=Math.max(...song.events.map(e=>e.notes.length));
 if(maximum<=20&&!song.denseChordCount)return;
 const limit=Number(opt.maxTracks??8),jobs=[],anchors=[];
 for(let count=Math.max(2,Math.ceil(maximum/17));count<=Math.min(limit,8);count++){
  const split={count},lanes=tracks(song,split),counts=lanes.map(s=>compileBus(s,{splitLongRests:true}).length);
  for(let cap=10;cap<=Math.min(38,Math.floor((opt.maxX-4)/2));cap++)for(let rows=4;rows<=Math.min(32,Math.floor((opt.maxZ-1)/2));rows++){
   const parts=lanes.map(lane=>{const sand=lane.notes.some(n=>n.instrument===3),compact=!sand||opt.heavyCore||opt.sandPacking;
    return {cap,rows,layerHeight:compact?3:4,rowPitch:2,cutMode:'adaptive',splitLongRests:true,riseStyle:'powered',...(opt.heavyCore?{snareBase:'heavy_core'}:sand&&opt.sandPacking?{reuseSandSupports:true,adaptiveSnare:true,sandSupport:'glass'}:{})};});
   const dims=[2*cap+4,counts.reduce((s,n,i)=>s+Math.ceil(n/cap/rows)*parts[i].layerHeight,0),2*rows+1];
   const job={recipe:{split,parts,gap:0},score:dims.reduce((a,b)=>a*b,1)*shapePenalty(dims,opt)};jobs.push(job);
   // Start near a cube allowing for row-end slack. Pure volume estimates
   // otherwise spend a short budget on many unrealistically full thin rows.
   const side=Math.cbrt(counts.reduce((s,n,i)=>s+n*4*parts[i].layerHeight,0)*1.35);
   const anchorCap=Math.ceil((side-4)/2),anchorRows=Math.floor((side-1)/2)-2;
   if(Math.abs(cap-anchorCap)<=1&&Math.abs(rows-anchorRows)<=1)anchors.push({...job,priority:count*100+Math.abs(cap-anchorCap)+Math.abs(rows-anchorRows)});
  }
 }
 jobs.sort((a,b)=>a.score-b.score);anchors.sort((a,b)=>a.priority-b.priority);let best=Infinity;const seen=new Set();
 for(const {recipe}of [...anchors,...jobs]){if(Date.now()>=deadline||opt.stopFile&&fs.existsSync(opt.stopFile))return;
  const key=JSON.stringify(recipe);if(seen.has(key))continue;seen.add(key);
  try{const m=designDenseChord(song,recipe,{support:opt.support||'cobblestone',partitionDeadline:Math.min(deadline,Date.now()+150)});
   if(fits(m.dimensions,opt)&&m.volume<best){best=m.volume;yield m.searchParams;}
  }catch{}
 }
}
module.exports={tracks,designDenseChord,denseChordSeeds};
