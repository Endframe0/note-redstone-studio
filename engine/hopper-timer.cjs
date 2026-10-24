'use strict';
// Experimental one-shot timer with automatic item return. A copper bulb stores
// run/idle. Opposite hopper locks select the transfer direction. Empty detection
// resets the bulb; the return hopper refills the locked timing hopper.
const {measure}=require('./parallel-layout.cjs');
function designHopperTimer({items=32}={}){
 if(!Number.isInteger(items)||items<1||items>320)throw Error('Hopper timer needs 1..320 items');
 const map=new Map(),put=(p,block)=>{const old=map.get(p.join());if(old&&old.block!==block)throw Error('Hopper timer collision '+p);map.set(p.join(),{position:p,block})};
 const part=(p,b,base='cobblestone')=>{put([p[0],p[1]-1,p[2]],base);put(p,b)};
 const wire=(x,z)=>part([x,2,z],'redstone_wire','glass');
 put([0,2,0],'hopper[facing=east,enabled=false]');put([1,2,0],'hopper[facing=west,enabled=true]');
 put([-5,2,0],'waxed_copper_bulb[lit=false,powered=false]');
 part([-6,2,0],'repeater[facing=west,delay=1,powered=false,locked=false]','lime_stained_glass');
 // Timer hopper: locked at idle, releases three RT after the bulb lights.
 part([-4,2,0],'comparator[facing=west,mode=compare,powered=false]');
 part([-3,2,0],'repeater[facing=west,delay=1,powered=false,locked=false]');
 put([-2,2,0],'cobblestone');put([-1,2,0],'redstone_wall_torch[facing=east,lit=true]');
 // Return hopper: same three-RT control delay, opposite polarity.
 part([-5,2,1],'comparator[facing=north,mode=compare,powered=false]');
 for(let x=-5;x<=3;x++)wire(x,2);wire(3,1);wire(3,0);
 part([2,2,0],'repeater[facing=east,delay=2,powered=false,locked=false]');
 // Detect the timing hopper becoming empty, and toggle the bulb back to idle.
 part([0,2,-1],'comparator[facing=south,mode=compare,powered=true]');
 put([0,2,-2],'cobblestone');put([0,2,-3],'redstone_wall_torch[facing=north,lit=false]');
 for(let x=-1;x>=-5;x--)wire(x,-3);wire(-5,-2);
 part([-5,2,-1],'repeater[facing=north,delay=1,powered=false,locked=false]');
 // An output diode isolates the caller from the latch feedback.
 part([-2,2,-4],'repeater[facing=south,delay=1,powered=false,locked=false]');
 const inventory=[];let left=items;for(let slot=0;left;slot++){const count=Math.min(left,64);inventory.push({slot,id:'minecraft:cobblestone',count});left-=count}
 return measure({blocks:[...map.values()],notes:[],inputs:[{marker:[-6,1,0],repeater:[-6,2,0],wire:[-7,2,0],direction:[1,0,0],startTick:0}],outputs:[{position:[-2,2,-5],direction:[0,0,-1],kind:'end-rising-edge'}],containers:[{position:[0,2,0],id:'minecraft:hopper',inventory}],hopperTimer:{items,automaticReset:true,experimental:true},connections:[],groups:[],rowInfo:[],clockSolids:[],buttonMode:'external',branchMode:'hopper-timer-experimental',template:'hopper-timer',origin:[0,0,0]});
}
module.exports={designHopperTimer};
