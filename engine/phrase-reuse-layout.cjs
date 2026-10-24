'use strict';
const {designCompactHopperTimer}=require('./compact-hopper-timer.cjs'),{designChordBus}=require('./chord-bus-layout.cjs'),{transform,measure}=require('./parallel-layout.cjs'),{glassWireRoute}=require('./adaptive-scheduled-repeat.cjs');
const key=p=>p.join(),add=(p,d)=>p.map((v,i)=>v+d[i]);
// A phrase is replayed by a serial chain of one-shot timers. Separate output
// diodes feed the shared phrase trigger and the next timer: the OR collector
// must never restart other timers when a later phrase begins.
function designPhraseReuse(pattern,calls,{cap=9,rows=5,layerHeight=4,driverShape='stack',routeBounds=driverShape==='flat'?[[-32,12],[0,14],[-10,12]]:[[-12,12],[0,14],[-10,12]]}={}){
 if(!['stack','flat'].includes(driverShape))throw Error('Unknown serial driver shape');
 if(!Array.isArray(calls)||calls.length<2||calls.length>3||calls.some((t,i)=>!Number.isInteger(t)||t<6||i&&t<=calls[i-1]))throw Error('Serial phrase supports 2..3 sorted calls');
 if(!pattern.length||Math.min(...pattern.map(n=>n.tick))!==0)throw Error('Phrase must start at zero');
 const duration=Math.max(...pattern.map(n=>n.tick));if(calls.some((t,i)=>i&&t-calls[i-1]<=duration+4))throw Error('Phrase calls need an idle gap');
 const timers=calls.map((t,i)=>{
  const delay=t-(calls[i-1]||0),items=Math.floor((delay-2)/4),fine=delay-(4*items+1);
  const m=transform(designCompactHopperTimer({items,fine,outputSide:i===calls.length-1?'front':'dual'}),{offset:driverShape==='flat'?[-10*i,0,0]:[0,i*3,0]});
  if(i)m.blocks.find(b=>key(b.position)===key(m.inputs[0].marker)).block='cobblestone';
  return m;
 });
 const map=new Map(),put=(p,block)=>{const old=map.get(key(p));if(old&&old.block!==block)throw Error('Phrase circuit collision '+p);map.set(key(p),{position:p.map(v=>v===0?0:v),block})};
 timers.forEach(m=>m.blocks.forEach(b=>put(b.position,b.block)));
 const wire=p=>{put(add(p,[0,-1,0]),'glass');put(p,'redstone_wire')},routes=[];
 for(let i=0;i<timers.length-1;i++){
  const source=timers[i].outputs[1],target=timers[i+1].inputs[0];
  const route=glassWireRoute([...map.values()],source.position,target.wire,add(source.position,source.direction.map(v=>-v)),target.repeater,routeBounds);
  if(!route)throw Error('Cannot route serial timer link '+i);route.forEach(wire);routes.push(route);
 }
 // Shared upward-only collector. Each timer output is isolated by its diode.
 // Every three-height segment turns once, letting the middle input join on
 // a flat dust edge without a conductive block or covered note above it.
 const collector=[];let x=0,phrase;
 if(driverShape==='stack'){
 for(let i=0;i<timers.length;i++){
  const y=2+i*3;collector.push([x,y,5]);
  if(i<timers.length-1){collector.push([x,y+1,6],[1-x,y+2,6]);x=1-x}
 }
 collector.forEach(wire);
 for(let i=0;i<timers.length;i++)if(i%2)wire([0,2+i*3,5]);
 const topY=2+(timers.length-1)*3;
 if(x!==0)wire([0,topY,5]);
 for(let xx=-1;xx>=-7;xx--)wire([xx,topY,5]);
 phrase=transform(designChordBus({notes:pattern},{cap,rows,layerHeight,cutMode:'adaptive'}),{rotation:2,offset:[-8,topY-2,5]});
 }else{
  const center=-10*Math.floor((timers.length-1)/2);
  for(let i=0;i<timers.length;i++)collector.push([-10*i,2,5]);
  for(let xx=-10*(timers.length-1);xx<=0;xx++)collector.push([xx,2,6]);
  for(let z=7;z<=9;z++)collector.push([center,2,z]);
  collector.forEach(wire);
  phrase=transform(designChordBus({notes:pattern},{cap,rows,layerHeight,cutMode:'adaptive'}),{rotation:1,offset:[center,0,10]});
 }
 phrase.blocks.find(b=>key(b.position)===key(phrase.inputs[0].marker)).block='cobblestone';
 phrase.blocks.forEach(b=>put(b.position,b.block));
 const notes=calls.flatMap(t=>phrase.notes.map(n=>({...n,tick:n.tick+t}))),blocks=[...map.values()];
 for(const n of notes)if(map.has(key(add(n.position,[0,1,0]))))throw Error('Covered shared speaker');
 return measure({blocks,notes,inputs:[timers[0].inputs[0]],containers:timers.flatMap(m=>m.containers),groups:[],connections:[],clockSolids:[],rowInfo:[],buttonMode:'external',template:'serial-phrase-reuse',branchMode:'serial-phrase-reuse-experimental',hybridNetwork:true,hopperTimer:{experimental:true},phraseReuse:{calls,duration,physicalNotes:phrase.notes.length,sourceNotes:notes.length,routes,collector,parameters:{cap,rows,layerHeight,driverShape},timers:timers.map((m,i)=>({startTick:i?calls[i-1]:0,...m.hopperTimer}))},safeRestartAfterTicks:Math.max(calls.at(-1)+duration+10,...timers.map((m,i)=>(i?calls[i-1]:0)+20+8*m.hopperTimer.items))});
}
module.exports={designPhraseReuse};
