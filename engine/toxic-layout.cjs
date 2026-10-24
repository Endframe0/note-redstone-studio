'use strict';
const {noteValue}=require('./quinn.cjs');
const {bases,names}=require('./normalize.cjs');
const {measure}=require('./parallel-layout.cjs');
const {auditSignals}=require('./signal-audit.cjs');
const key=p=>p.join();
// Each clock cell is four blocks long per bank. A one-tick branch repeater
// drives fourteen dust taps on either side, each with two note blocks beside
// the conducting support. Ten isolated four-block floors fit within 40 high.
// The trunk traverses at most twelve blocks between repeaters, so every bank
// still receives a positive signal even for consecutive one-tick chords.
function designBank(song,opt={},progress=()=>{}){
 const peak=song.events.reduce((a,e)=>Math.max(a,e.notes.length),0);
 const banks=opt.bankCount||Math.min(3,Math.max(1,Math.ceil(peak/560))),layers=opt.layerCount||Math.ceil(peak/(56*banks)),step=banks*4;
 if(layers>25||banks>3)throw Error('毒曲单路截面容量不足');
 const blocks=new Map(),notes=[],inputs=[],slots=[],slices=[],support=opt.support||'cobblestone';let slice;
 const put=(p,block)=>{const k=key(p),old=blocks.get(k);if(old&&old.block!==block)throw Error('毒曲方块冲突 '+k);blocks.set(k,{position:p,block});if(slice)for(let a=0;a<3;a++){slice[a][0]=Math.min(slice[a][0],p[a]);slice[a][1]=Math.max(slice[a][1],p[a])}};
 const wanted=new Map(song.events.filter(e=>e.notes.length).map(e=>[e.tick,e.notes]));
 const last=song.notes.at(-1).tick,targets=new Set([0,last+10,...wanted.keys()]);
 for(let t=0;t<=last;t+=10)targets.add(t);
 let prev=0;const times=[];for(const t of [...targets].sort((a,b)=>a-b)){while(t-prev>4){prev+=4;times.push(prev)}if(!times.length||times.at(-1)!==t)times.push(t);prev=t}
 let cursor=0;
 if(opt.slotPlan)times.splice(0,times.length,...opt.slotPlan.map(s=>s.tick));
 for(let i=0;i<times.length;i++){
  slice=Array.from({length:3},()=>[Infinity,-Infinity]);
  const t=times[i],ns=wanted.get(t)||[],cellBanks=opt.slotPlan?.[i].banks||Math.max(1,Math.ceil(ns.length/(56*layers))),cellStep=4*cellBanks,x=cursor,delay=i?t-times[i-1]:1;cursor+=cellStep;
  slots.push({tick:t,x,count:ns.length,banks:cellBanks,step:cellStep});
  for(let l=0;l<layers;l++){
   const y=3+l*4;
   put([x-1,y,0],`repeater[facing=west,delay=${delay},powered=false,locked=false]`);put([x-1,y-1,0],i?support:'lime_stained_glass');
   if(!i)inputs.push({marker:[x-1,y-1,0],repeater:[x-1,y,0],wire:[x-2,y,0],direction:[1,0,0],startTick:0});
   for(let dx=0;dx<cellStep-1;dx++){put([x+dx,y,0],'redstone_wire');put([x+dx,y-1,0],support)}
  }
  for(let j=0;j<ns.length;j++){
   const l=Math.floor(j/(56*cellBanks)),bank=Math.floor(j/56)%cellBanks,r=j%56,sign=r<28?-1:1,z=sign*(2+Math.floor((r%28)/2)),nx=x+bank*4+(r%2?-1:1),y=3+l*4,n=ns[j];
   put([x+bank*4,y,sign],`repeater[facing=${sign>0?'north':'south'},delay=1,powered=false,locked=false]`);put([x+bank*4,y-1,sign],support);
   // Include preceding taps even when only a sparse tail of a bank is used.
   for(let a=2;a<=Math.abs(z);a++){put([x+bank*4,y,a*sign],'redstone_wire');put([x+bank*4,y-1,a*sign],support)}
   const position=[nx,y-1,z];put(position,`note_block[instrument=${names[n.instrument]},note=${noteValue(n)},powered=false]`);put([nx,y-2,z],bases[n.instrument]);
   if(n.instrument===3)put([nx,y-3,z],support);
   notes.push({...n,sourceMusicTick:n.sourceMusicTick??n.tick,tick:n.tick+1,position});
  }
  if(ns.length)slices.push({tick:ns[0].sourceMusicTick??t,bounds:slice});
  if(i%100===0)progress({phase:'log',message:`毒曲布置 ${i+1}/${times.length} 个时序段，已放置 ${notes.length} 个音符。`});
 }
 const m=measure({blocks:[...blocks.values()],notes,inputs,groups:[],connections:[],clockSolids:[],rowInfo:[],busNetwork:true,branchMode:'toxic',button:null,toxic:{peak,banks,layers,step,capacity:56*banks*layers,slots,slices,runtimeVerified:false}});
 if(m.dimensions[1]>100||m.dimensions[2]>100)throw Error('毒曲主体截面超过 100 格');
 for(const n of notes){if(blocks.has(key([n.position[0],n.position[1]+1,n.position[2]])))throw Error('毒曲音符被覆盖');}
 if(notes.length!==song.notes.length)throw Error('毒曲音符数量不一致');
 return m;
}
// Validate the reusable cell independently at maximum occupancy, including
// consecutive ticks and all stack/bank boundaries. Larger exports also receive
// an exact source-event audit; do not claim a whole-game simulation from this.
let cachedAudit;
function auditTemplate(){
 if(cachedAudit)return cachedAudit;
 const ns=[];for(const tick of [0,1,2,6])for(let j=0;j<1680;j++)ns.push({tick,layer:j,instrument:j%16,key:33+j%25});
 const song={notes:ns,events:[0,1,2,6].map(tick=>({tick,notes:ns.filter(n=>n.tick===tick)}))};
 const a=auditSignals(designBank(song));if(!a.pass)throw Error('毒曲单元电路检查失败 '+JSON.stringify(a.errors[0]));
 return cachedAudit=a;
}
function addControl(body,tag){
 // Route only the first few complete clock cells. The router sees the real
 // nearby notes and protected air, without cloning a million-block song.
 const end=body.toxic.slots[Math.min(3,body.toxic.slots.length-1)],cut=end.x+end.step-2;
 const prefix=measure({...body,blocks:body.blocks.filter(b=>b.position[0]<=cut),notes:body.notes.filter(n=>n.position[0]<=cut)});
 const wired=body.phase20?require('./phase-start.cjs').connectPhaseStart(prefix):require('./external-start.cjs').connectExternalStart(prefix),original=new Set(prefix.blocks.map(b=>key(b.position)));
 const extra=wired.blocks.filter(b=>!original.has(key(b.position)));
 const blocks=new Map(body.blocks.map(b=>[key(b.position),b]));for(const b of extra){if(blocks.has(key(b.position)))throw Error('启动线撞入音乐主体');blocks.set(key(b.position),b)}
 const commands=[],put=(position,block,replace=false)=>{if(!replace&&blocks.has(key(position)))throw Error('控制方块冲突 '+key(position));blocks.set(key(position),{position,block})};
 const cmd=(p,command,auto=false,facing='east',type=null)=>{put(p,`${type||(auto?'chain_command_block':'command_block')}[facing=${facing},conditional=false]`);commands.push({position:p,command,auto})};
 const input=wired.externalStart.commonInput,d=input.direction,button=input.wire.map((v,i)=>v-d[i]*(body.phase20?4:1)),base=button.map((v,i)=>v-(i===1?1:0));
 const face=d[0]===1?'west':d[0]===-1?'east':d[2]===1?'north':'south';
 const follow=[],last=body.notes.reduce((a,n)=>Math.max(a,n.sourceMusicTick),0),startup=(wired.externalStart.addedStartupRedstoneTicks+2)*2,objective=tag.slice(-12);
 const relative=(target,p)=>target.map((v,i)=>'~'+(v-p[i]-.5)).join(' ');
 // Keep the listener on one fixed longitudinal axis. Per-slice Y/Z centers
 // move with chord density and phase, producing abrupt spatial-audio shifts.
 const fixedCenter=body.bounds.map(b=>(b[0]+b[1]+1)/2);
 let cursor=0;
 for(let frame=0;frame<=last*2;frame++){
  const t=frame/2,slices=body.toxic.slices;
  while(cursor+1<slices.length&&slices[cursor+1].tick<=t)cursor++;
  const bounds=slices[cursor].bounds;
  follow.push({gameTick:frame,musicTick:t,sliceMusicTick:slices[cursor].tick,bounds,target:[(bounds[0][0]+bounds[0][1]+1)/2,fixedCenter[1],fixedCenter[2]]});
 }
 // One ticking controller, packed in a 16 x 16 serpentine cube, lives beside
 // the start input. Exact tick gates prevent competing teleports. Only its
 // own newly-forceloaded corner chunks are released when the song finishes.
 const controllerX=Math.min(...[...blocks.values()].filter(b=>b.position[0]<0).map(b=>b.position[0]))-18;
 const origin=[controllerX,body.bounds[1][0],body.bounds[2][0]],endTick=last*2+40;
 const count=1+follow.length+6+(body.phase20?1:0),points=[];
 if(count>65536)throw Error("逐游戏刻跟随控制链超过原版 65,536 条命令上限（约 54 分钟），请拆分歌曲后转换。");
 for(let layer=0;points.length<count;layer++){
  let plane=[];for(let z=0;z<16;z++)for(let j=0;j<16;j++)plane.push([z%2?15-j:j,layer,z]);
  if(layer%2)plane.reverse();for(const p of plane){points.push(p.map((v,i)=>v+origin[i]));if(points.length===count)break}
 }
 const root=points[0],corners=[[0,0],[15,0],[0,15],[15,15]].map(([x,z])=>[origin[0]+x+.5,origin[1]+.5,origin[2]+z+.5]);
 const dirName=(a,b)=>{const delta=b.map((v,i)=>v-a[i]);return delta[0]===1?'east':delta[0]===-1?'west':delta[1]===1?'up':delta[1]===-1?'down':delta[2]===1?'south':'north'};
 let n=0;
 const addChain=(command,type=null,auto=true)=>{const p=points[n],facing=n+1<points.length?dirName(p,points[n+1]):'east';cmd(p,typeof command==='function'?command(p):command,auto,facing,type);n++;return p};
 addChain(`scoreboard players add #t ${objective} 1`,'repeating_command_block',false);
 if(body.phase20)addChain(p=>`execute if score #t ${objective} matches ${-startup+2} run setblock ${relative(input.wire.map(v=>v+.5),p)} redstone_wire`);
 for(const f of follow)f.position=addChain(p=>`execute if score #t ${objective} matches ${f.gameTick} run tp @a[tag=${tag}] ${relative(f.target,p)} -90 0`);
 addChain(`execute if score #t ${objective} matches ${endTick} run tag @a[tag=${tag}] remove ${tag}`);
 for(let i=0;i<corners.length;i++)addChain(p=>{const r=relative(corners[i],p).split(' ');return `execute if score #t ${objective} matches ${endTick} if score #own${i} ${objective} matches 1 run forceload remove ${r[0]} ${r[2]}`});
 addChain(p=>`execute if score #t ${objective} matches ${endTick} run data merge block ${relative(root.map(v=>v+.5),p)} {auto:0b}`);
 const startupCommands=[`scoreboard objectives add ${objective} dummy`,`scoreboard players set #t ${objective} ${-startup}`,`tag @a[tag=${tag}] remove ${tag}`,`tag @p[distance=..12] add ${tag}`];
 let bind;
 for(let i=0;i<startupCommands.length;i++){const p=base.map((v,a)=>v-d[a]*i);cmd(p,startupCommands[i],i>0,face);if(i===3)bind=p}
 let j=startupCommands.length;
 for(let i=0;i<corners.length;i++,j++){const p=base.map((v,a)=>v-d[a]*j),r=relative(corners[i],p).split(' ');cmd(p,`execute store success score #own${i} ${objective} run forceload add ${r[0]} ${r[2]}`,true,face)}
 if(body.phase20){const pulse=base.map((v,a)=>v-d[a]*j);j++;cmd(pulse,`setblock ${relative(input.wire.map(v=>v+.5),pulse)} redstone_block`,true,face)}
 const enable=base.map((v,a)=>v-d[a]*j);cmd(enable,`data merge block ${relative(root.map(v=>v+.5),enable)} {auto:1b}`,true,face);
 put(button,'stone_button[face=floor,facing=north,powered=false]');
 const m=measure({...body,blocks:[...blocks.values()],commandBlocks:commands,button,inputs:[input],notes:body.notes.map(n=>({...n,tick:n.tick+wired.externalStart.addedStartupRedstoneTicks})),externalStart:{...wired.externalStart,bodyBounds:body.bounds,bodyDimensions:body.dimensions,bodyVolume:body.volume,bodyBlockCount:body.blocks.length},follow:{tag,intervalGameTicks:1,points:follow,bindPosition:bind,controller:root,objective,loadedCornerChunks:corners,rotationSupported:false}});
 m.externalStart.externalBlockCount=m.blocks.length-body.blocks.length;
 return m;
}
function designToxic(song,opt={},progress=()=>{}){return require('./toxic-phases.cjs').design(song,opt,progress)}
module.exports={designToxic,designBank,auditTemplate,addControl};
