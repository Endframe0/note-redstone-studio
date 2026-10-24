'use strict';
// Calibrated core only: initially idle locked hopper -> barrel -> comparator ->
// solid block -> torch. In Java 26.1.2 the measured output is 2 + 4*(N-1) RT
// after unlock. Start latch, pulse shaping and item-return/reset are NOT included.
function planMeasuredHopperCore(delayTicks){
 if(!Number.isInteger(delayTicks)||delayTicks<2||delayTicks>1281)throw Error('Calibrated hopper core supports 2..1281 redstone ticks');
 const items=Math.min(320,1+Math.floor((delayTicks-2)/4)),coreTicks=2+4*(items-1),fineTicks=delayTicks-coreTicks;
 const inventory=[];let left=items;for(let slot=0;left;slot++){const count=Math.min(64,left);inventory.push({slot,id:'minecraft:cobblestone',count});left-=count}
 return{targetTicks:delayTicks,items,coreTicks,fineTicks,inventory,version:'26.1.2',requiresRestedHopper:true,resetIncluded:false,startLatchIncluded:false,productionReady:false};
}
module.exports={planMeasuredHopperCore};
