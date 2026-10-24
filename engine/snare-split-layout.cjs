'use strict';
const {designChordBus}=require('./chord-bus-layout.cjs'),{transform,merge}=require('./parallel-layout.cjs'),{auditSignals}=require('./signal-audit.cjs');
const signature=ns=>ns.map(n=>[n.tick,n.instrument,n.key].join()).sort().join(';');
function snareTracks(song){return [song.notes.filter(n=>n.instrument!==3),song.notes.filter(n=>n.instrument===3)]}
function buildSnarePart(notes,part,support='cobblestone'){
 if(!part||!Number.isInteger(part.rotation)||part.rotation<0||part.rotation>3)throw Error('Invalid snare split rotation');
 const offset=part.offset||[0,0,0];if(offset.length!==3||!offset.every(Number.isInteger))throw Error('Invalid snare split offset');
 const raw=transform(designChordBus({notes},{...part.params,support}),{rotation:part.rotation});
 return transform(raw,{offset:raw.bounds.map((b,i)=>offset[i]-b[0])});
}
function designSnareSplit(song,recipe,{support='cobblestone'}={}){
 if(!recipe||!Array.isArray(recipe.parts)||recipe.parts.length!==2||recipe.normalizeBeforeOffset!==true)throw Error('Invalid snare split recipe');
 const tracks=snareTracks(song);if(tracks.some(ns=>!ns.length))throw Error('Snare split needs both percussion and other instruments');
 const parts=tracks.map((notes,i)=>buildSnarePart(notes,recipe.parts[i],support)),m=merge(parts);
 if(signature(m.notes)!==signature(song.notes))throw Error('Snare split changed music events');
 const audit=auditSignals(m);if(!audit.pass)throw Error('Snare split failed finite signal audit: '+audit.errors[0]?.type);
 return {...m,audit,busNetwork:true,template:'snare-split',branchMode:'snare-split-bus-experimental',snareSplit:{recipe,tracks:parts.map((p,i)=>({instrument:i?'snare':'all-except-snare',notes:p.notes.length,dimensions:p.dimensions,layerHeight:p.busParams.layerHeight})),runtimeVerified:false},searchParams:{kind:'snare-split',recipe}};
}
module.exports={snareTracks,buildSnarePart,designSnareSplit};
