'use strict';
// Vanilla Java 26.1.2: one 2gt pulse -> 6gt (even) / 7gt (odd).
// The top trapdoor is a real scaffold support; the permanent adjacent scaffold
// keeps the moving one at distance 1 while the trapdoor is open.
const {measure}=require('./parallel-layout.cjs');
const {routeBranch}=require('./external-start.cjs');
const key=p=>p.join(),add=(a,b)=>a.map((v,i)=>v+b[i]);
function phaseGate(parity,origin=[0,0,0]){
 if(![0,1].includes(parity))throw Error('Invalid game-tick phase');
 const cells=[],put=(p,block)=>cells.push({position:add(p,origin),block}),wire=p=>{put(p,'redstone_wire');put(add(p,[0,-1,0]),'glass')};
 put([-1,0,0],'repeater[facing=west,delay=1,powered=false,locked=false]');put([-1,-1,0],'glass');
 put([0,0,0],'stone');put([0,1,0],'scaffolding[distance=0,bottom=true,waterlogged=false]');
 put([1,0,0],'iron_trapdoor[facing=north,half=top,open=false,powered=false,waterlogged=false]');
 put([1,1,0],'scaffolding[distance=0,bottom=true,waterlogged=false]');
 if(parity)put([2,1,0],'observer[facing=west,powered=false]');
 else{put([1,0,1],'observer[facing=north,powered=false]');wire([1,0,2]);wire([2,1,2]);wire([2,1,1]);wire([2,1,0]);}
 put([3,1,0],'repeater[facing=west,delay=1,powered=false,locked=false]');put([3,0,0],'glass');
 return{blocks:cells,input:add([-1,0,0],origin),output:add([4,1,0],origin),delayGameTicks:6+parity,parity};
}
function connectPhaseStart(source){
 const m=structuredClone(source),originalInputs=structuredClone(m.inputs),occupied=new Map(m.blocks.map(b=>[key(b.position),b]));
 const protectedAir=new Set(m.notes.map(n=>key(add(n.position,[0,1,0])))),external=[];
 const put=(p,block)=>{const k=key(p);if(occupied.has(k))throw Error('20t 启动区冲突 '+k);const b={position:p,block};occupied.set(k,b);external.push(b)};
 const rootY=Math.min(...originalInputs.map(v=>v.wire[1]))-1,busY=rootY-1,rootX=m.bounds[0][0]-7,branches=[],zs=[];
 for(let index=0;index<originalInputs.length;index++){
  const input=originalInputs[index];let z=input.wire[2];
  for(let shift=0;;shift++){const v=input.wire[2]+(shift%2?-1:1)*Math.ceil(shift/2)*8;if(zs.every(a=>Math.abs(a-v)>=8)){z=v;break}}
  zs.push(z);const root=[rootX,rootY,z],route=routeBranch(occupied,protectedAir,input,root,m.bounds);
  for(const b of route.blocks)if(!occupied.has(key(b.position)))put(b.position,b.block);
  branches.push({...route,root,index,parity:input.phaseGameTicks||0});
 }
 const minZ=Math.min(...zs)-4,maxZ=Math.max(...zs),busRepeaters=[];let run=0;
 for(let z=minZ+1;z<=maxZ;z++){if(run>=10&&!zs.some(v=>Math.abs(v-z)<=1)){busRepeaters.push(z);run=0}else if(++run>14)throw Error('20t 启动总线超距');}
 for(const b of branches){const before=busRepeaters.filter(z=>z<=b.root[2]);b.busDelay=before.length;b.busStrength=16-(b.root[2]-(before.at(-1)??minZ));}
 let common=Math.max(...branches.map(b=>b.delay+b.busDelay))+1,bankLength;
 for(;;){for(const b of branches)b.bankDelay=common-b.delay-b.busDelay;bankLength=Math.max(...branches.map(b=>b.bankDelay));if(branches.every(b=>b.bankDelay===1?bankLength<=b.busStrength:b.bankDelay>=Math.ceil((bankLength-1)/15)+1))break;common++;}
 const busX=rootX-bankLength-6,input={marker:[busX,busY-1,minZ],repeater:[busX,busY,minZ],wire:[busX,busY,minZ-1],direction:[0,0,1],startTick:0};
 put(input.marker,'lime_stained_glass');put(input.repeater,'repeater[facing=north,delay=1,powered=false,locked=false]');put(input.wire,'redstone_wire');put(add(input.wire,[0,-1,0]),'glass');
 for(let z=minZ+1;z<=maxZ;z++){put([busX,busY,z],busRepeaters.includes(z)?'repeater[facing=north,delay=1,powered=false,locked=false]':'redstone_wire');put([busX,busY-1,z],'glass');}
 for(const b of branches){
  const indexes=new Set(b.bankDelay===1?[bankLength-1]:Array.from({length:b.bankDelay},(_,i)=>Math.round(i*(bankLength-1)/(b.bankDelay-1))));
  for(let j=0;j<bankLength;j++){put([busX+1+j,busY,b.root[2]],indexes.has(j)?'repeater[facing=west,delay=1,powered=false,locked=false]':'redstone_wire');put([busX+1+j,busY-1,b.root[2]],'glass');}
  const gate=phaseGate(b.parity,[rootX-4,busY,b.root[2]]);for(const v of gate.blocks)put(v.position,v.block);
 }
 const delay=common+4;m.blocks=[...occupied.values()];m.inputs=[input];m.button=null;m.notes=m.notes.map(n=>({...n,tick:n.tick+delay}));measure(m);
 m.externalStart={enabled:true,bodyBounds:structuredClone(source.bounds),bodyDimensions:source.dimensions.slice(),bodyVolume:source.volume,bodyBlockCount:source.blocks.length,externalBlockCount:external.length,addedStartupRedstoneTicks:delay,addedStartupGameTicks:delay*2,pulseRedstoneTicks:1,originalInputs,commonInput:input,branches:branches.map(b=>({input:b.index,phaseGameTicks:b.parity,routeDelay:b.delay,busDelay:b.busDelay,compensationDelay:b.bankDelay,totalDelayGameTicks:delay*2+b.parity})),routingTemplate:'two-phase-scaffolding-20gt',boundsExcludedFromSearch:true,runtimeVerified:false,audit:{pass:false,status:'component-checks-only',scope:'分相主体上升沿检查、外部线路寻路与延时算术；脚手架错拍器需以原版实机回归为准，不冒充完整动态模拟。'}};
 return m;
}
module.exports={phaseGate,connectPhaseStart};
