'use strict';
const {toneKey,eventKey}=require('./note-volume.cjs');
function compileCalls(ticks){
 const a=[...ticks].sort((x,y)=>x-y),cost=Array(a.length+1).fill(Infinity),choice=[];cost[a.length]=0;
 for(let i=a.length-1;i>=0;i--){cost[i]=1+cost[i+1];choice[i]={startTick:a[i],period:0,count:1};if(i+1===a.length)continue;const period=a[i+1]-a[i];if(period<=0)continue;
  for(let j=i+1;j<a.length&&a[j]-a[j-1]===period;j++){const candidate=2+cost[j+1];if(candidate<cost[i]||candidate===cost[i]&&j-i+1>choice[i].count){cost[i]=candidate;choice[i]={startTick:a[i],period,count:j-i+1}}}
 }
 const programs=[];for(let i=0;i<a.length;){programs.push(choice[i]);i+=choice[i].count}return programs;
}
// Exact reuse analysis. Musical timing, instrument, pitch and multiplicity are
// retained; no transposition, approximate matching or quantization is applied.
// This estimates note savings only. Geometry, call routing, reset and timers
// still have to be built and measured before a candidate can enter the solver.
function analyzeMotifs(song,{maxEvents=64,minEvents=2,minSavedNotes=8,limit=128,candidateLimit=limit,candidateFilter=()=>true,includeCandidates=false,candidateDiversity=false}={}){
 const tagged=song.notes.map((n,id)=>({...n,id})),voices=new Map();
 for(const n of tagged){if(!voices.has(n.instrument))voices.set(n.instrument,[]);voices.get(n.instrument).push(n)}
 const views=[['all',tagged],...[...voices].map(([i,ns])=>['instrument:'+i,ns])],candidates=[];
 for(const [view,ns]of views){
  const tm=new Map();for(const n of ns){if(!tm.has(n.tick))tm.set(n.tick,[]);tm.get(n.tick).push(n)}
  const events=[...tm].sort((a,b)=>a[0]-b[0]).map(([tick,notes])=>({tick,notes:notes.sort((a,b)=>a.instrument-b.instrument||a.key-b.key||(a.enbVelocity??0)-(b.enbVelocity??0)||a.id-b.id)}));
  const chords=events.map(e=>e.notes.map(toneKey).join(','));
  for(let length=minEvents;length<=Math.min(maxEvents,events.length>>1);length++){
   const table=new Map();
   for(let start=0;start+length<=events.length;start++){
    let signature=chords[start];for(let j=1;j<length;j++)signature+=';'+(events[start+j].tick-events[start+j-1].tick)+'/'+chords[start+j];
    if(!table.has(signature))table.set(signature,[]);table.get(signature).push(start);
   }
   for(const starts of table.values()){
    if(starts.length<2)continue;const chosen=[];let end=-1;for(const s of starts)if(s>end){chosen.push(s);end=s+length-1}
    if(chosen.length<2)continue;const first=events.slice(chosen[0],chosen[0]+length),notes=first.flatMap(e=>e.notes),savedNotes=notes.length*(chosen.length-1);if(savedNotes<minSavedNotes)continue;
    candidates.push({view,eventCount:length,templateNotes:notes.length,savedNotes,duration:first.at(-1).tick-first[0].tick,pattern:notes.map(n=>({...n,tick:n.tick-first[0].tick})),calls:chosen.map(s=>({tick:events[s].tick,noteIds:events.slice(s,s+length).flatMap(e=>e.notes.map(n=>n.id))}))});
   }
  }
 }
 candidates.sort((a,b)=>b.savedNotes-a.savedNotes||b.templateNotes-a.templateNotes||a.calls.length-b.calls.length);
 // Candidate views overlap. Select disjoint calls and count each source event
 // exactly once; a single leftover occurrence is cheaper as ordinary notes.
 const used=new Set(),selected=[];
 for(const c of candidates){const calls=c.calls.filter(call=>call.noteIds.every(id=>!used.has(id)));if(calls.length<2)continue;const savedNotes=c.templateNotes*(calls.length-1);if(savedNotes<minSavedNotes)continue;const selectedCandidate={...c,calls,savedNotes};if(!candidateFilter(selectedCandidate))continue;selected.push(selectedCandidate);for(const call of calls)for(const id of call.noteIds)used.add(id);if(selected.length>=limit)break}
 for(const c of selected){c.callPrograms=compileCalls(c.calls.map(call=>call.tick));c.maxConcurrentCalls=Math.max(...c.calls.map(call=>c.calls.filter(other=>other.tick<=call.tick&&other.tick+c.duration>=call.tick).length));c.schedulerImplemented=false}
 const residual=tagged.filter(n=>!used.has(n.id));
 const reconstructed=[...residual.map(eventKey),...selected.flatMap(c=>c.calls.flatMap(call=>c.pattern.map(n=>eventKey({...n,tick:call.tick+n.tick}))))].sort();
 const original=tagged.map(eventKey).sort();if(JSON.stringify(reconstructed)!==JSON.stringify(original))throw Error('Motif reconstruction changed note events');
 let eligibleCandidates=[];if(includeCandidates){eligibleCandidates=candidates.filter(candidateFilter);if(candidateDiversity){const unique=new Map();for(const c of eligibleCandidates){const key=c.view+':'+c.calls.map(v=>v.tick).join();if(!unique.has(key))unique.set(key,c)}eligibleCandidates=[...unique.values()]}eligibleCandidates=eligibleCandidates.slice(0,candidateLimit)}
 return{sourceNotes:tagged.length,selectedPatterns:selected.length,reusedEvents:used.size,residualNotes:residual.length,potentialPhysicalNoteSavings:selected.reduce((s,c)=>s+c.savedNotes,0),geometrySavingsVerified:false,scope:'Exact per-instrument and whole-arrangement repeated phrases; note savings exclude scheduling, routing, reset and memory overhead.',selected,residual,candidateCount:candidates.length,...(includeCandidates?{candidates:eligibleCandidates}:{})};
}
function combineScheduledMotifs(candidates){
 // Independent voices with exactly the same call times can share a scheduler,
 // even when unrelated instruments prevent whole-arrangement motif matching.
 const schedules=new Map();for(const c of candidates){if(!c.view.startsWith('instrument:'))continue;const k=c.calls.map(call=>call.tick).join();if(!schedules.has(k))schedules.set(k,new Map());const voices=schedules.get(k),old=voices.get(c.view);if(!old||c.savedNotes>old.savedNotes)voices.set(c.view,c)}
 const result=[];
 for(const voices of schedules.values()){
  const parts=[...voices.values()];if(parts.length<2)continue;const used=new Set();let overlap=false;
  for(const c of parts)for(const call of c.calls)for(const id of call.noteIds){if(used.has(id))overlap=true;used.add(id)}if(overlap)continue;
  const pattern=parts.flatMap(c=>c.pattern).sort((a,b)=>a.tick-b.tick||a.instrument-b.instrument||a.key-b.key),calls=parts[0].calls.map((call,i)=>({tick:call.tick,noteIds:parts.flatMap(c=>c.calls[i].noteIds)}));
  result.push({view:'combined:'+parts.map(c=>c.view.split(':')[1]).join('+'),sourceViews:parts.map(c=>c.view),pattern,calls,templateNotes:pattern.length,savedNotes:pattern.length*(calls.length-1),duration:Math.max(...pattern.map(n=>n.tick)),eventCount:new Set(pattern.map(n=>n.tick)).size});
 }
 return result;
}
module.exports={analyzeMotifs,compileCalls,combineScheduledMotifs};
