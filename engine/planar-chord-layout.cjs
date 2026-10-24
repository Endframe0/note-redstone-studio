'use strict';
const {noteValue}=require('./quinn.cjs');
const {names,bases}=require('./normalize.cjs'),{measure}=require('./parallel-layout.cjs');
// Parallel delayed three-note branches share a flat input comb. Every branch
// has the same delay; strong note outputs also feed the following input comb.
// This avoids dust above the notes. The input diode adds one RT beyond the
// ordinary chord-bus latency; callers must compensate for that explicitly.
function compilePlanarCells(song){
 const events=new Map();for(const n of song.notes){if(!Number.isInteger(n.tick)||n.tick<0)throw Error('Planar ticks must be nonnegative integers');if(!events.has(n.tick))events.set(n.tick,[]);events.get(n.tick).push(n)}
 const cells=[];let previous=-1;
 for(const [tick,notes]of [...events].sort((a,b)=>a[0]-b[0])){
  if(notes.length>6)throw Error('Planar prototype supports chords up to six');let delay=tick-previous;
  while(delay>4){previous+=4;cells.push({tick:previous,delay:4,notes:[]});delay-=4}
  cells.push({tick,delay,notes});previous=tick;
 }
 if(!cells.length)throw Error('Empty planar song');
 return cells;
}
const depthOf=c=>3*(Math.max(1,Math.ceil(c.notes.length/3))-1);
function adaptivePlanarCounts(cells,cap,interleaved=false){
 // A row's width depends on its richest chord. Move the cut so sparse and
 // dense chords need not reserve the same depth throughout every fixed row.
 // The exact turn must still carry the next input fanout within 15 dust.
 const cost=Array(cells.length+1).fill(Infinity),choice=[];cost[cells.length]=0;
 for(let at=cells.length-1;at>=0;at--){let depth=0;
  for(let n=1;n<=cap&&at+n<=cells.length;n++){
   depth=Math.max(depth,depthOf(cells[at+n-1]));const end=at+n;
   if(end<cells.length&&3*(cap-n)+depth+(interleaved?6:5)+depthOf(cells[end])>15)continue;
   const candidate=depth+(interleaved?2:3)+cost[end];if(candidate<cost[at]||candidate===cost[at]&&n>choice[at]){cost[at]=candidate;choice[at]=n}
  }
 }
 if(!Number.isFinite(cost[0]))throw Error('No feasible planar partition');
 const counts=[];for(let at=0;at<cells.length;at+=choice[at])counts.push(choice[at]);return counts;
}
function designPlanarChord(song,{cap=12,support='cobblestone',cutMode='greedy',rowCounts,interleaved=false}={}){
 if(!Number.isInteger(cap)||cap<2||cap>128)throw Error('Invalid planar capacity');
 if(!['greedy','adaptive'].includes(cutMode))throw Error('Invalid planar cut mode');
 const cells=compilePlanarCells(song),counts=rowCounts||(cutMode==='adaptive'?adaptivePlanarCounts(cells,cap,interleaved):Array.from({length:Math.ceil(cells.length/cap)},(_,i)=>Math.min(cap,cells.length-i*cap)));
 if(!Array.isArray(counts)||counts.some(n=>!Number.isInteger(n)||n<1||n>cap)||counts.reduce((a,b)=>a+b,0)!==cells.length)throw Error('Invalid planar row counts');
 const rows=[];let z=0,at=0;for(const count of counts){const list=cells.slice(at,at+count),depth=Math.max(...list.map(depthOf));rows.push({list,z,depth,dir:rows.length%2?-1:1});z+=depth+(interleaved?2:3);at+=count}
 const map=new Map(),notes=[],put=(p,block)=>{const old=map.get(p.join());if(old&&old.block!==block)throw Error('Planar collision '+p);map.set(p.join(),{position:p,block})},part=(p,b,base=support)=>{put([p[0],p[1]-1,p[2]],base);put(p,b)},wire=p=>part(p,'redstone_wire','glass');
 const rep=(p,delay,face,base)=>part(p,`repeater[facing=${face},delay=${delay},powered=false,locked=false]`,base);
 const note=(n,p)=>{part(p,`note_block[instrument=${names[n.instrument]},note=${noteValue(n)},powered=false]`,bases[n.instrument]);if(n.instrument===3)put([p[0],p[1]-2,p[2]],support);notes.push({...n,position:p,note:noteValue(n),instrumentName:names[n.instrument]})};
 const width=3*cap,folds=[];
 rows.forEach((row,ri)=>{
  const start=row.dir>0?0:width-(interleaved?3:1);row.start=start;
  row.list.forEach((c,i)=>{
   const x=start+row.dir*3*i,banks=Math.max(1,Math.ceil(c.notes.length/3));
   for(let dz=0;dz<3*banks-2;dz++)wire([x,2,row.z+dz]);
   for(let b=0;b<banks;b++){
    const zz=row.z+3*b;rep([x+row.dir,2,zz],c.delay,row.dir>0?'west':'east');
    const ns=c.notes.slice(b*3,b*3+3),center=[x+2*row.dir,2,zz];
    if(!ns.length)part(center,support);else ns.forEach((n,j)=>note(n,[center[0],2,center[2]+[0,-1,1][j]]));
   }
  });
  if(ri){const prev=rows[ri-1],from=[prev.start+prev.dir*(3*prev.list.length-1),2,prev.z],target=[start,2,row.z],outer=prev.dir>0?width:interleaved?-3:-1,path=[from];let p=[...from];
   const go=(axis,value)=>{while(p[axis]!==value){p=[...p];p[axis]+=Math.sign(value-p[axis]);path.push(p)}};go(0,outer);go(2,target[2]);go(0,target[0]);
   const fanout=3*(Math.max(1,Math.ceil(row.list[0].notes.length/3))-1);if(path.length-1+fanout>15)throw Error('Planar fold exceeds dust range');
   path.slice(1,-1).forEach(wire);folds.push(path);
  }
 });
 rep([-1,2,0],1,'west','lime_stained_glass');
 for(const n of notes)if(map.has([n.position[0],3,n.position[2]].join()))throw Error('Covered planar note');
 return measure({blocks:[...map.values()],notes,inputs:[{marker:[-1,1,0],repeater:[-1,2,0],wire:[-2,2,0],direction:[1,0,0],startTick:0}],groups:[],connections:[],clockSolids:[],rowInfo:[],buttonMode:'external',busNetwork:true,branchMode:'planar-chord-experimental',template:'planar-chord',latencyRT:2,planarParams:{cap,...(cutMode!=='greedy'||rowCounts?{cutMode,rowCounts:counts}:{}),...(interleaved?{interleaved:true}:{})},cells,folds});
}
module.exports={designPlanarChord,compilePlanarCells,adaptivePlanarCounts};
