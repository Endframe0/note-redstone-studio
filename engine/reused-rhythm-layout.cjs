'use strict';
const {designHopperRepeat}=require('./hopper-repeat.cjs'),{delayInputs}=require('./module-input-delay.cjs'),{transform,measure}=require('./parallel-layout.cjs');
// Experimental multi-voice bank. All external inputs are simultaneous. Local
// phase offsets, stop timers and item-return wiring are part of its geometry.
function designRhythmBank(runs){
 if(!Array.isArray(runs)||!runs.length||runs.length>16)throw Error('Rhythm bank requires 1..16 runs');
 if(runs.some(r=>!Number.isInteger(r.start)||r.start<0))throw Error('Invalid run start');
 const originTick=Math.min(...runs.map(r=>r.start));
 if(runs.some(r=>r.start-originTick>16))throw Error('Distant runs need an internal scheduler, not delayed external inputs');
 const ordered=[...runs].sort((a,b)=>(b.instrument===3)-(a.instrument===3)),parts=[];let level=0;
 for(const r of ordered){
  if(parts.length)level+=r.instrument===3?4:3;
  const m=delayInputs(designHopperRepeat({chord:[{instrument:r.instrument,key:r.key}],count:r.count,period:r.period}),r.start-originTick);
  parts.push(transform(m,{offset:[0,level,0]}));
 }
 const m=measure({blocks:parts.flatMap(m=>m.blocks),notes:parts.flatMap(m=>m.notes),inputs:parts.flatMap(m=>m.inputs),containers:parts.flatMap(m=>m.containers),connections:[],groups:[],clockSolids:[],rowInfo:[],template:'reused-rhythm-bank',branchMode:'hopper-repeat-experimental',hopperTimer:{experimental:true},sourceStartTick:originTick,runs:structuredClone(runs),safeRestartAfterTicks:Math.max(...parts.map(p=>p.loop.safeRestartAfterTicks))});
 const occupied=new Set(m.blocks.map(b=>b.position.join()));
 if(occupied.size!==m.blocks.length)throw Error('Rhythm bank collision');
 if(m.notes.some(n=>occupied.has([n.position[0],n.position[1]+1,n.position[2]].join())))throw Error('Rhythm bank covered speaker');
 return m;
}
module.exports={designRhythmBank};
