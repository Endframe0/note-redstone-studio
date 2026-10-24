'use strict';
const {noteValue}=require('./quinn.cjs');
// Finite, resettable comparator oscillator. A copper bulb enables the clock;
// a second simultaneous input follows a counted repeater delay and toggles it
// off. All timing and stop wiring is inside the measured/exported structure.
// No item inventory, command block, external delayed trigger or playback mod.
const {names,bases}=require('./normalize.cjs'),{measure}=require('./parallel-layout.cjs');
function designRepeatLoop({chord,count,period=2,width=12,support='cobblestone'}){
 if(!Array.isArray(chord)||!chord.length||chord.length>3||!Number.isInteger(count)||count<1||count>10000||![2,4,6,8].includes(period)||!Number.isInteger(width)||width<2||width>128)throw Error('Invalid finite loop parameters');
 if(chord.some(n=>!Number.isInteger(n.instrument)||n.instrument<0||n.instrument>=names.length||!Number.isInteger(n.key)||n.key<33||n.key>57))throw Error('Invalid finite loop note');
 const map=new Map(),notes=[],delayCells=[],put=(p,b)=>{const old=map.get(p.join());if(old&&old.block!==b)throw Error('Loop collision '+p);map.set(p.join(),{position:p,block:b})};
 const component=(p,b,base=support)=>{put([p[0],p[1]-1,p[2]],base);put(p,b)};
 put([0,2,0],'copper_bulb[lit=false,powered=false]');
 component([1,2,0],'comparator[facing=west,mode=compare,powered=false]');
 component([2,2,0],'comparator[facing=west,mode=subtract,powered=false]');
 component([0,2,-1],'repeater[facing=north,delay=1,powered=false,locked=false]','lime_stained_glass');
 const positions=[[2,2,5],[3,2,5],[2,2,6]];
 chord.forEach((n,i)=>{const p=positions[i];component(p,`note_block[instrument=${names[n.instrument]},note=${noteValue(n)},powered=false]`,bases[n.instrument]);if(n.instrument===3)put([p[0],p[1]-2,p[2]],support);for(let j=0;j<count;j++)notes.push({...n,tick:j*period,position:p,note:noteValue(n),instrumentName:names[n.instrument]})});
 // The subtract clock alternates high and low analog levels. Read after six
 // wire losses so its low phase is really zero, then restore it with a diode.
 for(const [x,z]of [[3,0],[4,0],[4,1],[4,2],[3,2],[2,2],[2,3]])component([x,2,z],'redstone_wire','glass');
 component([2,2,4],'repeater[facing=north,delay=1,powered=false,locked=false]');
 if(period===2)component([2,2,1],'redstone_wire','glass');
 else component([2,2,1],`repeater[facing=south,delay=${period/2-1},powered=false,locked=false]`,'glass');
 // Generate the stop timer backwards from the bulb. Rows are two blocks apart
 // so neighboring U-turns cannot merge; straight repeater runs need no spacers.
 let remaining=count*period+1,row=0,x=-1,dir=-1,z=0,lastRep=null,lastFace=null;
 while(remaining>0){
  const delay=Math.min(4,remaining),p=[x,2,z],facing=dir===-1?'west':'east';remaining-=delay;
  component(p,`repeater[facing=${facing},delay=${delay},powered=false,locked=false]`);delayCells.push({position:p,delay});lastRep=p;lastFace=facing;
  if(!remaining)break;
  const next=x+dir;if(next<-width||next>-1){const outer=dir===-1?-width-1:0;for(let dz=0;dz<=2;dz++)component([outer,2,z+dz],'redstone_wire','glass');z+=2;dir=-dir;row++}else x=next;
 }
 const input=[lastRep[0]+(lastFace==='west'?-1:1),2,lastRep[2]],marker=[lastRep[0],1,lastRep[2]];
 map.set(marker.join(),{position:marker,block:'lime_stained_glass'});
 return measure({blocks:[...map.values()],notes,inputs:[{marker:[0,1,-1],repeater:[0,2,-1],wire:[0,2,-2],direction:[0,0,1],startTick:0},{marker,repeater:lastRep,wire:input,direction:[lastFace==='west'?1:-1,0,0],startTick:0}],connections:[],groups:[],rowInfo:[],clockSolids:[],button:null,buttonMode:'external',branchMode:'finite-loop-experimental',template:'finite-repeat-loop',loop:{count,period,chord,delayCells,stopDelay:count*period+1,sharedPhysicalNotes:chord.length,automaticReset:true},origin:[0,0,0]});
}
module.exports={designRepeatLoop};
