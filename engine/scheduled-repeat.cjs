'use strict';
const {designHopperRepeat}=require('./hopper-repeat.cjs'),{designHopperTimer}=require('./hopper-timer.cjs'),{transform,measure}=require('./parallel-layout.cjs');
function inventory(items){const out=[];for(let slot=0;items;slot++){const count=Math.min(64,items);items-=count;out.push({slot,id:'minecraft:cobblestone',count})}return out}
function timerParts(delay){const items=Math.floor((delay-3)/4),fine=delay-(4*items+3);if(items<1||items>320)throw Error('Scheduled repeat wait outside one hopper range');return{items,fine}}
// Both external inputs fire at time zero. One complete resettable timer starts
// the oscillator; the existing stop timer counts from time zero too. No long
// delayed external trigger and no duplicated fanout wire are omitted from cost.
function designScheduledRepeat({chord,count,period=2,startTick,support='cobblestone'}){
 if(!Number.isInteger(startTick)||startTick<10)throw Error('Scheduled repeat needs startTick >= 10');
 // Existing oscillator's first sound is input + 4 RT. Ordinary chord bus first
 // sound is source tick + 1 RT, so its delayed input must occur at startTick-3.
 const startDelay=startTick-3,start=timerParts(startDelay),stop=timerParts(startDelay+count*period+1);
 const m=designHopperRepeat({chord,count,period,support}),map=new Map(m.blocks.map(b=>[b.position.join(),b]));
 m.containers[0].inventory=inventory(stop.items);
 const stopOutput=map.get('0,2,-1');if(!stopOutput?.block.startsWith('repeater'))throw Error('Stop timer interface changed');
 stopOutput.block=stopOutput.block.replace(/delay=\d/,'delay='+(1+stop.fine));
 const timer=designHopperTimer({items:start.items});
 const startOutput=timer.blocks.find(b=>b.position.join()==='-2,2,-4');startOutput.block=startOutput.block.replace('delay=1','delay='+(1+start.fine));
 const placed=transform(timer,{rotation:1,offset:[-10,0,2]});
 const put=(position,block)=>{if(map.has(position.join()))throw Error('Scheduled repeat collision '+position);map.set(position.join(),{position,block})};
 for(const b of placed.blocks)put(b.position,b.block);
 for(let x=-5;x<=-2;x++){put([x,1,0],'glass');put([x,2,0],'redstone_wire')}
 map.set(m.inputs[0].marker.join(),{position:m.inputs[0].marker,block:'cobblestone'});
 return measure({...m,blocks:[...map.values()],notes:m.notes.map(n=>({...n,tick:n.tick+startTick})),inputs:[...placed.inputs,m.inputs[1]],containers:[...m.containers,...placed.containers],template:'scheduled-hopper-repeat',branchMode:'scheduled-hopper-repeat-experimental',sourceStartTick:startTick,loop:{...m.loop,startTick,startDelay,items:stop.items,startItems:start.items,startFine:start.fine,stopFine:stop.fine,stopDelay:startDelay+count*period+1,safeRestartAfterTicks:16+8*(Math.max(start.items,stop.items)-1)},scheduler:{experimental:true,simultaneousExternalInputs:true,expectedFirstSoundDelay:startTick+1}});
}
module.exports={designScheduledRepeat};
