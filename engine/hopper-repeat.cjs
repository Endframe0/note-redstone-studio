'use strict';
const {designRepeatLoop}=require('./repeat-loop.cjs'),{designHopperTimer}=require('./hopper-timer.cjs'),{measure}=require('./parallel-layout.cjs');
function designHopperRepeat({chord,count,period=2,support='cobblestone'}={}){
 const target=count*period+1,items=Math.floor((target-3)/4),fine=target-(4*items+3);
 if(items<1||items>320)throw Error('Hopper repeat duration outside one-hopper timer range');
 const old=designRepeatLoop({chord,count,period,support,width:12}),timer=designHopperTimer({items});
 // Retain only the independently tested oscillator/speaker area. Replace its
 // entire stop-delay bank with a timer facing straight into the control bulb.
 const blocks=old.blocks.filter(b=>b.position[0]>0&&b.position[2]>=0||b.position[0]===0&&b.position[2]===0),map=new Map(blocks.map(b=>[b.position.join(),b]));
 const put=b=>{if(map.has(b.position.join()))throw Error('Hopper loop overlap '+b.position);map.set(b.position.join(),b)};
 put({position:[-1,1,0],block:'lime_stained_glass'});put({position:[-1,2,0],block:'repeater[facing=west,delay=1,powered=false,locked=false]'});
 const rotate=p=>[-p[0]-2,p[1],-p[2]-5],opposite={west:'east',east:'west',north:'south',south:'north'};
 for(const b of timer.blocks){let block=b.block;if(b.position.join()==='-2,2,-4')block=block.replace('delay=1','delay='+(1+fine));put({position:rotate(b.position),block:block.replace(/facing=(west|east|north|south)/,(_,f)=>'facing='+opposite[f])})}
 const inputs=[{marker:[-1,1,0],repeater:[-1,2,0],wire:[-2,2,0],direction:[1,0,0],startTick:0},...timer.inputs.map(i=>({...i,marker:rotate(i.marker),repeater:rotate(i.repeater),wire:rotate(i.wire),direction:i.direction.map((v,j)=>j===1?v:-v)}))];
 return measure({...old,blocks:[...map.values()],inputs,containers:timer.containers.map(c=>({...c,position:rotate(c.position)})),template:'hopper-repeat-loop',branchMode:'hopper-repeat-experimental',loop:{count,period,chord,stopDelay:target,sharedPhysicalNotes:chord.length,automaticReset:true,items,fineDelay:fine,safeRestartAfterTicks:16+8*(items-1),resetRequiresWaiting:true},hopperTimer:{items,experimental:true}});
}
module.exports={designHopperRepeat};
