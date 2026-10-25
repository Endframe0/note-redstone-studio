'use strict';
const assert=require('node:assert/strict');
const {designChordBus}=require('../engine/chord-bus-layout.cjs'),{pack}=require('../engine/phase20-search.cjs');
const {cells,compatible,transform}=require('../engine/parallel-layout.cjs');
const {columns,forbiddenOffsets}=require('../engine/phase20-packing.cjs');
const {auditSignals}=require('../engine/signal-audit.cjs');
function fixture(instrument){const notes=Array.from({length:16},(_,i)=>({tick:i*2,instrument,key:45,layer:0}));return designChordBus({notes,events:notes.map(n=>({tick:n.tick,notes:[n]}))},{cap:6,rows:2,layerHeight:instrument===3?4:3,rowPitch:2,cutMode:'adaptive',splitLongRests:true,riseStyle:'powered',support:'cobblestone'});}
for(const instrument of [0,3]){
 const m=fixture(instrument),before=JSON.stringify(m),a=cells(m),b=cells(transform(m,{rotation:1}));
 for(let axis=0;axis<3;axis++)for(const shift of [-3,0,2]){
  const ca=columns(a,axis),cb=columns(b,axis),offset=[shift,shift,shift],min=-20,max=20;
  const blocked=forbiddenOffsets(ca,cb,offset,axis,min,max);
  for(let d=min;d<=max;d++){offset[axis]=d;assert.equal(blocked[d-min]===0,compatible(a,b,offset),'projection must exactly match bidirectional electrical exclusions');}
 }
 const p=pack([{m,phase:0},{m,phase:1}],{unboundedSize:true,maxAspect:0,maxSpatialAspect:0,phasePackingMs:1000});
 assert(p&&auditSignals(p).pass);assert.equal(p.notes.length,32);
 assert(p.phasePacking.interleaved,'search must allow overlapping envelopes');
 assert(p.volume<16*(m.dimensions[1]*2+1)*4,'must improve on the previous one-empty-layer stack');
 assert.equal(new Set(p.blocks.map(b=>b.position.join())).size,p.blocks.length);
 for(const n of p.notes){const blocks=new Map(p.blocks.map(b=>[b.position.join(),b.block]));assert(!blocks.has([n.position[0],n.position[1]+1,n.position[2]].join()),'note air must remain clear');if(instrument===3){assert.equal(blocks.get([n.position[0],n.position[1]-1,n.position[2]].join()),'sand');assert(blocks.has([n.position[0],n.position[1]-2,n.position[2]].join()),'sand must retain its support');}}
 assert.equal(JSON.stringify(m),before,'packing may not mutate the input');
 assert.deepEqual(p.notes.map(n=>n.tick).sort((a,b)=>a-b),Array.from({length:16},(_,i)=>[i*2,i*2+.5]).flat());
}
const c=columns(cells(fixture(0)),1);
assert.equal(forbiddenOffsets(c,c,[0,0,0],1,-20,20,()=>true),null,'large sweeps must be cancellable');
console.log('PASS 20t phase packing: exact collision sweeps, interleaved envelopes, no crosstalk, note air and sand support preserved, exact parity timing');
