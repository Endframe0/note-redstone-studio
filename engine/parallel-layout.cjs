'use strict';
const {design}=require('./layout.cjs'),{audit,state,solid,dirs}=require('./electrical.cjs');
const neighbors=[...Object.values(dirs),[0,1,0],[0,-1,0]],add=(a,b)=>a.map((v,i)=>v+b[i]);
function splitSong(song,{count=2,scheme='round-robin',seed=0}={}){
 if(!Number.isInteger(count)||count<1||count>8)throw Error('并行线路数必须为 1–8');
 const lanes=Array.from({length:count},()=>[]),events=song.events.filter(e=>e.notes.length),loads=Array(count).fill(0);
 events.forEach((e,i)=>{
  if(scheme==='triples')e.notes.forEach((n,j)=>lanes[(Math.floor(j/3)+seed)%count].push(n));
  else if(scheme==='voices')e.notes.forEach((n,j)=>lanes[(j+seed)%count].push(n));
  else{let lane=(i+seed)%count;if(scheme==='balanced'){lane=loads.indexOf(Math.min(...loads));loads[lane]+=Math.max(1,Math.ceil(e.notes.length/2))+((i+seed)%3)*.01}lanes[lane].push(...e.notes)}
 });
 return lanes.filter(a=>a.length).map(notes=>{const map=new Map([[0,[]]]);for(const n of notes){if(!map.has(n.tick))map.set(n.tick,[]);map.get(n.tick).push(n)}let prev=0;for(const t of [...map.keys()].sort((a,b)=>a-b)){while(t-prev>8){prev+=8;map.set(prev,[])}prev=t}return{...song,notes,events:[...map].sort((a,b)=>a[0]-b[0]).map(([tick,notes])=>({tick,notes}))}});
}
function rotate(p,r){for(let i=0;i<r;i++)p=[-p[2],p[1],p[0]];return p}
function transform(m,{rotation=0,offset=[0,0,0]}={}){
 const point=p=>add(rotate(p,rotation),offset),vector=p=>rotate(p,rotation),face=f=>Object.entries(dirs).find(([,d])=>d.join()===vector(dirs[f]).join())[0];
 const result={...m,blocks:m.blocks.map(b=>({position:point(b.position),block:b.block.replace(/facing=(north|south|east|west)/,(_,f)=>'facing='+face(f))})),notes:m.notes.map(n=>({...n,position:point(n.position)})),groups:m.groups.map(g=>({...g,clock:point(g.clock),branchVector:vector(g.branchVector)})),connections:m.connections.map((c,i)=>({...c,path:c.path.map(point),startTick:c.startTick??m.groups[i].tick,endTick:c.endTick??m.groups[i+1].tick,endDepth:c.endDepth??m.groups[i+1].depth})),inputs:m.inputs.map(p=>({...p,marker:point(p.marker),repeater:point(p.repeater),wire:point(p.wire),direction:vector(p.direction)})),button:null};
 result.clockSolids=(m.clockSolids||[]).map(c=>({...c,position:point(c.position)}));
 if(m.containers)result.containers=m.containers.map(c=>({...c,position:point(c.position),inventory:c.inventory.map(i=>({...i}))}));
 if(m.outputs)result.outputs=m.outputs.map(o=>({...o,position:point(o.position),direction:vector(o.direction)}));
 return measure(result);
}
function measure(m){m.bounds=[0,1,2].map(i=>m.blocks.reduce((a,b)=>[Math.min(a[0],b.position[i]),Math.max(a[1],b.position[i])],[Infinity,-Infinity]));m.dimensions=m.bounds.map(b=>b[1]-b[0]+1);m.volume=m.dimensions.reduce((a,b)=>a*b,1);return m}
function merge(models){const blocks=[],notes=[],groups=[],connections=[],inputs=[],clockSolids=[],seen=new Set();for(let i=0;i<models.length;i++){const m=models[i];for(const b of m.blocks){const k=b.position.join();if(seen.has(k))throw Error('并行线路方块重叠');seen.add(k);blocks.push(b)}notes.push(...m.notes.map(n=>({...n,lane:i})));groups.push(...m.groups);connections.push(...m.connections);clockSolids.push(...(m.clockSolids||[]));inputs.push(...m.inputs.map(p=>({...p,lane:i})))}return measure({blocks,notes,groups,connections,inputs,clockSolids,button:null,buttonMode:'external',branchMode:'direct',rowInfo:[],origin:[0,0,0],tracks:models.length})}
function designParallel(song,params,support='cobblestone'){
 const tracks=splitSong(song,params.split);if(tracks.length!==params.parts.length)throw Error('并行分段不符');
 const models=tracks.map((s,i)=>{const template=params.parts[i].template||params.template;return transform((template==='spiral'?require('./path-layout.cjs').designSpiral:template.startsWith('chain')?require('./chain-layout.cjs').designChain:design)(s,{...params.parts[i],support,buttonMode:'external',branchMode:'direct'}),params.placements[i])});
 const m=merge(models);m.parallelParams=params;
 const actual=m.notes.map(n=>[n.tick,n.instrument,n.key].join()).sort(),wanted=song.notes.map(n=>[n.tick,n.instrument,n.key].join()).sort();if(JSON.stringify(actual)!==JSON.stringify(wanted))throw Error('并行线路漏音或重复音');
 const check=audit(m);if(!check.pass)throw Error('并行电路检查失败：'+check.errors[0].type);m.audit=check;return m;
}
// Pairwise exclusions protect component operation during packing. Full electrical
// audit is still required, including the union, before any layout can be exported.
function cells(m){const occupied=new Map(m.blocks.map(b=>[b.position.join(),state(b.block)])),forbidden=new Map();
 const forbid=(p,mask)=>{const k=p.join();forbidden.set(k,(forbidden.get(k)||0)|mask)};
 const type=s=>s.name==='redstone_wire'?2:s.name==='repeater'?4:s.name==='note_block'?8:solid(s)?16:32;
 const records=m.blocks.map(b=>({p:b.position,type:type(state(b.block))}));
 for(const b of m.blocks){const s=state(b.block),p=b.position;forbid(p,63);
  if(s.name==='note_block')forbid(add(p,[0,1,0]),63);
  if(s.name==='redstone_wire'){
   // No foreign electrical neighbor, including glass stairs. Keep the upward
   // connection clearance and avoid a newly powered foreign support block.
   forbid(add(p,[0,1,0]),63);for(const d of Object.values(dirs))for(const y of [-1,0,1])forbid(add(p,[d[0],y,d[2]]),2|4);
   for(const d of Object.values(dirs))forbid(add(p,d),16|8);
   const below=add(p,[0,-1,0]);if(solid(occupied.get(below.join())))for(const d of neighbors)forbid(add(below,d),8);
  }
  if(s.name==='repeater'){for(const d of Object.values(dirs))forbid(add(p,d),2|4|8|16)}
 }
 for(const c of m.clockSolids||[])for(const d of neighbors)forbid(add(c.position,d),2|4|8|16);
 for(const c of m.connections)if(c.relay>=0)for(const d of neighbors)forbid(add(c.path[c.relay],d),8);
 for(const input of m.inputs){forbid(input.wire,63);const support=add(input.wire,[0,-1,0]);forbid(support,63);forbid(add(input.wire,[0,1,0]),63);for(const d of Object.values(dirs)){forbid(add(input.wire,d),2|4|8|16);for(const y of [-1,1])forbid(add(input.wire,[d[0],y,d[2]]),2|4)}for(const d of neighbors)forbid(add(support,d),8)}
 return{records,forbidden};
}
function compatible(a,b,offset){for(const r of b.records){if((a.forbidden.get(add(r.p,offset).join())||0)&r.type)return false}for(const r of a.records){if((b.forbidden.get(r.p.map((v,i)=>v-offset[i]).join())||0)&r.type)return false}return true}
module.exports={splitSong,transform,merge,measure,designParallel,cells,compatible};
