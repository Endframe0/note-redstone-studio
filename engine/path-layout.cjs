'use strict';
const {noteValue}=require('./quinn.cjs');
// Experimental path-first circuit compiler: clocks are solid nodes, including
// corners, rather than rows joined by a separate dust detour.
const {names,bases}=require('./normalize.cjs');
const {measure}=require('./parallel-layout.cjs');
const directions=[[1,0,0],[0,0,1],[-1,0,0],[0,0,-1]];
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const delta=(a,b)=>b.map((v,i)=>Math.sign(v-a[i]));
const face=d=>d[0]>0?'west':d[0]<0?'east':d[2]>0?'north':'south';
function spiralPoints(width,depth,pitch=3){
 const out=[[0,2,0]];let left=0,right=width,top=0,bottom=depth,dir=0;
 while(left<right&&top<bottom){const p=out.at(-1),target=dir===0?[right,2,p[2]]:dir===1?[p[0],2,bottom]:dir===2?[left,2,p[2]]:[p[0],2,top];
  const distance=Math.abs(target[0]-p[0])+Math.abs(target[2]-p[2]);if(distance<2)break;
  let remain=distance;const d=delta(p,target);while(remain){const step=remain===3?3:2;if(remain<step)throw Error('Spiral parity');out.push(add(out.at(-1),d.map(v=>v*step)));remain-=step}
  if(dir===0&&out.length>2)top+=pitch;else if(dir===1)right-=pitch;else if(dir===2)bottom-=pitch;else if(dir===3)left+=pitch;dir=(dir+1)%4;
 }
 return out;
}
function designPath(song,points,{support='cobblestone',edgePaths={},autoRoute=true}={}){
 const events=song.events;if(points.length<events.length)throw Error('Path capacity');points=points.slice(0,events.length);
 const map=new Map(),groups=[],notes=[],connections=[],deferred=[],ports=new Set(),clockIndex=new Map(points.map((p,i)=>[p.join(),i]));
 const put=(p,block)=>{const key=p.join(),old=map.get(key);if(old&&old.block!==block)throw Error('Path collision '+key+' '+old.block+' / '+block);map.set(key,{position:p,block})};
 const rep=(p,d,f,base=support)=>{put(add(p,[0,-1,0]),base);put(p,`repeater[facing=${f},delay=${d},powered=false,locked=false]`)};
 const note=(n,p)=>{put(add(p,[0,-1,0]),bases[n.instrument]);if(n.instrument===3)put(add(p,[0,-2,0]),support);put(p,`note_block[instrument=${names[n.instrument]},note=${noteValue(n)},powered=false]`);notes.push({...n,position:p,note:noteValue(n),instrumentName:names[n.instrument]})};
 // Reserve all clocks and edges first so wing placement cannot occupy a future route.
 for(let i=0;i<events.length;i++){
  const e=events[i],clock=points[i];if(e.notes.length>3)throw Error('Path chord > 3');groups.push({tick:e.tick,count:e.notes.length,depth:0,clock,branchVector:[0,0,0]});
  const ordered=[...e.notes].sort((a,b)=>(b.instrument===3)-(a.instrument===3));if(ordered.length)note(ordered[0],clock);else{put(add(clock,[0,-1,0]),support);put(clock,support)}
  if(i){const prev=points[i-1],d=delta(prev,clock),distance=clock.reduce((s,v,j)=>s+Math.abs(v-prev[j]),0),gap=e.tick-events[i-1].tick;
   if(!edgePaths[i]&&(prev[1]!==clock[1]||d.filter(Boolean).length!==1||distance<2)||gap<1)throw Error('Path edge cannot carry exact delay');
   const route=edgePaths[i]||Array.from({length:distance+1},(_,j)=>add(prev,d.map(v=>v*j))),last=route.length-1,count=Math.ceil(gap/4),rs=[];let left=gap;
   if(count>last-1||edgePaths[i]&&count!==1)throw Error('Path delay capacity');
   if(edgePaths[i]&&autoRoute){const p=route[last-1];rep(p,gap,face(delta(p,clock)),'glass');ports.add(route[1].join());deferred.push({i,route,gap});continue}
   for(let j=1;j<last;j++){if(j>=last-count){const delay=Math.min(4,left-(last-j-1));left-=delay;rep(route[j],delay,face(delta(route[j],route[j+1])),'glass');rs.push([j,delay])}else{put(add(route[j],[0,-1,0]),'glass');put(route[j],'redstone_wire')}}
   connections.push({kind:'free-path',gap,path:route,repeaters:rs,relay:-1,startTick:events[i-1].tick,endTick:e.tick,endDepth:0});
  }
 }
 const first=points[0],flow=points.length>1?delta(first,points[1]):[1,0,0],repeater=add(first,flow.map(v=>-v)),marker=add(repeater,[0,-1,0]),wire=add(repeater,flow.map(v=>-v));rep(repeater,1,face(flow),'lime_stained_glass');
 for(let i=0;i<events.length;i++){
  const ordered=[...events[i].notes].sort((a,b)=>(b.instrument===3)-(a.instrument===3));const clock=points[i];
  const slots=directions.map(d=>add(clock,d)).filter(p=>!ports.has(p.join())&&!map.has(p.join())&&!map.has(add(p,[0,1,0]).join())&&![...directions,[0,1,0],[0,-1,0]].some(d=>{const index=clockIndex.get(add(p,d).join());return index!==undefined&&index!==i}));
  if(slots.length<ordered.length-1)throw Error('Path wing capacity at '+i);
  for(let j=1;j<ordered.length;j++)note(ordered[j],slots[j-1]);
 }
 const routing=[];
 for(const edge of deferred){const {i,route:seed,gap}=edge,last=seed.length-1;
  const found=require('./glass-router.cjs').findGlassRoute({blocks:map,notes,source:seed[0],target:seed[last],start:seed[1],end:seed[last-2],repeater:seed[last-1],tick:events[i-1].tick});
  if(!found)throw Error('No safe glass route within unchanged delay/signal range at '+i);
  for(const p of found.path.slice(1,-2)){put(add(p,[0,-1,0]),'glass');put(p,'redstone_wire')}
  connections.push({kind:'auto-glass',gap,path:found.path,repeaters:[[found.path.length-2,gap]],relay:-1,startTick:events[i-1].tick,endTick:events[i].tick,endDepth:0});routing.push({edge:i,expanded:found.expanded,wireCount:found.wireCount,changed:JSON.stringify(seed)!==JSON.stringify(found.path)});
 }
 for(const n of notes)if(map.has(add(n.position,[0,1,0]).join()))throw Error('Covered path note');
 return measure({blocks:[...map.values()],notes,groups,connections,routing,rowInfo:[],inputs:[{marker,repeater,wire,direction:flow,startTick:0}],clockSolids:groups.map(g=>({position:g.clock,tick:g.tick})),button:null,buttonMode:'external',branchMode:'direct',template:'free-path',origin:[0,0,0]});
}
function designSpiral(source,{width=20,depth=20,pitch=3,trim=1,layerHeight=4,stairSide=1,autoRoute=true,support='cobblestone'}={}){
 if(![width,depth,pitch,trim,layerHeight,stairSide].every(Number.isInteger)||width<6||depth<6||width>512||depth>512||pitch<3||pitch>16||trim<0||![3,4].includes(layerHeight)||![-1,1].includes(stairSide))throw Error('Invalid spiral parameters');
 const song=require('./chain-layout.cjs').chainSong(source),base=spiralPoints(width,depth,pitch).slice(0,trim?-trim:undefined),points=[],edgePaths={};let shift=[0,0,0],layer=0;
 if(base.length<2)throw Error('Spiral trimming leaves no usable path');
 while(points.length<song.events.length){let row=(layer%2?[...base].reverse():base).map(p=>add(p,shift));
  if(layer){const a=points.at(-1),d=delta(points.at(-2),a),s=[-d[2]*stairSide,0,d[0]*stairSide],b=add(a,[-d[0]+(layerHeight===3?s[0]:0),layerHeight,-d[2]+(layerHeight===3?s[2]:0)]);shift=b.map((v,i)=>v-(layer%2?base.at(-1):base[0])[i]);row=(layer%2?[...base].reverse():base).map(p=>add(p,shift));
   const step=(mult,y,side=0)=>add(a,[d[0]*mult+s[0]*side,y,d[2]*mult+s[2]*side]);edgePaths[points.length]=layerHeight===3?[a,step(1,0),step(1,1,1),step(1,2,2),step(1,3,1),step(0,3,1),b]:[a,step(1,0),step(2,1),step(1,2),step(2,3),step(1,4),step(0,4),b];
  }
  points.push(...row.slice(0,song.events.length-points.length));layer++;
 }
 const m=designPath(song,points,{support,edgePaths,autoRoute});m.template='spiral';m.pathParams={kind:'spiral',width,depth,pitch,trim,layerHeight,stairSide,autoRoute};return m;
}
module.exports={designPath,spiralPoints,designSpiral};

