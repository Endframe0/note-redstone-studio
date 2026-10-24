'use strict';
const {decompose,exclusion,designAdaptiveScheduledRepeat}=require('./adaptive-scheduled-repeat.cjs'),{transform,measure}=require('./parallel-layout.cjs');
// Place the oscillator first, then solve its two controller positions and nets
// against the actual other blocks. Only occupied cells are reserved; no module
// cuboid is carved out of the song. Each alternative is a complete real circuit.
function packAdaptiveModules(bus,specs,{coreLimit=64,branchLimit=4,timerShapes='legacy',clearance='box',bounds=bus.bounds,progress=()=>{}}={}){
 if(bounds.some((b,i)=>b[0]>bus.bounds[i][0]||b[1]<bus.bounds[i][1]))throw Error('Packing bounds must contain the residual bus');
 const order=[...specs].sort((a,b)=>b.count*b.chord.length-a.count*a.chord.length);let tried=0;
 function place(index,parts){
  if(index===order.length)return parts;
  const blocks=[...bus.blocks,...parts.flatMap(p=>p.blocks)],inputs=[...bus.inputs,...parts.flatMap(p=>p.inputs)],forbidden=exclusion(blocks,inputs,clearance),core=decompose(order[index]).core;
  let cores=0;
  for(let rotation=0;rotation<4;rotation++){
   const c=transform(core,{rotation}),min=c.bounds.map(b=>b[0]),size=c.dimensions,relative=c.blocks.map(b=>b.position.map((v,i)=>v-min[i]));
   for(let y=bounds[1][1]-size[1]+1;y>=bounds[1][0];y--)for(let z=bounds[2][0];z<=bounds[2][1]-size[2]+1;z++)for(let x=bounds[0][0];x<=bounds[0][1]-size[0]+1;x++){
    if(relative.some(p=>forbidden.has([x+p[0],y+p[1],z+p[2]].join())))continue;
    if(++cores>coreLimit)return null;tried++;const arrangements=[];
    designAdaptiveScheduledRepeat(order[index],{bounds,obstacles:blocks,externalInputs:inputs,coreRotation:rotation,coreOffset:[x-min[0],y-min[1],z-min[2]],placementLimit:branchLimit,timerShapes,clearance,onArrangement:m=>arrangements.push(m)});
    progress({index,cores,tried,arrangements:arrangements.length});
    for(const m of arrangements.sort((a,b)=>a.volume-b.volume)){const result=place(index+1,[...parts,m]);if(result)return result}
   }
  }
  return null;
 }
 const parts=place(0,[]);if(!parts)return null;
 return measure({blocks:[...bus.blocks,...parts.flatMap(p=>p.blocks)],notes:[...bus.notes,...parts.flatMap(p=>p.notes)],inputs:[...bus.inputs,...parts.flatMap(p=>p.inputs)],containers:parts.flatMap(p=>p.containers),connections:[],groups:[],clockSolids:[],rowInfo:[],template:'adaptive-hybrid-reuse',branchMode:'adaptive-hybrid-experimental',hopperTimer:{experimental:true},hybridNetwork:true,busParams:bus.busParams,modules:parts.map(p=>p.scheduler),safeRestartAfterTicks:Math.max(...parts.map(p=>p.safeRestartAfterTicks)),packing:{tried,coreLimit,branchLimit}});
}
module.exports={packAdaptiveModules};
