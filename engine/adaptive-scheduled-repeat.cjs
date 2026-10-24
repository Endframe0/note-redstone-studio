'use strict';
const {designRepeatLoop}=require('./repeat-loop.cjs'),{designHopperTimer}=require('./hopper-timer.cjs'),{transform,measure}=require('./parallel-layout.cjs'),{state,solid}=require('./electrical.cjs');
const add=(p,d)=>p.map((v,i)=>v+d[i]),key=p=>p.join(),dirs=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
function calibratedTimer(delay){const items=Math.floor((delay-3)/4),fine=delay-(4*items+3);if(items<1||items>320)throw Error('Adaptive timer delay outside one hopper range');const m=designHopperTimer({items});m.blocks.find(b=>key(b.position)==='-2,2,-4').block=`repeater[facing=south,delay=${1+fine},powered=false,locked=false]`;return m}
function timerVariants(delay,mode){
 if(!['legacy','compact','adaptive'].includes(mode))throw Error('Unknown timer shape mode');
 const variants=[];
 if(mode!=='compact')variants.push(calibratedTimer(delay));
 if(mode!=='legacy'){
  const items=Math.floor((delay-2)/4),fine=1+delay-(4*items+2);
  if(items>=1&&items<=320)for(const outputSide of ['front','left'])variants.push(require('./compact-hopper-timer.cjs').designCompactHopperTimer({items,fine,outputSide}));
 }
 if(!variants.length)throw Error('Timer delay outside available shapes');return variants;
}
function decompose(spec,timerShapes='legacy'){
 const {chord,count,period=2,startTick}=spec;if(!Number.isInteger(startTick)||startTick<10)throw Error('Adaptive scheduled start needs >= 10 RT');
 const base=designRepeatLoop({chord,count,period,width:12,support:spec.support||'cobblestone'}),blocks=base.blocks.filter(b=>b.position[0]>0&&b.position[2]>=0||b.position[0]===0&&b.position[2]===0);
 for(const [p,f]of [[[-1,2,0],'west'],[[0,2,-1],'north']])blocks.push({position:p,block:`repeater[facing=${f},delay=1,powered=false,locked=false]`},{position:add(p,[0,-1,0]),block:'cobblestone'});
 const core=measure({blocks,notes:base.notes.map(n=>({...n,tick:n.tick+startTick})),inputs:[],groups:[],connections:[],clockSolids:[],rowInfo:[]});
 // Receiver at the start is already part of the oscillator's 4 RT latency.
 // A separate stop receiver adds 1 RT, paid for in the stop timer calibration.
 const variants=[startTick-3,startTick-3+count*period].map(delay=>timerVariants(delay,timerShapes));
 return{core,timers:variants.map(v=>v[0]),timerVariants:variants,receivers:[{wire:[-2,2,0],repeater:[-1,2,0]},{wire:[0,2,-2],repeater:[0,2,-1]}]};
}
function exclusion(blocks,inputs=[],clearance='box'){
 if(!['box','electrical'].includes(clearance))throw Error('Unknown clearance mode');
 const out=new Set();
 for(const p of [...blocks.map(b=>b.position),...inputs.map(i=>i.wire)])for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
  // Horizontal diagonal cells cannot directly exchange power. Retain all
  // cardinal neighbors and vertical diagonals (dust stairs), plus note air.
  if(clearance==='electrical'&&x!==0&&z!==0)continue;
  out.add(key(add(p,[x,y,z])));
 }
 return out;
}
function glassWireRoute(blocks,source,target,sourceRepeater,targetRepeater,bounds,{maxCells=15,maxStates=2500}={}){
 const map=new Map(blocks.map(b=>[key(b.position),state(b.block)])),end=key(target),noteAir=new Set(blocks.filter(b=>state(b.block).name==='note_block').map(b=>key(add(b.position,[0,1,0]))));
 function valid(p,path){
  if(p.some((v,i)=>v<bounds[i][0]||v>bounds[i][1])||p[1]<source[1]||p[1]>target[1])return false;
  const below=add(p,[0,-1,0]);if(below[1]<bounds[1][0]||noteAir.has(key(p))||noteAir.has(key(below))||map.has(key(p))||map.has(key(below))&&map.get(key(below)).name!=='glass')return false;
  if(path.some(q=>key(q)===key(p)||key(q)===key(below)||key(add(q,[0,-1,0]))===key(p)))return false;
  for(const d of dirs){const q=add(p,d),b=map.get(key(q));
   const terminal=key(q)===key(sourceRepeater)&&key(p)===key(source)||key(q)===key(targetRepeater)&&key(p)===end;
   if(b&&!terminal&&(solid(b)||['repeater','comparator','hopper','redstone_wall_torch'].includes(b.name)))return false;
   for(const dy of [-1,0,1])if(map.get(key(add(q,[0,dy,0])))?.name==='redstone_wire')return false;
  }
  return true;
 }
 if(source[1]>target[1]||!valid(source,[])||!valid(target,[]))return null;
 const h=p=>Math.max(Math.abs(p[0]-target[0])+Math.abs(p[2]-target[2]),target[1]-p[1]),queue=[{p:source,path:[source],score:h(source)}],seen=new Map();let work=0;
 while(queue.length&&work++<maxStates){queue.sort((a,b)=>b.score-a.score);const c=queue.pop();if(key(c.p)===end)return c.path;if(c.path.length>=maxCells)continue;
  for(const d of dirs)for(const dy of [0,1]){const p=add(c.p,[d[0],dy,d[2]]);if(!valid(p,c.path)||dy&&solid(map.get(key(add(c.p,[0,1,0])))))continue;
   const cost=c.path.length+1,k=key(p)+'|'+key(c.p);if(cost+h(p)>maxCells||(seen.get(k)||Infinity)<=cost)continue;seen.set(k,cost);queue.push({p,path:[...c.path,p],score:cost+h(p)})}
 }
 return null;
}
// The functional blocks are placed independently inside a caller's available
// volume, followed by a real collision-aware wire route. No fixed outer module
// box is reserved, and the whole set of resulting blocks is measured afterward.
function designAdaptiveScheduledRepeat(spec,{bounds=[[-20,20],[0,10],[-20,20]],obstacles=[],externalInputs=[],coreOffset=[0,0,0],coreRotation=0,placementLimit=12,timerShapes='legacy',clearance='box',onCandidate=()=>{},onArrangement=()=>{},onProgress=()=>{}}={}){
 const rotate=p=>{for(let i=0;i<coreRotation;i++)p=[-p[2],p[1],p[0]];return p};
 const parts=decompose(spec,timerShapes),core=transform(parts.core,{rotation:coreRotation,offset:coreOffset}),receivers=parts.receivers.map(r=>({wire:add(rotate(r.wire),coreOffset),repeater:add(rotate(r.repeater),coreOffset)})),outer=exclusion(obstacles,externalInputs,clearance);
 if(core.blocks.some(b=>outer.has(key(b.position))||b.position.some((v,i)=>v<bounds[i][0]||v>bounds[i][1])))return null;
 const variants=parts.timerVariants.map(timers=>timers.flatMap(timer=>[0,1,2,3].map(rotation=>({rotation,m:transform(timer,{rotation})}))));
 function* candidates(index,occupied,inputs){
  const forbidden=exclusion(occupied,inputs,clearance),target=receivers[index],choices=[],reserved=inputs.map(i=>({position:i.wire,block:'redstone_block'}));
  // An occupied or electrically contaminated receiver cannot be rescued by
  // exploring thousands of source placements. Reject this branch before A*.
  if(!glassWireRoute([...occupied,...reserved],target.wire,target.wire,target.repeater,target.repeater,bounds))return;
  for(const v of variants[index])for(let dy=0;dy<=Math.min(8,target.wire[1]-bounds[1][0]-1);dy++)for(let dx=-14;dx<=14;dx++)for(let dz=-14;dz<=14;dz++){
   const distance=Math.max(Math.abs(dx)+Math.abs(dz),dy);if(distance>14)continue;
   const source=add(target.wire,[dx,-dy,dz]),offset=source.map((p,i)=>p-v.m.outputs[0].position[i]);
   if(v.m.bounds.some((b,i)=>b[0]+offset[i]<bounds[i][0]||b[1]+offset[i]>bounds[i][1]))continue;
   if(v.m.blocks.some(b=>forbidden.has(key(add(b.position,offset))))||v.m.inputs.some(i=>forbidden.has(key(add(i.wire,offset)))))continue;
   choices.push({v,source,offset,score:distance+dy*.2+(timerShapes==='legacy'?0:v.m.volume*.01)});
  }
  choices.sort((a,b)=>a.score-b.score);let delivered=0,checked=0;onProgress({index,placements:choices.length});
  for(const c of choices){if(++checked%100===0)onProgress({index,checked,delivered});const placed=transform(c.v.m,{offset:c.offset}),output=placed.outputs[0],sourceRepeater=output.position.map((v,i)=>v-output.direction[i]),path=glassWireRoute([...occupied,...reserved,...placed.blocks,...placed.inputs.map(i=>({position:i.wire,block:'redstone_block'}))],output.position,target.wire,sourceRepeater,target.repeater,bounds);if(!path)continue;
   const wires=[];for(const p of path)wires.push({position:p,block:'redstone_wire'},{position:add(p,[0,-1,0]),block:'glass'});
   yield{placed,wires,path,rotation:c.v.rotation,offset:c.offset};if(++delivered>=placementLimit)return;
  }
 }
 let best=null,attempts=0;
 const initial=[...obstacles,...core.blocks];
 for(const a of candidates(0,initial,externalInputs))for(const b of candidates(1,[...initial,...a.placed.blocks,...a.wires],[...externalInputs,...a.placed.inputs])){
  attempts++;const blocks=[...core.blocks,...a.placed.blocks,...a.wires,...b.placed.blocks,...b.wires],map=new Map();let conflict=false;for(const v of blocks){const old=map.get(key(v.position));if(old&&old.block!==v.block){conflict=true;break}map.set(key(v.position),v)}if(conflict)continue;
  const m=measure({blocks:[...map.values()],notes:core.notes,inputs:[...a.placed.inputs,...b.placed.inputs],containers:[...a.placed.containers,...b.placed.containers],groups:[],connections:[],clockSolids:[],rowInfo:[],template:'adaptive-scheduled-repeat',branchMode:'adaptive-scheduled-repeat-experimental',hopperTimer:{experimental:true},scheduler:{spec,coreOffset,coreRotation,routes:[a.path,b.path],placements:[a,b].map(({rotation,offset})=>({rotation,offset})),simultaneousExternalInputs:true},safeRestartAfterTicks:20+8*Math.max(...parts.timers.map(p=>p.hopperTimer.items))});
  m.scheduler.timerShapes=timerShapes;m.scheduler.clearance=clearance;
  m.scheduler.placements=[a,b].map(({rotation,offset,placed})=>({rotation,offset,template:placed.template,timer:placed.hopperTimer}));
  m.safeRestartAfterTicks=20+8*Math.max(a.placed.hopperTimer.items,b.placed.hopperTimer.items);
  onArrangement(m);
  if(!best||m.volume<best.volume){best=m;onCandidate(m)}
 }
 if(best)best.scheduler.checkedPairs=attempts;return best;
}
module.exports={decompose,glassWireRoute,exclusion,designAdaptiveScheduledRepeat};
