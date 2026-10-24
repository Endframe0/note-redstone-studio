'use strict';
// Routing is a post-search operation: never changes the music or its objective.
// Every route travels horizontally/upwards on insulating glass. One-tick
// repeaters regenerate the pulse; equal-length delay sums synchronise receivers.
const {state,dirs}=require('./electrical.cjs');
const {measure}=require('./parallel-layout.cjs');
const {auditSignals}=require('./signal-audit.cjs');
const D=Object.values(dirs),add=(a,b)=>a.map((v,i)=>v+b[i]),key=p=>p.join();
const face=d=>Object.keys(dirs).find(f=>dirs[f].every((v,i)=>v===-d[i]));
const rep=d=>`repeater[facing=${face(d)},delay=1,powered=false,locked=false]`;
const isGlass=s=>s&&(s.name==='glass'||s.name.endsWith('_stained_glass'));

class Heap {
 constructor(){this.a=[]}
 push(n){let i=this.a.length;this.a.push(n);while(i){const j=(i-1)>>1;if(this.a[j].f<=n.f)break;this.a[i]=this.a[j];i=j}this.a[i]=n}
 pop(){const a=this.a,n=a[0],v=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1].f<a[j].f)j++;if(a[j].f>=v.f)break;a[i]=a[j];i=j}a[i]=v}return n}
}

function routeBranch(occupied,protectedAir,input,root,bounds,{maxStates=90000}={}){
 const original=new Map([...occupied].map(([k,b])=>[k,state(b.block)]));
 const allowed=key(input.repeater),target=key(root),start=input.wire;
 const signal=s=>s&&['redstone_wire','repeater','comparator'].includes(s.name);
 function valid(cells,n,phase){
  const prior=new Map();for(let c=n;c;c=c.parent)for(const b of c.cells)prior.set(key(b.position),{s:state(b.block),phase:c.phase});
  const junction=n&&key(n.p),own=new Set(cells.map(b=>key(b.position)));
  for(const b of cells){const p=b.position,k=key(p),s=state(b.block),old=original.get(k)||prior.get(k)?.s;
   if(protectedAir.has(k)||old&&!(isGlass(s)&&isGlass(old)))return false;
   if(isGlass(s))continue;
   // No conductive support is introduced near music; the only intentional
   // foreign signal contact is the back of the designated input repeater.
   for(const d of D)for(const dy of [-1,0,1]){
    const q=add(p,[d[0],dy,d[2]]),qk=key(q),other=original.get(qk),v=prior.get(qk);
    if(qk!==allowed&&signal(other))return false;
    if(dy===0&&other&&!isGlass(other)&&other.name!=='air'&&qk!==allowed)return false;
    if(v&&signal(v.s)&&!own.has(qk)&&qk!==junction){
     // Dust within the same zero-delay segment may fold tightly or touch.
     // Distinct repeater phases may never short-circuit or side-lock.
     if(!(s.name==='redstone_wire'&&v.s.name==='redstone_wire'&&v.phase===phase))return false;
    }
   }
   const above=original.get(key(add(p,[0,1,0])))||prior.get(key(add(p,[0,1,0])))?.s;
   if(above&&!isGlass(above))return false;
  }
  return true;
 }
 const seed=[{position:start,block:'redstone_wire'},{position:add(start,[0,-1,0]),block:'glass'}];
 if(!valid(seed,null,0))throw Error('自动启动线无法安全接入入口 '+key(start)+'；入口背面或下方被占用。');
 const distance=p=>Math.max(Math.abs(p[0]-root[0])+Math.abs(p[2]-root[2]),p[1]-root[1]);
 const heap=new Heap(),seen=new Map();heap.push({p:start,parent:null,cells:seed,phase:0,run:1,g:0,f:distance(start)});let visited=0;
 while(heap.a.length&&++visited<=maxStates){
  const n=heap.pop();
  if(key(n.p)===target){const cells=[];for(let c=n;c;c=c.parent)cells.push(...c.cells);const unique=new Map(cells.map(b=>[key(b.position),b]));return{blocks:[...unique.values()],delay:n.phase,visited}}
  for(const d of D){
   if(!n.parent&&d.some((v,i)=>v!==-input.direction[i]))continue;
   // Reverse-route the real signal's upward glass stairs. A dust step is
   // one horizontal block and zero/one vertical block; alternating direction
   // yields the user's two-column folded riser without adding redstone delay.
   for(const mode of ['down','flat','boost']){
    const boost=mode==='boost',down=mode==='down'?1:0,len=boost?2:1;
    if(!boost&&n.run>=15)continue;
    const q=add(n.p,[d[0]*len,-down,d[2]*len]);
    if(q[1]<root[1]||q[1]>start[1]||q[0]<root[0]||q[0]>bounds[0][1]+16||q[2]<Math.min(root[2],bounds[2][0])-16||q[2]>Math.max(root[2],bounds[2][1])+16)continue;
    if(key(q)===target&&key(d)!=='-1,0,0')continue;
    const phase=n.phase+(boost?1:0),run=boost?1:n.run+1;
    const nk=key(q)+':'+key(d)+':'+run, g=n.g+len+(boost?12:0);
    if((seen.get(nk)??Infinity)<=g)continue;
    const cells=[];
    for(let j=1;j<=len;j++){const p=add(n.p,[d[0]*j,-down,d[2]*j]);cells.push({position:p,block:boost&&j===1?rep(d.map(v=>-v)):'redstone_wire'},{position:add(p,[0,-1,0]),block:'glass'})}
    if(!valid(cells,n,phase))continue;
    seen.set(nk,g);
    const dist=distance(q),needed=Math.max(0,Math.ceil((dist+run-15)/16));
    // A small distance tie break keeps stairs next to the body and favours
    // finishing a descent in place over long outward diagonal ramps.
    heap.push({p:q,parent:n,cells,phase,run,g,f:g+dist*1.65+needed*12});
   }
  }
 }
 throw Error(`紧凑启动线未找到安全路径（入口 ${key(start)}，搜索 ${visited} 个节点）。主体未改变；可关闭自动连线后导出。`);
}

