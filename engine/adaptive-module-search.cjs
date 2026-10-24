'use strict';
const {designAdaptiveScheduledRepeat}=require('./adaptive-scheduled-repeat.cjs');
// Repack the functional pieces after trimming each face of the occupied box.
// A shorter connection is not necessarily the smallest assembly: each trial
// solves placement/routing again, allowing controller and outlet substitutions.
// This is a bounded neighborhood search, not a proof of global minimality.
function optimizeAdaptiveModule(spec,options={}, {maxTrials=64,onProgress=()=>{},onCandidate=()=>{}}={}){
 if(!Number.isInteger(maxTrials)||maxTrials<1)throw Error('Expected positive module trial budget');
 let best=designAdaptiveScheduledRepeat(spec,options),trials=0;const queue=[],seen=new Set(),reports=[];
 if(!best)return null;
 const size=b=>b.reduce((n,[a,z])=>n*(z-a+1),1),key=b=>JSON.stringify(b);
 function enqueue(m){
  for(let axis=0;axis<3;axis++)for(const side of [0,1]){
   const b=m.bounds.map(p=>[...p]);b[axis][side]+=side?-1:1;
   if(b.some(([a,z])=>a>z)||seen.has(key(b)))continue;seen.add(key(b));queue.push(b);
  }
 }
 enqueue(best);onCandidate(best);
 while(queue.length&&trials<maxTrials){
  queue.sort((a,b)=>size(b)-size(a));const bounds=queue.pop();
  if(size(bounds)>=best.volume)continue;
  const candidate=designAdaptiveScheduledRepeat(spec,{...options,bounds});trials++;
  const report={bounds,found:!!candidate,volume:candidate?.volume};reports.push(report);onProgress({trial:trials,...report});
  if(candidate){enqueue(candidate);if(candidate.volume<best.volume){best=candidate;onCandidate(best)}}
 }
 best.adaptiveOptimization={method:'face-trim-and-repack',trials,maxTrials,queueRemaining:queue.length,localSearchOnly:true,reports};return best;
}
module.exports={optimizeAdaptiveModule};
