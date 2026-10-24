'use strict';
const crypto=require('node:crypto');
const {compileBus}=require('./chord-bus-layout.cjs');
const {decomposePhraseReuse}=require('./adaptive-phrase-reuse.cjs');

// Generate actual circuits rather than resizing a fixed rectangular module.
// No standalone module aspect constraint is applied: a long or flat component
// can be useful inside a well-proportioned complete machine.
function coreCompatibility(pattern){
 const chords=new Map();
 for(const n of pattern){
  if(!Number.isInteger(n.tick)||n.tick<0)return{supported:false,reason:'non-integer-or-negative-tick'};
  chords.set(n.tick,(chords.get(n.tick)||0)+1);
 }
 const maximum=Math.max(0,...chords.values());
 return{supported:maximum<=20,maximum,reason:maximum>20?'core-chord-exceeds-20':null};
}
function* phraseCoreShapes(pattern,calls,{maxHorizontal=80,maxHeight=48,shouldStop=()=>false}={}){
 // Unsupported density yields no applicable shapes, rather than terminating
 // the complete parallel reuse task. The source notes stay in ordinary lanes.
 if(!coreCompatibility(pattern).supported)return;
 const cells=compileBus({notes:pattern}).length,seen=new Set();
 function build(params){
  try{const {phrase,parameters}=decomposePhraseReuse(pattern,calls,params);if(Math.max(phrase.dimensions[0],phrase.dimensions[2])>maxHorizontal||phrase.dimensions[1]>maxHeight)return;
   const hash=crypto.createHash('sha256').update(JSON.stringify(phrase.blocks)).digest('hex');if(seen.has(hash))return;seen.add(hash);return{params:parameters,core:phrase};
  }catch{}
 }
 // A range of both two-layer arrangements, including nonuniform row cuts.
 for(let cap=4;cap<=Math.min(cells,Math.floor((maxHorizontal-4)/3));cap++)for(const planarInterleaved of [true,false])for(const planarCutMode of ['adaptive','greedy']){
  if(shouldStop())return;const value=build({cap,rows:7,layerHeight:4,template:'planar',planarCutMode,planarInterleaved});if(value)yield value;
 }
 // Different capacities, layer heights and rows per layer create different
 // internal folds and voids. All feasible, distinct geometries are retained.
 for(let cap=4;cap<=Math.min(cells,Math.floor((maxHorizontal-4)/2));cap++)for(let rows=1;rows<=Math.min(32,Math.ceil(cells/cap)+2,Math.floor((maxHorizontal-3)/2));rows++)for(const layerHeight of [3,4,5]){
  if(shouldStop())return;const value=build({cap,rows,layerHeight,template:'chord-bus'});if(value)yield value;
 }
}
function shapesInside(cores,bounds){
 const size=bounds.map(([a,b])=>b-a+1);
 return cores.filter(({core:c})=>c.dimensions[1]<=size[1]&&(c.dimensions[0]<=size[0]&&c.dimensions[2]<=size[2]||c.dimensions[2]<=size[0]&&c.dimensions[0]<=size[2])).sort((a,b)=>a.core.volume-b.core.volume||a.core.blocks.length-b.core.blocks.length);
}
module.exports={phraseCoreShapes,shapesInside,coreCompatibility};
