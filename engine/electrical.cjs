'use strict';
const {audit:baseAudit}=require('./audit-base.cjs');
const dirs={east:[1,0,0],west:[-1,0,0],south:[0,0,1],north:[0,0,-1]};
const add=(a,b)=>a.map((v,i)=>v+b[i]);
function state(text){const i=text.indexOf('[');const name=i<0?text:text.slice(0,i);return{name,props:i<0?{}:Object.fromEntries(text.slice(i+1,-1).split(',').map(x=>x.split('=')))}}
function glass(b){return !!b&&(b.name==='glass'||b.name.endsWith('_stained_glass'))}
function solid(b){return !!b&&!glass(b)&&!['air','redstone_wire','repeater','stone_button','heavy_core','sculk_vein'].includes(b.name)}
function wireLinks(p,blocks){
 const out=[];for(const [name,d]of Object.entries(dirs)){
  const q=add(p,d),v=blocks.get(q.join());
  if(v?.name==='redstone_wire')out.push({direction:name,p:q,shape:'side'});
  else if(v?.name==='repeater'&&(v.props.facing===name||v.props.facing===opposite(name)))out.push({direction:name,p:q,shape:'side'});
  else if(v?.name==='stone_button')out.push({direction:name,p:q,shape:'side'});
  const up=add(q,[0,1,0]),down=add(q,[0,-1,0]);
  if(!solid(blocks.get(add(p,[0,1,0]).join()))&&blocks.get(up.join())?.name==='redstone_wire'&&(solid(v)||glass(v)))out.push({direction:name,p:up,shape:solid(v)?'up':'side'});
  if(!solid(v)&&blocks.get(down.join())?.name==='redstone_wire')out.push({direction:name,p:down,shape:'side'});
 }return out;
}
function opposite(s){return{east:'west',west:'east',south:'north',north:'south'}[s]}
function audit(m){
 if(m.observerNetwork||m.loop||m.hopperTimer||m.busNetwork)return{pass:false,checkedBlocks:0,wireCells:0,errorCount:1,errors:[{type:'unsupported-experimental-topology'}],scope:'侦测器网络、漏斗计时器、复用循环与零延时和弦总线尚不受此静态审计器支持；须使用隔离原版服务器逐事件验证，不得作为已静态验证候选导出。'};
 const base=m.branchMode==='direct'?{conflicts:[]}:baseAudit(m),blocks=new Map(m.blocks.map(b=>[b.position.join(),state(b.block)])),times=new Map(),errors=base.conflicts.map(x=>({type:'wire-crossfeed',...x}));
 const label=(p,t)=>{if(blocks.get(p.join())?.name==='redstone_wire'){const old=times.get(p.join());if(old!==undefined&&old!==t)errors.push({type:'inconsistent-wire-time',p,t,old});times.set(p.join(),t)}};
 const repeaterTimes=new Map(),strongRelays=new Map();
 for(let i=0;i<m.connections.length;i++){
  const c=m.connections[i],ds=new Map(c.repeaters);let t=c.startTick??m.groups[i].tick,run=0;
  for(let j=0;j<c.path.length;j++){
   const p=c.path[j];if(ds.has(j)){const d=ds.get(j);if(d<1||d>4)errors.push({type:'invalid-delay',p});t+=d;repeaterTimes.set(p.join(),t);run=0}else{label(p,t);if(j===c.relay)strongRelays.set(p.join(),t);run++;if(run>15)errors.push({type:'signal-range',p})}
   if(j){const a=c.path[j-1],dx=Math.abs(p[0]-a[0])+Math.abs(p[2]-a[2]),dy=p[1]-a[1];if(dx!==1||dy<0||dy>1)errors.push({type:'broken-path',p})}
   if(ds.has(j)){const next=c.path[j+1],b=blocks.get(p.join()),flow=dirs[opposite(b?.props.facing)];if(!next||!flow||add(p,flow).join()!==next.join())errors.push({type:'repeater-direction',p})}
  }
  if(t!==(c.endTick??m.groups[i+1].tick))errors.push({type:'timing-sum',i});
  if(m.branchMode==='direct'){const last=c.path.length-1,lastRep=Math.max(...ds.keys()),relay=c.relay===last-1;if(lastRep!==(relay?last-2:last-1))errors.push({type:'missing-clock-booster',i});if((c.endDepth??m.groups[i+1].depth)>14)errors.push({type:'branch-signal-range',i})}
 }
 for(const g of m.groups){label(g.clock,g.tick);const v=g.branchVector||[0,0,m.rowInfo.find(r=>r.y+1===g.clock[1]&&r.z===g.clock[2]).branch],direct=m.branchMode==='direct';for(let k=direct?1:2;k<=g.depth;k++)label(g.clock.map((a,i)=>a+v[i]*k),g.tick+(direct?0:1))}
 if(m.buttonMode==='floor'){const first=m.groups[0];label([first.clock[0],first.clock[1],first.clock[2]-1],first.tick)}
 for(const input of m.inputs||[])repeaterTimes.set(input.repeater.join(),0);
 for(const [key,t]of times){const p=key.split(',').map(Number);for(const q of wireLinks(p,blocks)){const qt=times.get(q.p.join());if(qt!==undefined&&qt!==t)errors.push({type:'vertical-or-horizontal-crossfeed',p,q:q.p,t,qt})}}
 // Dust strongly powers its supporting solid block; that block can activate
 // neighboring notes. Catch stray notes powered from a different clock rail.
 const strong=new Map(strongRelays);for(const c of m.clockSolids||[])strong.set(c.position.join(),c.tick);for(const [key,t]of times){const p=key.split(',').map(Number),below=add(p,[0,-1,0]);if(solid(blocks.get(below.join())))strong.set(below.join(),t)}
 for(const n of m.notes){const wanted=n.tick+(m.branchMode==='direct'?0:1),sources=[];if(strong.has(n.position.join()))sources.push(strong.get(n.position.join()));for(const d of [...Object.values(dirs),[0,1,0],[0,-1,0]]){const t=strong.get(add(n.position,d).join());if(t!==undefined)sources.push(t)}if(!sources.includes(wanted))errors.push({type:'unpowered-note',p:n.position,wanted});for(const t of sources)if(t!==wanted)errors.push({type:'note-crossfeed',p:n.position,wanted,t})}
 for(const [key,t]of repeaterTimes){const p=key.split(',').map(Number),b=blocks.get(key),flow=dirs[opposite(b.props.facing)];for(const d of Object.values(dirs)){if(d[0]*flow[0]+d[2]*flow[2]!==0)continue;const q=add(p,d),other=blocks.get(q.join());if(other?.name==='repeater'){const f=dirs[opposite(other.props.facing)];if(add(q,f).join()===key)errors.push({type:'repeater-locking',p,q,t})}}}
 for(const n of m.notes){const p=n.position;if(blocks.has(add(p,[0,1,0]).join()))errors.push({type:'covered-note',p});if(!blocks.has(add(p,[0,-1,0]).join()))errors.push({type:'missing-instrument-base',p})}
 // FallingBlock.isFree checks air, fire, liquid and replaceable states.
 // Dust/repeaters are NOT replaceable blocks and can support sand in Java.
 for(const b of m.blocks){const s=blocks.get(b.position.join());const support=s.name==='stone_button'&&s.props.face==='wall'?dirs[opposite(s.props.facing)]:[0,-1,0];if(['redstone_wire','repeater','stone_button'].includes(s.name)&&!blocks.has(add(b.position,support).join()))errors.push({type:'unsupported-component',p:b.position});if(s.name==='sand'){const below=blocks.get(add(b.position,[0,-1,0]).join());if(!below||['air','water','lava','fire'].includes(below.name))errors.push({type:'falling-sand',p:b.position})}}
 return{pass:errors.length===0,checkedBlocks:m.blocks.length,wireCells:times.size,errors:errors.slice(0,100),errorCount:errors.length,scope:'静态路径、延迟总和、信号距离、入口增幅、跨层串线、方块强充能串音、中继器锁定、支撑和音符上方空间检查。不是 Minecraft 完整红石模拟器。'};
}
function blockStates(m){const map=new Map(m.blocks.map(b=>[b.position.join(),state(b.block)]));return m.blocks.map(b=>{const s=state(b.block);if(s.name==='redstone_wire'){
 const props={north:'none',east:'none',south:'none',west:'none',power:'0'};for(const q of wireLinks(b.position,map))props[q.direction]=q.shape;
 const ns=props.north!=='none'||props.south!=='none',ew=props.east!=='none'||props.west!=='none';if(!ns){if(props.east==='none')props.east='side';if(props.west==='none')props.west='side'}if(!ew){if(props.north==='none')props.north='side';if(props.south==='none')props.south='side'}s.props=props;
 }if(s.name==='hay_block'||s.name==='bone_block'||s.name==='oak_log')s.props.axis='y';return{position:b.position,name:s.name.includes(':')?s.name:'minecraft:'+s.name,properties:s.props}})}
module.exports={audit,blockStates,state,wireLinks,dirs,solid};
