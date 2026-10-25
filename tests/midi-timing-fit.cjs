'use strict';
const assert=require('node:assert/strict');
const {smf,tempo}=require('./midi.cjs');
const {parse}=require('../engine/midi.cjs');
const {plan,mapTick,mapExact,messages}=require('../engine/midi-timing.cjs');
// A mostly regular 72 BPM score with one one-tick offset, as in the reported
// song. The offset defeats the global GCD; at 75 BPM it merges with a neighbor.
const starts=[...Array.from({length:1000},(_,i)=>i*60),721].sort((a,b)=>a-b);
const events=[tempo(0,833333),...starts.flatMap(t=>[[t,144,60,100],[t+1,128,60,0]]).sort((a,b)=>a[0]-b[0])];
const raw=parse(smf([events],960)),fit=plan(raw,{midiSpeedTolerance:15}),original=plan(raw,{midiTimingMode:'original'});
assert.equal(fit.resolution,20);assert(Math.abs(fit.segments[0].actualBpm-75)<1e-8);
assert(fit.meanOnsetErrorMs<.001);assert.equal(fit.quantizedNotes,1);
assert.equal(fit.alignedOnsets,1000);assert.equal(fit.totalNotes,1001);
assert.equal(fit.quantizedOnsets,1);assert.equal(fit.mergedOnsets,original.mergedOnsets+1);
assert(fit.rootMeanSquareOnsetErrorMs<original.rootMeanSquareOnsetErrorMs);
assert(!fit.exact,'one source offset is still quantized, never label the whole file exact');
for(const t of starts.filter(t=>t!==721))assert.equal(mapTick(t,fit),t/60);
assert(messages(fit).some(s=>s.includes('1000 / 1001')&&s.includes('剩余 1')));
const limited=plan(raw,{midiSpeedTolerance:1});assert(limited.maxSpeedChangePercent<=1);
assert.equal(plan(raw,{midiTimingMode:'original',midiSpeedTolerance:15}).globalSpeedFactor,1);
assert.throws(()=>plan(raw,{midiTimingMode:'strict',midiSpeedTolerance:15}),/原速无法/);
const fixed=plan(raw,{midiAutoResolution:false,timeResolution:10,midiSpeedTolerance:15});assert.equal(fixed.resolution,10);
// Mixed tempo still uses one global speed and an absolute, continuous timeline.
const multi=parse(smf([[tempo(0,833333),tempo(3840,625000)],events.slice(1)],960));
const mp=plan(multi,{midiSpeedTolerance:15});
assert(mp.segments.every(s=>s.speedFactor===mp.globalSpeedFactor));
assert(Math.abs(mapExact(3840,mp)-3840/960*mp.segments[0].ticksPerBeat)<1e-9);
console.log('PASS tempo fit: near-coincident onset no longer overrides rhythm accuracy; residual quantization, speed limits, original/strict, fixed resolution and tempo continuity');
