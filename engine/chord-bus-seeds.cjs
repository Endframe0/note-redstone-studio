'use strict';
const {compileBus}=require('./chord-bus-layout.cjs'),{shapePenalty}=require('./objective.cjs');
// Rank inexpensive estimates, then let the real builder and signal verifier
// decide. The estimate is not a feasibility test or a volume guarantee.
function chordBusSeeds(song,opt){
 if(opt.chordBus===false||!opt.externalInputs||!require('./versions.cjs').supports(opt.target,'compression'))return [];
 let n;try{n=compileBus(song).length}catch{return []}
 const out=[],maxCap=Math.min(40,Math.floor((opt.maxX-4)/2)),maxRows=Math.min(32,Math.floor((opt.maxZ-3)/2));
 for(let cap=4;cap<=maxCap;cap++)for(let rows=1;rows<=maxRows;rows++)for(const riseStyle of ['powered','folded','wide']){
  const rowCount=Math.ceil(n/cap),dims=[2*cap+4,4*Math.ceil(rowCount/rows),2*Math.min(rows,rowCount)+(riseStyle==='wide'?5:1)];
  out.push({params:{kind:'chord-bus',cap,rows,layerHeight:4,rowPitch:2,...(riseStyle!=='wide'?{riseStyle}:{})},score:dims.reduce((a,b)=>a*b,1)*shapePenalty(dims,opt)});
 }
 return out.sort((a,b)=>a.score-b.score).flatMap(x=>opt.adaptiveBus===false?[x.params]:[x.params,{...x.params,cutMode:'adaptive',wireBudget:15}]);
}
module.exports={chordBusSeeds};
