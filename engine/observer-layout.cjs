'use strict';
const {noteValue}=require('./quinn.cjs');
// Experimental clock topology. Observers carry the pulse through a 3-D walk;
// side observers drive solid note blocks plus up to two adjacent note blocks.
// This is deliberately separate from the repeater-only electrical auditor.
const {names,bases}=require('./normalize.cjs');
const {measure}=require('./parallel-layout.cjs');
const directions=[[1,0,0],[0,0,1],[-1,0,0],[0,0,-1]],six=[...directions,[0,1,0],[0,-1,0]];
const add=(a,b)=>a.map((v,i)=>v+b[i]),key=p=>p.join(),distance=(a,b)=>a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0);
const face=d=>d[0]>0?'east':d[0]<0?'west':d[1]>0?'up':d[1]<0?'down':d[2]>0?'south':'north';
function designObserverPath(song,path,{support='cobblestone',phase=0}={}){
 const last=Math.max(...song.notes.map(n=>n.tick));if(path.length<=last)throw Error('Observer clock path too short');path=path.slice(0,last+1);
 const map=new Map(),air=new Set(),outputs=new Set(),notes=[],noteAt=new Map(),strong=new Map(),branches=[],clocks=[];
 const put=(p,block)=>{const k=key(p),old=map.get(k);if(air.has(k)||old&&old.block!==block)throw Error('Observer geometry collision '+k);map.set(k,{position:p,block})};
 const first=path[0],source=add(first,[0,-1,0]),rep=add(source,[-1,0,0]),wire=add(rep,[-1,0,0]),marker=add(rep,[0,-1,0]);
 put(source,'note_block[instrument=harp,note=0,powered=false]');put(marker,'lime_stained_glass');put(rep,'repeater[facing=west,delay=1,powered=false,locked=false]');
 // The source note is covered by the first observer, and therefore silent.
 for(let t=0;t<path.length;t++){const p=path[t],prev=t?path[t-1]:source;if(distance(p,prev)!==1||map.has(key(p)))throw Error('Observer path repeats or jumps');const d=prev.map((v,i)=>v-p[i]);put(p,`observer[facing=${face(d)},powered=false]`);outputs.add(key(add(p,d.map(v=>-v))));clocks.push({position:p,observes:prev,tick:t})}
 const timeline=new Map();for(const n of song.notes){if(!timeline.has(n.tick))timeline.set(n.tick,[]);timeline.get(n.tick).push(n)}
 const testGroup=(tick,ns,dir)=>{
  const clock=path[tick],observer=add(clock,dir),center=add(observer,dir),side=[-dir[2],0,dir[0]],positions=[center,add(center,side),add(center,side.map(v=>-v))];
  const chosen=[...ns].sort((a,b)=>(b.instrument===3)-(a.instrument===3)),changes=[],newAir=[];
  changes.push({position:observer,block:`observer[facing=${face(dir.map(v=>-v))},powered=false]`});
  for(let j=0;j<chosen.length;j++){const n=chosen[j],p=positions[j],base=add(p,[0,-1,0]);changes.push({position:p,block:`note_block[instrument=${names[n.instrument]},note=${noteValue(n)},powered=false]`},{position:base,block:bases[n.instrument]});if(n.instrument===3)changes.push({position:add(p,[0,-2,0]),block:support});newAir.push(add(p,[0,1,0]));
   for(const d of [[0,0,0],...six]){const s=strong.get(key(add(p,d)));if(s!==undefined&&s!==tick)return null}
  }
  for(const d of [[0,0,0],...six]){const n=noteAt.get(key(add(center,d)));if(n&&n.tick!==tick)return null}
  const local=new Map();for(const b of changes){const k=key(b.position),old=map.get(k),own=local.get(k);if(air.has(k)||old&&old.block!==b.block||own&&own!==b.block||outputs.has(k)&&!b.block.startsWith('observer['))return null;local.set(k,b.block)}
  if(newAir.some(p=>map.has(key(p))||local.has(key(p))))return null;
  return{changes,newAir,observer,center,clock,notes:chosen.map((n,j)=>({...n,position:positions[j],note:noteValue(n),instrumentName:names[n.instrument]}))};
 };
 for(const [tick,ns]of timeline){if(ns.length>12)throw Error('Observer radial chord exceeds 12');let chosen=null;
  // Enumerate all distributions so a blocked wing need not reject a usable side.
  const rotated=directions.map((_,i)=>directions[(i+tick+phase)%4]);
  const visit=(index,remaining,groups)=>{if(!remaining.length){chosen=groups;return true}if(index===4||remaining.length>(4-index)*3)return false;
   for(let count=Math.min(3,remaining.length);count>=0;count--){const g=count?testGroup(tick,remaining.slice(0,count),rotated[index]):null;if(count&&!g)continue;if(visit(index+1,remaining.slice(count),count?[...groups,g]:groups))return true}return false};
  visit(0,ns,[]);if(!chosen)throw Error('Observer radial space exhausted at '+tick);
  for(const g of chosen){for(const b of g.changes)put(b.position,b.block);for(const p of g.newAir)air.add(key(p));for(const n of g.notes){notes.push(n);noteAt.set(key(n.position),n)}strong.set(key(g.center),tick);branches.push({tick,clock:g.clock,observer:g.observer,center:g.center,notes:g.notes.map(n=>n.position)})}
 }
 // A clock output may only enter another observer or empty space. A conductor
 // there could power a note or base at an unintended time.
 for(const p of outputs){const b=map.get(p);if(b&&!b.block.startsWith('observer['))throw Error('Observer clock stray output '+p)}
 const m=measure({blocks:[...map.values()],notes,inputs:[{marker,repeater:rep,wire,direction:[1,0,0],startTick:0}],connections:[],groups:[],rowInfo:[],clockSolids:[],button:null,buttonMode:'external',branchMode:'observer-experimental',template:'observer-walk',observerNetwork:{source,clocks,branches,pulseWidthGameTicks:2},origin:[0,0,0]});
 return m;
}
function columnPath(length,{height=20,columns=6,pitch=5}={}){
 const path=[[0,3,0]];let column=0;
 const move=(axis,target)=>{while(path.at(-1)[axis]!==target&&path.length<length){const p=[...path.at(-1)];p[axis]+=Math.sign(target-p[axis]);path.push(p)}};
 while(path.length<length){move(1,column%2?3:3+height-1);column++;const row=Math.floor(column/columns),col=row%2?columns-1-column%columns:column%columns;move(0,col*pitch);move(2,row*pitch)}return path;
}
module.exports={designObserverPath,columnPath};
