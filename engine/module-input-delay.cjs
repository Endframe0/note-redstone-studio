'use strict';
const {measure}=require('./parallel-layout.cjs');
// Short local phase alignment, paid for inside the exported bounding box.
// Fail on collisions; long waits belong to a shared scheduler, not duplicated
// straight repeater banks on every voice.
function delayInputs(source,delay){
 if(!Number.isInteger(delay)||delay<0||delay>16)throw Error('Local phase delay must be 0..16 redstone ticks');
 const m=structuredClone(source);if(!delay)return m;
 const map=new Map(m.blocks.map(b=>[b.position.join(),b]));
 const put=(p,block)=>{if(map.has(p.join()))throw Error('Input delay collision '+p);map.set(p.join(),{position:p,block})};
 const faces={'1,0,0':'west','-1,0,0':'east','0,0,1':'north','0,0,-1':'south'};
 m.inputs=m.inputs.map(input=>{
  let p=[...input.wire],remaining=delay,last;
  map.set(input.marker.join(),{position:input.marker,block:'cobblestone'});
  while(remaining){const d=Math.min(4,remaining);remaining-=d;put(p,`repeater[facing=${faces[input.direction.join()]},delay=${d},powered=false,locked=false]`);const marker=[p[0],p[1]-1,p[2]];put(marker,remaining?'cobblestone':'lime_stained_glass');last={...input,repeater:p,marker};p=p.map((v,i)=>v-input.direction[i])}
  return{...last,wire:p};
 });
 m.blocks=[...map.values()];m.notes=m.notes.map(n=>({...n,tick:n.tick+delay}));m.phaseDelay=(m.phaseDelay||0)+delay;
 if(m.loop)m.loop.safeRestartAfterTicks+=delay;
 return measure(m);
}
module.exports={delayInputs};
