'use strict';
const {noteValue}=require('./quinn.cjs');const set=(position,block)=>({position,block});
const {names,bases}=require('./normalize.cjs');
const {plan}=require('./planner.cjs');
function design(song,{cap=20,rows=2,origin=[0,2,0],counts=null,rowShifts=null,support='cobblestone',spacing=3,buttonMode='floor',branchMode='delayed'}={}){
 const planned=plan(song,{cap,rows,origin,counts,rowShifts,spacing,buttonMode,branchMode});
 const {rowInfo,zlist,layerZ}=planned;
 const groups=planned.groups.map(g=>({...g}));
 const m=new Map(),notes=[],connections=[],sand=[];
 const put=(p,b)=>{let k=p.join(),old=m.get(k);if(old&&old.block!==b)throw Error(`Collision ${k}: ${old.block} / ${b}`);m.set(k,set(p,b))};
 const wire=(p,base=support)=>{put([p[0],p[1]-1,p[2]],base);put(p,'redstone_wire')};
 const facing=(a,b)=>b[0]>a[0]?'west':b[0]<a[0]?'east':b[2]>a[2]?'north':'south';
 const rep=(p,d,f,base=support)=>{put([p[0],p[1]-1,p[2]],base);put(p,`repeater[facing=${f},delay=${d},powered=false,locked=false]`)};
 const note=(n,p)=>{put([p[0],p[1]-1,p[2]],bases[n.instrument]);if(n.instrument===3)sand.push([p[0],p[1]-2,p[2]]);put(p,`note_block[instrument=${names[n.instrument]},note=${noteValue(n)},powered=false]`);notes.push({...n,position:p,note:noteValue(n),instrumentName:names[n.instrument]})};
 const route=(a,b,gap,kind,dir,spatial)=>{let p=[a.slice()],c=a.slice();const go=(axis,val)=>{while(c[axis]!==val){c=c.slice();c[axis]+=Math.sign(val-c[axis]);p.push(c)}};
 if(kind==='straight')go(0,b[0]);else{const outer=dir>0?origin[0]+3*(cap-1)+3:origin[0]-2;go(0,outer);if(kind==='layer'){for(let k=0;k<3;k++){c=[c[0],c[1]+1,a[2]+(k%2===0?(spatial===0?-1:1):0)];p.push(c)}go(0,b[0]);go(2,b[2])}else{go(2,b[2]);go(0,b[0])}}
 if(c.join()!==b.join())throw Error('route');const last=p.length-1,candidates=[];for(let i=1;i<last;i++){let a=p[i-1],b=p[i],c=p[i+1];if(a[1]===b[1]&&b[1]===c[1]&&b[0]-a[0]===c[0]-b[0]&&b[2]-a[2]===c[2]-b[2])candidates.push(i)}
 let chosen=[],relay=-1;if(branchMode==='direct'){
  let booster=last-1;if(!candidates.includes(booster)){booster=last-2;relay=last-1;if(!candidates.includes(booster)||p[relay][1]!==p[last][1])throw Error('No output booster space')}
  chosen=[booster];let at=booster;
  while(at>14){const next=candidates.find(i=>i>=at-14&&i<at);if(next===undefined)throw Error('No repeater space');chosen.unshift(next);at=next}
 }else if(kind==='straight')chosen=gap<=4?[1]:[1,2];else{let prev=0;while(last-prev>13){let opts=candidates.filter(i=>i>prev&&i<=prev+13);if(!opts.length)throw Error('No repeater space');prev=opts.at(-1);chosen.push(prev)}if(!chosen.length)chosen=[candidates[0]]}
 while(chosen.length<Math.ceil(gap/4)){let q=candidates.find(i=>!chosen.includes(i));if(q===undefined)throw Error('No delay space');chosen.push(q);chosen.sort((a,b)=>a-b)}if(chosen.length>gap)throw Error(`Insufficient ticks ${kind} ${gap}/${chosen.length}`);
 let left=gap,ds=new Map();chosen.forEach((i,k)=>{let d=Math.min(4,left-chosen.length+k+1);ds.set(i,d);left-=d});p.forEach((v,i)=>{const base=kind==='straight'||i===0||i===last?support:'glass';if(i===relay){put([v[0],v[1]-1,v[2]],base);put(v,support)}else ds.has(i)?rep(v,ds.get(i),facing(p[i-1],p[i+1]),base):wire(v,base)});connections.push({kind,gap,path:p,repeaters:[...ds],relay})};
 let prev=null;
 for(const row of rowInfo){let {y,z,branch,startX}=row;
 for(let j=0;j<row.count;j++){const g=groups[row.index+j],x=startX+row.dir*3*j,clock=[x,y+1,z];g.clock=clock;g.branchVector=[0,0,branch];if(prev)route(prev.clock,clock,g.tick-prev.tick,j?'straight':row.local===0?'layer':'row',prev.dir,row.spatial);else wire(clock);
 const firstK=branchMode==='direct'?1:2;
 if(branchMode==='delayed')rep([x,y+1,z+branch],1,branch>0?'north':'south');for(let k=firstK;k<=g.depth;k++)wire([x,y+1,z+branch*k]);
 const sandSide=row.layer%2?-1:1,slots=[];for(let k=firstK;k<=g.depth;k++)slots.push([x+sandSide,y,z+branch*k]);for(let k=firstK;k<=g.depth;k++)slots.push([x-sandSide,y,z+branch*k]);
 const ordered=[...g.notes.filter(n=>n.instrument===3),...g.notes.filter(n=>n.instrument!==3)];ordered.forEach((n,i)=>note(n,slots[i]));prev={...g,dir:row.dir};
 }}
 let reusedSandSupports=0;for(const p of sand){if(m.has(p.join()))reusedSandSupports++;else put(p,support)}
 const first=groups[0].clock;
 let button=null,inputs=[];
 if(buttonMode==='external'){
  const repeater=[first[0]-1,first[1],first[2]],marker=[first[0]-1,first[1]-1,first[2]];
  rep(repeater,1,'west','lime_stained_glass');
  inputs.push({marker,repeater,wire:[first[0]-2,first[1],first[2]],direction:[1,0,0],startTick:0});
 }else if(buttonMode==='buffered'){
  const anchor=[first[0]-2,first[1],first[2]];
  put([anchor[0],anchor[1]-1,anchor[2]],support);put(anchor,'lime_concrete');
  rep([first[0]-1,first[1],first[2]],1,'west');
  button=[anchor[0],anchor[1],anchor[2]-1];put(button,'stone_button[face=wall,facing=north,powered=false]');
 }else if(buttonMode==='wall'){
  button=[first[0]-1,first[1]-1,first[2]];
  m.set([first[0],first[1]-1,first[2]].join(),set([first[0],first[1]-1,first[2]],'lime_concrete'));
  put(button,'stone_button[face=wall,facing=west,powered=false]');
 }else{
  button=[first[0],first[1],first[2]-2];wire([first[0],first[1],first[2]-1]);put([button[0],button[1]-1,button[2]],'lime_concrete');put(button,'stone_button[face=floor,facing=north,powered=false]');
 }
 if(groups.some(g=>g.depth>15))throw Error('音符分支超出信号范围'); const covered=notes.filter(n=>m.has([n.position[0],n.position[1]+1,n.position[2]].join()));if(covered.length)throw Error('Covered notes '+covered.length);
 const blocks=[...m.values()].sort((a,b)=>a.position[1]-b.position[1]);const bounds=[0,1,2].map(i=>blocks.reduce((a,b)=>[Math.min(a[0],b.position[i]),Math.max(a[1],b.position[i])],[Infinity,-Infinity]));let dimensions=bounds.map(([a,b])=>b-a+1);
 return {origin,cap,rows,zlist,layerZ,rowInfo,rowShifts:rowInfo.map(r=>r.shift),notes,groups:groups.map(g=>({tick:g.tick,count:g.notes.length,depth:g.depth,clock:g.clock,branchVector:g.branchVector})),connections,blocks,bounds,dimensions,volume:dimensions.reduce((a,b)=>a*b,1),button,inputs,reusedSandSupports,layerPitch:3,spacing,support,buttonMode,branchMode};
}
module.exports={design};
