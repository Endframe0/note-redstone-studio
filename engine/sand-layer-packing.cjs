'use strict';
const {designChordBus}=require('./chord-bus-layout.cjs'),{auditSignals}=require('./signal-audit.cjs'),{fits}=require('./objective.cjs');

// Keep sand and its physical support. Reassign simultaneous chord notes before
// trying shorter layer spacing; glass feet do not block a neighboring dust climb.
// Every proposal is rebuilt and audited. An unsafe boundary keeps its old pitch.
function compactSandLayers(song,baseline,limits={},progress=()=>{}){
 limits={maxX:80,maxY:48,maxZ:80,maxAspect:1.5,maxSpatialAspect:2,maxListeningRadius:40,...limits};
 if(!baseline.busParams||!baseline.placements||baseline.hybridNetwork)return baseline;
 const parameters={...baseline.busParams,support:limits.support||'cobblestone',reuseSandSupports:true,adaptiveSnare:true,sandSupport:'glass'},count=baseline.placements.at(-1).layer;
 const original=Array.from({length:count},(_,i)=>parameters.layerHeights?.[i]??parameters.layerHeight);
 let best=baseline,trials=0;const stopped=()=>Boolean(limits.shouldStop?.()||limits.stopFile&&require('node:fs').existsSync(limits.stopFile));
 function candidate(heights){
  if(stopped())return false;trials++;try{
   const m=designChordBus(song,{...parameters,layerHeights:[...heights]});
   if(!fits(m.dimensions,limits)||m.volume>=best.volume)return false;
   const audit=auditSignals(m);if(!audit.pass)return false;
   best={...m,audit};progress({phase:'sand-packing',trials,volume:m.volume,dimensions:m.dimensions});return true;
  }catch{return false}
 }
 candidate(original.map(()=>3));
 for(const reverse of [false,true]){
  const heights=[...original],order=Array.from({length:count},(_,i)=>i);if(reverse)order.reverse();
  // Independently keep feasible local reductions even when another search order
  // has already found an equally small machine.
  for(const i of order){if(stopped())break;if(heights[i]<=3)continue;heights[i]=3;try{const m=designChordBus(song,{...parameters,layerHeights:heights});if(!auditSignals(m).pass)throw Error('signals')}catch{heights[i]=original[i];continue}candidate(heights)}
 }
 if(best===baseline)return baseline;
 best.searchParams={kind:'chord-bus',...best.busParams};
 best.search={...baseline.search,bestVolume:best.volume,attempts:(baseline.search?.attempts||0)+trials,improvements:(baseline.search?.improvements||0)+1,actualAspect:Math.max(best.dimensions[0],best.dimensions[2])/Math.min(best.dimensions[0],best.dimensions[2]),...(baseline.search?.baselineVolume?{improvementPercent:100*(1-best.volume/baseline.search.baselineVolume)}:{})};
 best.sandPacking={sandPreserved:true,oldDimensions:baseline.dimensions,newDimensions:best.dimensions,oldVolume:baseline.volume,newVolume:best.volume,layerHeights:best.busParams.layerHeights,trials,runtimeVerified:false};
 return best;
}
module.exports={compactSandLayers};