function connectExternalStart(source){
 if(!source.inputs?.length)throw Error('自动启动线需要外部同步入口。');
 const m=structuredClone(source);
 const originalInputs=structuredClone(m.inputs),occupied=new Map(m.blocks.map(b=>[key(b.position),b]));
 const protectedAir=new Set(m.notes.map(n=>key(add(n.position,[0,1,0]))));
 const external=[],put=(p,block)=>{const k=key(p),b={position:p,block};if(occupied.has(k))throw Error('自动启动线方块冲突 '+k);occupied.set(k,b);external.push(b)};
 if(originalInputs.length===1){
  const input=originalInputs[0],r=routeBranch(occupied,protectedAir,input,input.wire,m.bounds);
  for(const b of r.blocks)if(!occupied.has(key(b.position)))put(b.position,b.block);
  return finishExternal(source,m,occupied,external,originalInputs,input,[{index:0,delay:0,busDelay:0,bankDelay:0}],0);
 }
 const baseY=Math.min(...originalInputs.map(v=>v.wire[1]))-1,rootX=m.bounds[0][0]-5,branches=[],rootZs=[];
 for(let index=0;index<originalInputs.length;index++){
  let z=originalInputs[index].wire[2];
  for(let shift=0;;shift++){const candidate=originalInputs[index].wire[2]+(shift%2?-1:1)*Math.ceil(shift/2)*4;if(rootZs.every(v=>Math.abs(v-candidate)>=4)){z=candidate;break}}
  rootZs.push(z);const root=[rootX,baseY,z];
  const r=routeBranch(occupied,protectedAir,originalInputs[index],root,m.bounds);
  for(const b of r.blocks){const old=occupied.get(key(b.position));if(old){if(old.block!==b.block&&!(isGlass(state(old.block))&&isGlass(state(b.block))))throw Error('自动启动线支撑冲突');continue}put(b.position,b.block)}
  branches.push({...r,root,index});
 }
 // A common bottom bus is followed by separate, pulse-preserving delay banks.
 const zs=branches.map(b=>b.root[2]),minZ=Math.min(...zs)-4,maxZ=Math.max(...zs),busRepeaters=[];
 let run=0;for(let z=minZ+1;z<=maxZ;z++){
  if(run>=10&&!zs.some(v=>Math.abs(v-z)<=1)){busRepeaters.push(z);run=0}else if(++run>14)throw Error('自动启动总线超出红石信号距离');
 }
 for(const b of branches){const before=busRepeaters.filter(z=>z<=b.root[2]);b.busDelay=before.length;b.busStrength=16-(b.root[2]-(before.at(-1)??minZ))}
 let common=Math.max(...branches.map(b=>b.delay+b.busDelay))+1,bankLength;
 for(;;){for(const b of branches)b.bankDelay=common-b.delay-b.busDelay;bankLength=Math.max(...branches.map(b=>b.bankDelay));if(branches.every(b=>b.bankDelay===1?bankLength<=b.busStrength:b.bankDelay>=Math.ceil((bankLength-1)/15)+1))break;common++}
 const busX=rootX-bankLength-1;
 const input={marker:[busX,baseY-1,minZ],repeater:[busX,baseY,minZ],wire:[busX,baseY,minZ-1],direction:[0,0,1],startTick:0};
 put(input.marker,'lime_stained_glass');put(input.repeater,rep(input.direction));
 put(input.wire,'redstone_wire');put(add(input.wire,[0,-1,0]),'glass');
 for(let z=minZ+1;z<=maxZ;z++){put([busX,baseY,z],busRepeaters.includes(z)?rep([0,0,1]):'redstone_wire');put([busX,baseY-1,z],'glass')}
 for(const b of branches){const indexes=new Set(b.bankDelay===1?[bankLength-1]:Array.from({length:b.bankDelay},(_,i)=>Math.round(i*(bankLength-1)/(b.bankDelay-1))));
  if(indexes.size!==b.bankDelay)throw Error('自动启动线延迟补偿失败');
  for(let j=0;j<bankLength;j++){put([busX+1+j,baseY,b.root[2]],indexes.has(j)?rep([1,0,0]):'redstone_wire');put([busX+1+j,baseY-1,b.root[2]],'glass')}
 }
 return finishExternal(source,m,occupied,external,originalInputs,input,branches,common+1);
}
function finishExternal(source,m,occupied,external,originalInputs,input,branches,delay){
 m.blocks=[...occupied.values()];m.inputs=[input];m.button=null;
 // This is a common startup offset, never a change to music-relative timing.
 m.notes=m.notes.map(n=>({...n,tick:n.tick+delay}));measure(m);
 const startInfo={enabled:true,bodyBounds:structuredClone(source.bounds),bodyDimensions:[...source.dimensions],bodyVolume:source.volume,bodyBlockCount:source.blocks.length,
  externalBlockCount:external.length,addedStartupRedstoneTicks:delay,pulseRedstoneTicks:1,
  originalInputs,commonInput:input,branches:branches.map(b=>({input:b.index,routeDelay:b.delay,busDelay:b.busDelay,compensationDelay:b.bankDelay,totalDelay:delay})),
  routingTemplate:'folded-glass-sparse-repeaters',repeaterCount:external.filter(b=>b.block.startsWith('repeater[')).length,boundsExcludedFromSearch:true,runtimeVerified:false};
 // Validate the startup circuit separately even for experimental recurrent
 // music: the receivers are replaced by independent witness notes.
 const witnesses={blocks:[...external],inputs:[input],notes:[]};
 for(let i=0;i<originalInputs.length;i++){const v=originalInputs[i],position=add(v.repeater,v.direction);witnesses.blocks.push({position:v.repeater,block:rep(v.direction)},{position:v.marker,block:'glass'},{position,block:'note_block[instrument=harp,note=0,powered=false]'});witnesses.notes.push({position,tick:delay})}
 startInfo.audit=auditSignals(witnesses);
 if(!startInfo.audit.pass)throw Error('自动启动线同步检查失败：'+JSON.stringify(startInfo.audit.errors[0]));
 if(!m.hybridNetwork&&!m.loop&&!m.hopperTimer){const union=auditSignals(m);if(!union.pass)throw Error('自动启动线整机检查失败：'+JSON.stringify(union.errors[0]));startInfo.unionAudit=union}
 m.externalStart=startInfo;
 return m;
}
module.exports={connectExternalStart,routeBranch};
