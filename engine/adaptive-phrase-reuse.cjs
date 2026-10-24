'use strict';
const {designPhraseReuse}=require('./phrase-reuse-layout.cjs'),{designChordBus}=require('./chord-bus-layout.cjs'),{transform,measure}=require('./parallel-layout.cjs'),{exclusion,glassWireRoute}=require('./adaptive-scheduled-repeat.cjs');
const key=p=>p.join(),add=(p,d)=>p.map((v,i)=>v+d[i]);
function decomposePhraseReuse(pattern,calls,{cap=11,rows=7,layerHeight=4,template='chord-bus',routeTicks=0,planarCutMode='greedy',rowCounts,planarInterleaved=false,driverShape='flat'}={}){
 if(!['chord-bus','planar'].includes(template))throw Error('Unknown phrase core template');
 if(!Number.isInteger(routeTicks)||routeTicks<0||routeTicks>8)throw Error('Invalid route compensation');
 // The collector's new output diode costs one RT. Start the entire serial
 // schedule one RT earlier, leaving the musical call times unchanged.
 const compensation=(template==='planar'?2:1)+routeTicks,adjusted=calls.map(t=>t-compensation),combined=designPhraseReuse(pattern,adjusted,{cap,rows,layerHeight,driverShape}),center=-10*Math.floor((calls.length-1)/2),topY=2+(calls.length-1)*3;
 const ordinary=designChordBus({notes:pattern},{cap,rows,layerHeight,cutMode:'adaptive'}),oldPhrase=transform(ordinary,driverShape==='flat'?{rotation:1,offset:[center,0,10]}:{rotation:2,offset:[-8,topY-2,5]}),remove=new Set(oldPhrase.blocks.map(b=>key(b.position)));
 const raw=template==='planar'?require('./planar-chord-layout.cjs').designPlanarChord({notes:pattern},{cap,cutMode:planarCutMode,rowCounts,interleaved:planarInterleaved}):ordinary;
 if(driverShape==='flat'){for(const z of [8,9])for(const y of [1,2])remove.add(key([center,y,z]));}else{for(const x of [-6,-7])for(const y of [topY-1,topY])remove.add(key([x,y,5]));}
 const driverBlocks=combined.blocks.filter(b=>!remove.has(key(b.position)));
 if(driverShape==='flat')driverBlocks.push({position:[center,1,8],block:'cobblestone'},{position:[center,2,8],block:'repeater[facing=north,delay=1,powered=false,locked=false]'});else driverBlocks.push({position:[-6,topY-1,5],block:'cobblestone'},{position:[-6,topY,5],block:'repeater[facing=east,delay=1,powered=false,locked=false]'});
 const driver=measure({blocks:driverBlocks,notes:[],inputs:combined.inputs,outputs:[{position:driverShape==='flat'?[center,2,9]:[-7,topY,5],direction:driverShape==='flat'?[0,0,1]:[-1,0,0],kind:'phrase-calls'}],containers:combined.containers,groups:[],connections:[],clockSolids:[],rowInfo:[],hopperTimer:{experimental:true},safeRestartAfterTicks:combined.safeRestartAfterTicks+compensation,serialSchedule:combined.phraseReuse});
 raw.blocks.find(b=>key(b.position)===key(raw.inputs[0].marker)).block='cobblestone';
 const phrase=measure({...raw,notes:calls.flatMap(t=>raw.notes.map(n=>({...n,tick:n.tick+t})))});
 return{driver,phrase,parameters:{cap,rows,layerHeight,template,...(driverShape!=='flat'?{driverShape}:{}),...(template==='planar'&&(planarCutMode!=='greedy'||rowCounts)?{planarCutMode,rowCounts:raw.planarParams.rowCounts}:{}),...(planarInterleaved?{planarInterleaved:true}:{})},calls,physicalNotes:raw.notes.length};
}
function routeRepeaters(path){
 for(let i=0;i<path.length;i++)for(let j=i+2;j<path.length;j++)if(Math.abs(path[i][0]-path[j][0])+Math.abs(path[i][2]-path[j][2])===1&&Math.abs(path[i][1]-path[j][1])<=1)return null;
 const straight=[];for(let i=1;i<path.length-1;i++){const [a,b,c]=path.slice(i-1,i+2);if(a[1]===b[1]&&b[1]===c[1]&&b[0]-a[0]===c[0]-b[0]&&b[2]-a[2]===c[2]-b[2])straight.push(i)}
 let last=-1;const result=[];while(path.length-1-last>15){const next=straight.filter(i=>i>last&&i<=last+15).at(-1);if(next===undefined)return null;result.push(next);last=next}return result;
}
function designAdaptivePhraseReuse(pattern,calls,{cap=11,rows=7,layerHeight=4,template='chord-bus',planarCutMode='greedy',rowCounts,planarInterleaved=false,driverShape='flat',bounds=[[-40,40],[0,12],[-40,40]],driverBounds=bounds,coreOffset=[0,4,0],coreRotation=0,obstacles=[],externalInputs=[],placementLimit=32,maxRouteCells=15,onCandidate=()=>{},shouldStop=()=>false}={}){
 if(!Number.isInteger(maxRouteCells)||maxRouteCells<15||maxRouteCells>96)throw Error('Route cells must be 15..96');
 if(driverBounds.some((b,i)=>b[0]<bounds[i][0]||b[1]>bounds[i][1]))throw Error('Driver bounds outside available region');
 const parts=decomposePhraseReuse(pattern,calls,{cap,rows,layerHeight,template,planarCutMode,rowCounts,planarInterleaved,driverShape}),core=transform(parts.phrase,{rotation:coreRotation,offset:coreOffset}),blocked=exclusion([...obstacles,...core.blocks],externalInputs,'electrical');
 const outer=exclusion(obstacles,externalInputs,'electrical');if(core.blocks.some(b=>outer.has(key(b.position))||b.position.some((v,i)=>v<bounds[i][0]||v>bounds[i][1])))return null;
 const target=core.inputs[0],reserved=externalInputs.map(i=>({position:i.wire,block:'redstone_block'}));
 if(!glassWireRoute([...obstacles,...core.blocks,...reserved],target.wire,target.wire,target.repeater,target.repeater,bounds))return null;
 const choices=[];
 for(let rotation=0;rotation<4;rotation++){
  if(shouldStop())return null;
  const driver=transform(parts.driver,{rotation});
  if(maxRouteCells>15){
   for(let oy=driverBounds[1][0]-driver.bounds[1][0];oy<=Math.min(driverBounds[1][1]-driver.bounds[1][1],target.wire[1]-driver.outputs[0].position[1]);oy++)for(let ox=driverBounds[0][0]-driver.bounds[0][0];ox<=driverBounds[0][1]-driver.bounds[0][1];ox++)for(let oz=driverBounds[2][0]-driver.bounds[2][0];oz<=driverBounds[2][1]-driver.bounds[2][1];oz++){
    if(shouldStop())return null;
    const offset=[ox,oy,oz],source=add(driver.outputs[0].position,offset),dy=target.wire[1]-source[1],distance=Math.max(Math.abs(source[0]-target.wire[0])+Math.abs(source[2]-target.wire[2]),dy);
    if(distance>=maxRouteCells||source.some((v,i)=>v<bounds[i][0]||v>bounds[i][1]))continue;
    if([...driver.blocks.map(b=>b.position),...driver.inputs.map(i=>i.wire)].some(p=>blocked.has(key(add(p,offset)))))continue;
    choices.push({driver,rotation,offset,distance,dy});
   }
   continue;
  }
  for(let dy=0;dy<=Math.min(8,target.wire[1]-bounds[1][0]-1);dy++)for(let dx=-14;dx<=14;dx++)for(let dz=-14;dz<=14;dz++){
   if(shouldStop())return null;
   const distance=Math.max(Math.abs(dx)+Math.abs(dz),dy);if(distance>14)continue;
   const source=add(target.wire,[dx,-dy,dz]),offset=source.map((v,i)=>v-driver.outputs[0].position[i]);
   if(driver.bounds.some((b,i)=>b[0]+offset[i]<driverBounds[i][0]||b[1]+offset[i]>driverBounds[i][1]))continue;
   if([...driver.blocks.map(b=>b.position),...driver.inputs.map(i=>i.wire)].some(p=>blocked.has(key(add(p,offset)))))continue;
   choices.push({driver,rotation,offset,distance,dy});
  }
 }
 choices.sort((a,b)=>a.distance+a.dy*.2-b.distance-b.dy*.2);let best=null,placedCount=0;
 for(const choice of choices){
  if(shouldStop())break;
  let driver=transform(choice.driver,{offset:choice.offset});const out=driver.outputs[0],path=glassWireRoute([...obstacles,...reserved,...core.blocks,...driver.blocks,...driver.inputs.map(i=>({position:i.wire,block:'redstone_block'}))],out.position,target.wire,add(out.position,out.direction.map(v=>-v)),target.repeater,bounds,{maxCells:maxRouteCells,maxStates:maxRouteCells>15?15000:2500});if(!path)continue;
  const relays=routeRepeaters(path);if(!relays||relays.length>8)continue;
  if(relays.length){try{driver=transform(decomposePhraseReuse(pattern,calls,{cap,rows,layerHeight,template,planarCutMode,rowCounts,planarInterleaved,driverShape,routeTicks:relays.length}).driver,{rotation:choice.rotation,offset:choice.offset})}catch{continue}}
  const wires=path.flatMap((p,i)=>{let block='redstone_wire';if(relays.includes(i)){const q=path[i+1],face=q[0]>p[0]?'west':q[0]<p[0]?'east':q[2]>p[2]?'north':'south';block=`repeater[facing=${face},delay=1,powered=false,locked=false]`}return[{position:p,block},{position:add(p,[0,-1,0]),block:'glass'}]});
  const m=measure({blocks:[...core.blocks,...driver.blocks,...wires],notes:core.notes,inputs:driver.inputs,containers:driver.containers,groups:[],connections:[],clockSolids:[],rowInfo:[],hybridNetwork:true,hopperTimer:{experimental:true},template:'adaptive-phrase-reuse',branchMode:'adaptive-phrase-reuse-experimental',phraseReuse:{calls,physicalNotes:parts.physicalNotes,sourceNotes:core.notes.length,parameters:parts.parameters,coreOffset,coreRotation,driverOffset:choice.offset,driverRotation:choice.rotation,path,serialSchedule:driver.serialSchedule},safeRestartAfterTicks:driver.safeRestartAfterTicks});
  m.phraseReuse.routeRepeaters=relays;m.phraseReuse.maxRouteCells=maxRouteCells;m.phraseReuse.driverBounds=driverBounds;
  if(new Set(m.blocks.map(b=>key(b.position))).size!==m.blocks.length)throw Error('Adaptive phrase overlaps');
  if(!best||m.volume<best.volume){best=m;onCandidate(m)}if(++placedCount>=placementLimit)break;
 }
 return best;
}
module.exports={decomposePhraseReuse,designAdaptivePhraseReuse,routeRepeaters};
