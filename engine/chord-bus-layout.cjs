'use strict';
const {noteValue}=require('./quinn.cjs');
const {names,bases}=require('./normalize.cjs'),{measure}=require('./parallel-layout.cjs');
// A zero-delay fanout bus feeds several two-note taps, then a three-note end.
// This is built on a single timeline rather than duplicating a clock per voice.
// Structural reference: nbs-fractal Compact (bamboo) nodes; experimental until
// its conductive-block behavior is covered by our electrical model.
function compileBus(song,{splitLongRests=false}={}){
 const grouped=new Map();for(const n of song.notes){if(!grouped.has(n.tick))grouped.set(n.tick,[]);grouped.get(n.tick).push(n)}
 const cells=[];let previous=-1;
 for(const [tick,notes]of [...grouped].sort((a,b)=>a[0]-b[0])){
  if(!Number.isInteger(tick)||tick<0||notes.length>20)throw Error('Bus supports integer ticks and chords up to 20 notes');
  let wait=tick-previous;previous=tick;
  while(wait>4){const first=Math.min(4,wait),second=Math.min(4,wait-first);cells.push({kind:'hold',first,second,tick:tick-wait+first+second,...(splitLongRests?{final:true}:{})});wait-=first+second}
  let at=0,afterHead=false;
  while(at<notes.length){const count=afterHead?Math.min(2,notes.length-at):wait>0?Math.min(3,notes.length-at):notes.length-at<=3?notes.length-at:2,part=notes.slice(at,at+count);at+=count;const kind=afterHead?'tap':at===notes.length?'end':wait>0?'head':'tap';cells.push({kind,final:at===notes.length,delay:wait,notes:part,tick});afterHead=kind==='head';wait=0}
 }
 return cells;
}
function designChordBus(song,{support='cobblestone',cap=0,rows=8,layerHeight=4,layerHeights=null,rowPitch=2,reuseSandSupports=false,adaptiveSnare=false,sandSupport=support,splitLongRests=false,cutMode='greedy',wireBudget=cutMode==='adaptive'?15:14,riseStyle='wide',snareBase='sand',partitionVisitLimit=50000,partitionDeadline=Infinity}={}){
 const cells=compileBus(song,{splitLongRests}),map=new Map(),notes=[],folds=[],sandSupports=[];
 if(!cells.length)throw Error('Empty bus');
 if(!Number.isInteger(cap)||cap<0||!Number.isInteger(rows)||rows<1||![3,4,5].includes(layerHeight)||![2,3].includes(rowPitch)||![14,15].includes(wireBudget))throw Error('Invalid bus shape');
 if(layerHeights&&(!Array.isArray(layerHeights)||layerHeights.some(h=>![3,4,5].includes(h))))throw Error('Invalid variable layer heights');
 if(!['wide','folded','powered'].includes(riseStyle))throw Error('Invalid glass rise style');
 if(!['sand','heavy_core'].includes(snareBase))throw Error('Invalid snare base');
 if(![support,'glass'].includes(sandSupport))throw Error('Invalid sand support material');
 if(sandSupport!==support&&!reuseSandSupports)throw Error('Separate sand material requires deferred supports');
 if(adaptiveSnare&&!reuseSandSupports)throw Error('Adaptive snare requires deferred supports');
 const groups=[];let group=[];for(const c of cells){group.push({...c});if(c.final){groups.push(group);group=[]}}
 const weakEntry=g=>{if(g[0].kind!=='head')return g;const ns=g.flatMap(c=>c.notes||[]);const out=[];let at=0;while(at<ns.length){const count=ns.length-at<=3?ns.length-at:2,part=ns.slice(at,at+count);at+=count;out.push({kind:at===ns.length?'end':'tap',final:at===ns.length,delay:out.length?0:g[0].delay,notes:part,tick:g[0].tick})}return out};
 const width=2*(cap||cells.length),layerYs=[2];
 const layerY=layer=>{if(!layerHeights)return 2+layer*layerHeight;while(layerYs.length<=layer)layerYs.push(layerYs.at(-1)+(layerHeights[layerYs.length-1]??layerHeight));return layerYs[layer]};
 const place=(list,i)=>{const layer=Math.floor(i/rows),local=i%rows,dir=i%2?-1:1,spatial=layer%2?rows-1-local:local;return{list,layer,local,dir,start:dir>0?0:width-1,y:layerY(layer),z:spatial*rowPitch}};
 // Fold feasibility depends on the next chord's fanout and available musical
 // wait, as well as the unused tail of this row. Choose a nearby earlier cut
 // when a filled row would require extra musical delay.
 function turn(a,b){
  const first=b.list[0],delay=first.kind==='hold'?first.first:first.delay;
  if(delay<1)throw Error('A row boundary must have a real musical wait');
  const from=[a.start+a.dir*(2*a.list.length-1),a.y,a.z],target=[b.start,b.y,b.z],path=[from];let p=[...from];
  const go=(axis,value)=>{while(p[axis]!==value){p=[...p];p[axis]+=Math.sign(value-p[axis]);path.push(p)}};
  const outer=a.dir>0?width+1:-2;go(0,outer);
  let poweredLift=-1;
  if(a.y!==b.y){const rise=b.y-a.y,side=b.z===0?-1:1;
   // The first repeater can power a solid whose top dust starts one level up.
   // Keep this solid explicit: it can power neighbors, unlike glass stairs.
   if(riseStyle==='powered'){poweredLift=path.length-1;p=[p[0],p[1]+1,p[2]];path.push(p)}
   const steps=riseStyle!=='wide'?Array.from({length:rise-(poweredLift>=0?1:0)},(_,i)=>i%2?0:1):rise===3?[1,2,1]:rise===4?[1,2,3,2]:[1,2,3,2,1];for(const d of steps){p=[p[0],p[1]+1,a.z+d*side];path.push(p)}
   // Escape sideways before returning to the row. Returning in the same
   // column would put the cap's supporting glass inside the previous dust.
   if(riseStyle!=='wide'&&p[2]!==b.z)go(0,p[0]+Math.sign(b.start-p[0]));
  }
  go(2,b.z);go(0,b.start);
  const choices=[];for(let j=1;j<path.length-1;j++){const q=path[j-1],p=path[j],r=path[j+1];if(q[1]===p[1]&&p[1]===r[1]&&p[0]-q[0]===r[0]-p[0]&&p[2]-q[2]===r[2]-p[2])choices.push(j)}
  if(!choices.includes(1))throw Error('Bus turn cannot amplify terminal block');
  const firstChordCells=first.kind==='hold'?1:b.list.findIndex(c=>c.final)+1,tail=2*(firstChordCells-1);
  // The first dust after a repeater has strength 15, rather than 14.
  const selected=[1];while(path.length-1-selected.at(-1)+tail>wireBudget){const at=selected.at(-1),next=choices.filter(j=>j>at&&j<=at+14).at(-1);if(next===undefined)throw Error('Bus turn signal too long');selected.push(next)}
  if(selected.length>delay)throw Error('Bus turn needs more delay than the song allows');
  let remaining=delay;const repeaters=selected.map((index,j)=>{const d=Math.min(4,remaining-(selected.length-j-1));remaining-=d;return[index,d]});
  return{path,repeaters,sourceTick:a.list.at(-1).tick,delay,...(poweredLift>=0?{poweredLift}:{})};
 }
 let rowCells=[];
 if(cutMode==='adaptive'&&cap){
  const failed=new Set();let visits=0;
  function partition(at,row){
   if(at===groups.length)return [];
   const key=at+':'+(layerHeights?row:row%(2*rows));if(failed.has(key))return null;if(++visits>partitionVisitLimit||visits%64===0&&Date.now()>partitionDeadline)throw Error('Bus partition search limit');
   const options=[];let list=[];
   for(let end=at;end<groups.length;end++){
    const g=end===at&&row?weakEntry(groups[end]):groups[end];if(list.length+g.length>cap)break;list=list.concat(g);
    if(end===groups.length-1)options.push({list,end:end+1});
    else try{turn(place(list,row),place(weakEntry(groups[end+1]),row+1));options.push({list,end:end+1})}catch{}
   }
   for(let i=options.length-1;i>=0;i--){const o=options[i],tail=partition(o.end,row+1);if(tail)return[o.list,...tail]}
   failed.add(key);return null;
  }
  rowCells=partition(0,0);if(!rowCells)throw Error('No electrically feasible bus row partition');
 }else if(cutMode==='greedy'){
  let current=[];for(let g of groups){if(cap&&current.length+g.length>cap){rowCells.push(current);current=[]}if(!current.length&&rowCells.length)g=weakEntry(g);if(cap&&g.length>cap)throw Error('Bus row shorter than one chord/wait group');current.push(...g)}if(current.length)rowCells.push(current);
 }else throw Error('Invalid bus cut mode');
 const placements=rowCells.map((list,i)=>place(list.map(c=>({...c})),i));
 const put=(p,block)=>{if(map.has(p.join()))throw Error('Bus collision '+p);map.set(p.join(),{position:p,block})};
 const component=(p,block,base=support)=>{put([p[0],p[1]-1,p[2]],base);put(p,block)};
 const rep=(p,delay,dir)=>component(p,`repeater[facing=${dir>0?'west':'east'},delay=${delay},powered=false,locked=false]`);
 const note=(n,p)=>{component(p,`note_block[instrument=${names[n.instrument]},note=${noteValue(n)},powered=false]`,n.instrument===3&&snareBase==='heavy_core'?'heavy_core[waterlogged=false]':bases[n.instrument]);if(n.instrument===3&&snareBase==='sand'){const q=[p[0],p[1]-2,p[2]];if(reuseSandSupports)sandSupports.push(q);else put(q,support)}notes.push({...n,position:p,note:noteValue(n),instrumentName:names[n.instrument]})};
 // Move the first delay of each new row into the turn. Its first cell becomes
 // bare wire; every route repeater is paid for from that same musical wait.
 for(let i=1;i<placements.length;i++){
  const a=placements[i-1],b=placements[i],first=b.list[0],fold=turn(a,b);
  if(first.kind==='hold')first.first=0;else first.delay=0;
  folds.push(fold);
 }
 placements.forEach(row=>row.list.forEach((c,i)=>{const {y,z,dir}=row,x=row.start+dir*2*i,stem=[x,y,z],cx=x+dir,d=c.kind==='hold'?c.first:c.delay;
  if(d)rep(stem,d,dir);else component(stem,'redstone_wire','glass');
  if(c.kind==='hold'){rep([cx,y,z],c.second,dir);return}
  if(c.kind==='tap'){put([cx,y-1,z],support);put([cx,y,z],support);put([cx,y+1,z],'redstone_wire');c.notes.forEach((n,j)=>note(n,[cx,y,z+(j?1:-1)]))}
  else c.notes.forEach((n,j)=>note(n,[cx,y,z+[0,-1,1][j]]));
 }));
 for(const f of folds){const rs=new Map(f.repeaters);for(let j=1;j<f.path.length-1;j++){const p=f.path[j];if(j===f.poweredLift){put(p,support);continue}if(f.poweredLift!==undefined&&j===f.poweredLift+1){put(p,'redstone_wire');continue}if(rs.has(j)){const q=f.path[j+1],face=q[0]>p[0]?'west':q[0]<p[0]?'east':q[2]>p[2]?'north':'south';component(p,`repeater[facing=${face},delay=${rs.get(j)},powered=false,locked=false]`,'glass')}else component(p,'redstone_wire','glass')}}
 map.set('0,1,0',{position:[0,1,0],block:'lime_stained_glass'});
 if(adaptiveSnare&&snareBase==='sand'){
  // All slots in a chord fire together. Put falling bases only over slots
  // whose support does not occupy the air above a lower speaker.
  const speakers=new Set(notes.map(n=>n.position.join())),groups=new Map();
  const safe=n=>!speakers.has([n.position[0],n.position[1]-3,n.position[2]].join());
  for(const n of notes){if(!groups.has(n.tick))groups.set(n.tick,[]);groups.get(n.tick).push(n)}
  for(const ns of groups.values())for(const n of ns.filter(n=>n.instrument===3&&!safe(n))){
   const other=ns.find(o=>o.instrument!==3&&safe(o));if(!other)throw Error('No safe snare support slot');
   const a=n.position,b=other.position;n.position=b;other.position=a;
   for(const v of [n,other]){map.set(v.position.join(),{position:v.position,block:`note_block[instrument=${names[v.instrument]},note=${noteValue(v)},powered=false]`});const p=[v.position[0],v.position[1]-1,v.position[2]];map.set(p.join(),{position:p,block:bases[v.instrument]})}
  }
  sandSupports.length=0;for(const n of notes)if(n.instrument===3)sandSupports.push([n.position[0],n.position[1]-2,n.position[2]]);
 }
 let reusedSandSupports=0;for(const p of sandSupports){if(map.has(p.join()))reusedSandSupports++;else put(p,sandSupport)}
 for(const n of notes)if(map.has([n.position[0],n.position[1]+1,n.position[2]].join()))throw Error('Covered bus speaker');
 return measure({blocks:[...map.values()],notes,cells,folds,placements,inputs:[{marker:[0,1,0],repeater:[0,2,0],wire:[-1,2,0],direction:[1,0,0],startTick:0}],connections:[],groups:[],clockSolids:[],rowInfo:[],busNetwork:true,branchMode:'chord-bus-experimental',template:'chord-bus',busParams:{cap,rows,layerHeight,...(layerHeights?{layerHeights}:{}),rowPitch,cutMode,wireBudget,...(reuseSandSupports?{reuseSandSupports:true}:{}),...(adaptiveSnare?{adaptiveSnare:true}:{}),...(sandSupport!==support?{sandSupport}:{}),...(splitLongRests?{splitLongRests:true}:{}),...(riseStyle!=='wide'?{riseStyle}:{}),...(snareBase!=='sand'?{snareBase}:{})},...(reuseSandSupports?{reusedSandSupports}:{}),origin:[0,0,0]});
}
module.exports={compileBus,designChordBus};
