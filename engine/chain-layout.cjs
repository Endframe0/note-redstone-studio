'use strict';
const {noteValue}=require('./quinn.cjs');
const {names,bases}=require('./normalize.cjs');
function chainSong(song){const map=new Map([[0,[]]]);for(const n of song.notes){if(!map.has(n.tick))map.set(n.tick,[]);map.get(n.tick).push(n)}let prev=0;for(const t of [...map.keys()].sort((a,b)=>a-b)){while(t-prev>4){prev+=4;map.set(prev,[])}prev=t}return{...song,events:[...map].sort((a,b)=>a[0]-b[0]).map(([tick,notes])=>({tick,notes}))}}
function chainRows(song,{cap=20,rows=4,counts=null,compact=false,interleave=false,layerHeight=3}={}){
 const result=[];let index=0,width=compact?0:2*(cap-1);
 while(index<song.events.length){const r=result.length,count=counts?counts[r]:Math.min(cap,song.events.length-index);if(!Number.isInteger(count)||count<1||count>cap||index+count>song.events.length)throw Error('Chain counts');
  const events=song.events.slice(index,index+count).filter((e,j)=>!compact||j===0||j===count-1||e.notes.length),steps=[];let dx=0;
  events.forEach((e,j)=>{if(j)dx+=compact?2*Math.ceil((1+Math.ceil((e.tick-events[j-1].tick)/4))/2):2;steps.push({e,dx})});width=Math.max(width,dx);
  const layer=Math.floor(r/rows),local=r%rows,spatial=layer%2?rows-1-local:local,dir=r%2?-1:1;
  result.push({index,count,layer,local,spatial,dir,y:1+layer*layerHeight,z:spatial*(interleave?2:3),branch:0,shift:0,steps});index+=count;
 }if(counts&&counts.length!==result.length)throw Error('Chain count total');
 for(const r of result)r.startX=r.layer%2+(r.dir>0?0:width-(interleave?1:0));return result;
}
function designChain(source,{cap=20,rows=4,counts=null,compact=false,interleave=false,layerHeight=3,support='cobblestone'}={}){
 if(![3,4].includes(layerHeight))throw Error('Chain layer height must be 3 or 4');
 const song=chainSong(source),map=new Map(),groups=[],notes=[],connections=[],rowInfo=chainRows(song,{cap,rows,counts,compact,interleave,layerHeight});
 const put=(p,b)=>{const k=p.join(),old=map.get(k);if(old&&old.block!==b)throw Error('Chain collision '+k);map.set(k,{position:p,block:b})};
 const wire=p=>{put([p[0],p[1]-1,p[2]],'glass');put(p,'redstone_wire')};
 const facing=(a,b)=>b[0]>a[0]?'west':b[0]<a[0]?'east':b[2]>a[2]?'north':'south';
 const rep=(p,delay,face,base=support)=>{put([p[0],p[1]-1,p[2]],base);put(p,`repeater[facing=${face},delay=${delay},powered=false,locked=false]`)};
 const note=(n,p)=>{put([p[0],p[1]-1,p[2]],bases[n.instrument]);if(n.instrument===3)put([p[0],p[1]-2,p[2]],support);put(p,`note_block[instrument=${names[n.instrument]},note=${noteValue(n)},powered=false]`);notes.push({...n,position:p,note:noteValue(n),instrumentName:names[n.instrument]})};
 function route(a,b,gap,kind,dir,spatial){let p=[a.slice()],c=a.slice();const go=(axis,value)=>{while(c[axis]!==value){c=c.slice();c[axis]+=Math.sign(value-c[axis]);p.push(c)}};
  if(kind==='straight')go(0,b[0]);else{const outer=dir>0?Math.max(a[0],b[0])+2:Math.min(a[0],b[0])-2;go(0,outer);if(kind==='layer'){for(let k=0;k<layerHeight;k++){c=[c[0],c[1]+1,a[2]+(layerHeight===4?[1,2,3,2][k]:[1,2,1][k])*(spatial===0?-1:1)];p.push(c)}go(2,b[2]);go(0,b[0])}else{go(2,b[2]);go(0,b[0])}}
  const last=p.length-1,choices=[];for(let i=1;i<last;i++){const a=p[i-1],b=p[i],c=p[i+1];if(a[1]===b[1]&&b[1]===c[1]&&b[0]-a[0]===c[0]-b[0]&&b[2]-a[2]===c[2]-b[2])choices.push(i)}
  if(!choices.includes(last-1))throw Error('Chain no final booster '+JSON.stringify({kind,p}));let selected=[last-1],at=last-1;while(at>14){const next=choices.find(i=>i>=at-14&&i<at);if(next===undefined)throw Error('Chain signal range');selected.unshift(next);at=next}
  if(selected.length>gap)throw Error('Chain fold timing');while(selected.length<Math.ceil(gap/4)){const next=choices.find(i=>!selected.includes(i));if(next===undefined)throw Error('Chain delay space');selected.push(next);selected.sort((a,b)=>a-b)}
  let left=gap;const ds=new Map(selected.map((v,i)=>{const delay=Math.min(4,left-selected.length+i+1);left-=delay;return[v,delay]}));for(let i=1;i<last;i++){if(ds.has(i))rep(p[i],ds.get(i),facing(p[i-1],p[i+1]),kind==='straight'?support:'glass');else wire(p[i])}connections.push({kind,gap,path:p,repeaters:[...ds],relay:-1});
 }
 let prev=null;
 for(const row of rowInfo){const {local,spatial,dir,z,startX}=row,y=row.y+1;
  for(let j=0;j<row.steps.length;j++){const {e,dx}=row.steps[j];if(e.notes.length>3)throw Error('Chain chord > 3');const clock=[startX+dir*dx,y,z],g={tick:e.tick,count:e.notes.length,depth:0,clock,branchVector:[0,0,0]};groups.push(g);
   if(e.notes.length){const ordered=[...e.notes].sort((a,b)=>(b.instrument===3)-(a.instrument===3));note(ordered[0],clock);if(ordered[1])note(ordered[1],[clock[0],y,z+1]);if(ordered[2])note(ordered[2],[clock[0],y,z-1])}else{put([clock[0],y-1,z],support);put(clock,support)}
   if(prev)route(prev.clock,clock,g.tick-prev.tick,j?'straight':local===0?'layer':'row',prev.dir,spatial);prev={...g,dir};
  }
 }
 const first=groups[0].clock,repeater=[first[0]-1,first[1],first[2]],marker=[first[0]-1,first[1]-1,first[2]],input=[first[0]-2,first[1],first[2]];rep(repeater,1,'west','lime_stained_glass');
 const blocks=[...map.values()],bounds=[0,1,2].map(i=>blocks.reduce((a,b)=>[Math.min(a[0],b.position[i]),Math.max(a[1],b.position[i])],[Infinity,-Infinity])),dimensions=bounds.map(b=>b[1]-b[0]+1);
 for(const n of notes)if(map.has([n.position[0],n.position[1]+1,n.position[2]].join()))throw Error('Chain covered note');
 return{blocks,notes,groups,connections,rowInfo,inputs:[{marker,repeater,wire:input,direction:[1,0,0],startTick:0}],clockSolids:groups.map(g=>({position:g.clock,tick:g.tick})),origin:[0,0,0],button:null,buttonMode:'external',branchMode:'direct',template:interleave?'chain-interleaved':compact?'chain-packed':'chain',compact,interleave,layerHeight,cap,rows,counts:rowInfo.map(r=>r.count),rowShifts:[],bounds,dimensions,volume:dimensions.reduce((a,b)=>a*b,1)};
}
function planChain(source,{cap=20,rows=4,counts=null,compact=false,interleave=false,layerHeight=3}={},prepared=null){
 const song=prepared||chainSong(source),bounds=[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]],mark=(p)=>p.forEach((v,i)=>{bounds[i][0]=Math.min(bounds[i][0],v);bounds[i][1]=Math.max(bounds[i][1],v)});let prev=null;
 for(const row of chainRows(song,{cap,rows,counts,compact,interleave,layerHeight})){const {local,spatial,dir,z,startX}=row,y=row.y+1;
  for(let j=0;j<row.steps.length;j++){const {e,dx}=row.steps[j];if(e.notes.length>3)throw Error('Chain notes');const x=startX+dir*dx;mark([x,y,z]);mark([x,y-1,z]);if(e.notes.length>1){mark([x,y,z+1]);mark([x,y-1,z+1])}if(e.notes.length>2){mark([x,y,z-1]);mark([x,y-1,z-1])}if(e.notes.some(n=>n.instrument===3))mark([x,y-2,z]);
   if(prev&&!j){const outer=prev.dir>0?Math.max(prev.x,x)+2:Math.min(prev.x,x)-2;mark([outer,prev.y-1,prev.z]);mark([outer,y,z]);if(local===0)mark([outer,y,prev.z+(layerHeight===4?3:2)*(spatial===0?-1:1)])}prev={x,y,z,dir};
  }
 }mark([-1,1,0]);mark([-1,2,0]);const dimensions=bounds.map(b=>b[1]-b[0]+1);return{bounds,dimensions,volume:dimensions.reduce((a,b)=>a*b,1)};
}
module.exports={designChain,chainSong,planChain,chainRows};
