'use strict';
// Experimental compact latch: both hopper control paths take two redstone
// ticks. Keep the proven timer as a fallback until vanilla validation passes.
const {measure}=require('./parallel-layout.cjs');
function designCompactHopperTimer({items=32,fine=1,outputSide='front'}={}){
 if(!Number.isInteger(items)||items<1||items>320)throw Error('Expected 1..320 items');
 if(!Number.isInteger(fine)||fine<1||fine>4)throw Error('Expected 1..4 output delay');
 if(!['front','left','dual'].includes(outputSide))throw Error('Unknown timer outlet');
 const map=new Map(),put=(p,block)=>{if(map.has(p.join()))throw Error('Timer collision '+p);map.set(p.join(),{position:p,block})};
 const part=(x,z,b,base='cobblestone')=>{put([x,1,z],base);put([x,2,z],b)};
 const wire=(x,z)=>part(x,z,'redstone_wire','glass');
 const rep=(x,z,f,delay=1,base)=>part(x,z,`repeater[facing=${f},delay=${delay},powered=false,locked=false]`,base);
 const cmp=(x,z,f,powered=false)=>part(x,z,`comparator[facing=${f},mode=compare,powered=${powered}]`);
 put([1,2,0],'hopper[facing=east,enabled=false]');
 put([2,2,0],'hopper[facing=west,enabled=true]');
 put([0,2,-3],'waxed_copper_bulb[lit=false,powered=false]');
 rep(0,-4,'north',1,'lime_stained_glass');
 cmp(0,-2,'north');put([0,2,-1],'cobblestone');
 put([0,2,0],'redstone_wall_torch[facing=south,lit=true]');
 cmp(1,-3,'west');
 for(const p of [[2,-3],[3,-3],[4,-3],[4,-2],[4,-1],[4,0]])wire(...p);
 rep(3,0,'east');
 cmp(1,1,'north',true);put([1,2,2],'cobblestone');
 put([1,2,3],'redstone_wall_torch[facing=south,lit=false]');
 for(const p of [[0,3],[-1,3],[-2,3],[-2,2],[-2,1],[-2,0],[-2,-1],[-2,-2],[-2,-3]])wire(...p);
 rep(-1,-3,'west');
 const front={repeater:[0,2,4],position:[0,2,5],direction:[0,0,1],facing:'north'},left={repeater:[-3,2,1],position:[-4,2,1],direction:[-1,0,0],facing:'east'};
 const outlets=outputSide==='dual'?[front,left]:[outputSide==='front'?front:left];
 for(const output of outlets)rep(output.repeater[0],output.repeater[2],output.facing,fine);
 const inventory=[];for(let remaining=items,slot=0;remaining;slot++){const count=Math.min(remaining,64);inventory.push({slot,id:'minecraft:cobblestone',count});remaining-=count}
 return measure({blocks:[...map.values()],notes:[],inputs:[{marker:[0,1,-4],repeater:[0,2,-4],wire:[0,2,-5],direction:[0,0,1],startTick:0}],outputs:outlets.map(output=>({position:output.position,direction:output.direction,kind:'end-rising-edge'})),containers:[{position:[1,2,0],id:'minecraft:hopper',inventory}],hopperTimer:{items,fine,outputSide,automaticReset:true,experimental:true,controlTicks:2},connections:[],groups:[],rowInfo:[],clockSolids:[],buttonMode:'external',branchMode:'compact-hopper-timer-experimental',template:'compact-hopper-timer',origin:[0,0,0]});
}
module.exports={designCompactHopperTimer};
