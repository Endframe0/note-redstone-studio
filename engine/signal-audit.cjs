'use strict';
const {blockStates}=require('./electrical.cjs');
const directions={west:[-1,0,0],east:[1,0,0],north:[0,0,-1],south:[0,0,1]},around=[...Object.values(directions),[0,1,0],[0,-1,0]],add=(a,b)=>a.map((v,i)=>v+b[i]);
// Independent rising-wave analysis of finite wire/repeater circuits. This
// propagates actual strength and direction, including conductive-block taps.
// It does not model falling edges, tick-priority races or a recurrent clock.
function auditSignals(m,{debugNote=null}={}){
 if(m.hopperTimer||m.loop||m.hybridNetwork)return{pass:false,expected:m.notes.length,actual:0,errorCount:1,errors:[{type:'unsupported-recurrent-network'}],scope:'有限上升沿检查器不支持漏斗、振荡器或复用混合电路，必须使用对应时序模型和实机验证。'};
 const scale=m.phase20?2:1;
 const blocks=new Map(blockStates(m).map(b=>[b.position.join(),b])),errors=[],last=m.notes.reduce((a,n)=>Math.max(a,n.tick),0)*scale+scale,limit=Math.ceil(last)+32,buckets=Array.from({length:limit+1},()=>[]),seen=new Map(),heard=new Set();let visits=0;
 let context=null;const trace=[];
 const hear=(p,t)=>{heard.add(p+':'+t);if(debugNote&&p.join()===debugNote.join())trace.push({t,source:context})};
 const name=b=>b?.name.replace('minecraft:',''),conductor=b=>!!b&&!['air','glass','redstone_wire','repeater','stone_button','heavy_core'].includes(name(b))&&!name(b).endsWith('_stained_glass');
 const at=p=>blocks.get(p.join()),flow=b=>directions[b.properties.facing].map(v=>-v);
 const emit=(kind,p,t,strength=15)=>{if(t>limit){errors.push({type:'signal-after-song',p,t});return}const key=kind+':'+p+':'+t;if((seen.get(key)||0)>=strength)return;seen.set(key,strength);buckets[t].push({kind,p,strength})};
 const power=(p,t,strong=false)=>{const b=at(p);if(name(b)==='note_block')hear(p,t);if(conductor(b))emit(strong?'strong':'weak',p,t)};
 const feedRepeater=(q,p,t)=>{const b=at(q);if(name(b)==='repeater'&&add(q,flow(b).map(v=>-v)).join()===p.join())emit('out',q,t+Number(b.properties.delay)*scale)};
 for(const i of m.inputs){const b=at(i.repeater);if(name(b)!=='repeater'){errors.push({type:'invalid-input'});continue}emit('out',i.repeater,Number(b.properties.delay)*scale+(i.phaseGameTicks||0))}
 for(let t=0;t<=limit;t++)for(let index=0;index<buckets[t].length;index++){
  const {kind,p,strength}=buckets[t][index];if(++visits>2000000){errors.push({type:'signal-analysis-limit'});t=limit+1;break}
  context={kind,p,strength};
  const b=at(p);
  if(kind==='out'){
   const q=add(p,flow(b)),target=at(q);power(q,t,true);if(name(target)==='redstone_wire')emit('wire',q,t);feedRepeater(q,p,t);
  }else if(kind==='strong'||kind==='weak'){
   for(const d of around){const q=add(p,d),target=at(q);if(name(target)==='note_block')hear(q,t);feedRepeater(q,p,t);if(kind==='strong'&&name(target)==='redstone_wire')emit('wire',q,t)}
  }else if(kind==='wire'){
   power(add(p,[0,-1,0]),t);
   for(const [face,d]of Object.entries(directions)){
    const q=add(p,d),target=at(q);
    if(b.properties[face]!=='none'){power(q,t);feedRepeater(q,p,t)}
    if(strength<=1)continue;
    if(name(target)==='redstone_wire')emit('wire',q,t,strength-1);
    const up=add(q,[0,1,0]),down=add(q,[0,-1,0]);
    if(!conductor(at(add(p,[0,1,0])))&&name(at(up))==='redstone_wire'&&target)emit('wire',up,t,strength-1);
    if(!conductor(target)&&name(at(down))==='redstone_wire')emit('wire',down,t,strength-1);
   }
  }
 }
 const wanted=new Set(m.notes.map(n=>n.position+':'+((n.tick+1)*scale)));
 for(const key of wanted)if(!heard.has(key))errors.push({type:'unreached-note',key});
 for(const key of heard)if(!wanted.has(key))errors.push({type:'wrong-time-or-extra-note',key});
 for(const n of m.notes)if(at(add(n.position,[0,1,0])))errors.push({type:'covered-note',p:n.position});
 return{pass:errors.length===0,expected:wanted.size,actual:heard.size,visits,errorCount:errors.length,errors:errors.slice(0,30),...(debugNote?{trace}:{}),scope:'独立红石上升沿传播、信号强度、方向、导体侧音符与预期时刻检查；不模拟下降沿或游戏更新优先级，不能替代实机播放。'};
}
module.exports={auditSignals};
