'use strict';
const gcd=(a,b)=>{while(b){const r=a%b;a=b;b=r}return a};
function plan(raw,opt={}){
 const tolerance=Number(opt.midiSpeedTolerance??10),mode=opt.midiTimingMode||'fit',speed=Number(opt.speed??1);
 if(!Number.isFinite(tolerance)||tolerance<0||tolerance>25||!['fit','original','strict'].includes(mode))throw Error('MIDI 时序设置无效。');
 if(![0.5,1,2].includes(speed))throw Error('MIDI 播放速度无效。');
 const ppq=raw.midi.ppq,tempos=raw.midi.tempo,grouped=tempos.map(()=>[]);let si=0,quantum=0;
 for(const n of raw.notes){while(si+1<tempos.length&&tempos[si+1].tick<=n.midiTick)si++;grouped[si].push(n.midiTick);const t=tempos[si];quantum=gcd(quantum,t.numerator+(n.midiTick-t.tick)*t.us)}
 // One speed multiplier for the entire tempo map. Tempo ratios cannot drift.
 for(const t of tempos){quantum=gcd(quantum,t.numerator);quantum=gcd(quantum,ppq*t.us)}
 function candidate(resolution,factor){
  let maxErrorMs=0,sumError=0,sumSquaredError=0,boundaryErrorMs=0,alignedOnsets=0;const segments=[];
  for(let i=0;i<tempos.length;i++){
   const t=tempos[i],end=tempos[i+1]?.tick??raw.midi.lastTick;
   const outputStart=t.numerator/ppq/1e6*resolution/speed/factor,ticksPerBeat=t.us/1e6*resolution/speed/factor;
   const next=outputStart+(end-t.tick)/ppq*ticksPerBeat;
   if(i+1<tempos.length)boundaryErrorMs=Math.max(boundaryErrorMs,Math.abs(next-Math.round(next))/resolution*1000);
   const seg={tick:t.tick,endTick:end,outputStart,ticksPerBeat,originalBpm:60e6/t.us,actualBpm:60*resolution/ticksPerBeat,speedFactor:speed*factor,adjustmentPercent:(factor-1)*100};
   for(const tick of grouped[i]){const x=outputStart+(tick-t.tick)/ppq*ticksPerBeat,error=Math.abs(x-Math.round(x))/resolution*1000;maxErrorMs=Math.max(maxErrorMs,error);sumError+=error;sumSquaredError+=error*error;if(error<1e-5)alignedOnsets++}
   segments.push(seg);
  }
  const timing={resolution,ppq,mode,tolerancePercent:tolerance,globalSpeedFactor:speed*factor,tempoRatiosPreserved:true,segments,maxOnsetErrorMs:maxErrorMs,meanOnsetErrorMs:sumError/Math.max(1,raw.notes.length),rootMeanSquareOnsetErrorMs:Math.sqrt(sumSquaredError/Math.max(1,raw.notes.length)),boundaryErrorMs,maxSpeedChangePercent:Math.abs(factor-1)*100,alignedOnsets,totalNotes:raw.notes.length,quantizedNotes:raw.notes.length-alignedOnsets};
  let previousSource=-1,previousTarget=-1,merged=0,distinct=0,quantized=0,onsetSquared=0,onsetsAbove25Ms=0,notesAbove25Ms=0;
  for(const n of raw.notes){const exact=mapExact(n.midiTick,timing),tick=Math.round(exact),error=Math.abs(exact-tick)/resolution*1000;if(error>25+1e-5)notesAbove25Ms++;if(n.midiTick===previousSource)continue;distinct++;onsetSquared+=error*error;if(error>25+1e-5)onsetsAbove25Ms++;if(error>=1e-5)quantized++;if(tick===previousTarget)merged++;previousTarget=tick;previousSource=n.midiTick}
  timing.distinctSourceOnsets=distinct;timing.distinctOnsetRmsMs=Math.sqrt(onsetSquared/Math.max(1,distinct));timing.onsetsAbove25Ms=onsetsAbove25Ms;timing.notesAbove25Ms=notesAbove25Ms;timing.quantizedOnsets=quantized;timing.mergedOnsets=merged;timing.exact=maxErrorMs<1e-5&&boundaryErrorMs<1e-5;return timing;
 }
 const candidates=[];
 for(const resolution of (opt.midiAutoResolution===false?[Number(opt.timeResolution??20)]:[10,20])){
  const factors=new Set([1]);
  const add=f=>{if(Number.isFinite(f)&&f>0&&Math.abs(f-1)*100<=tolerance+1e-7)factors.add(Number(f.toPrecision(14)))};
  if(mode==='fit'){
   const ideal=quantum/ppq/1e6*resolution/speed;for(const k of [Math.floor(ideal),Math.ceil(ideal)])if(k>0)add(ideal/k);
   // When perfect global alignment is impossible, try a small number of
   // musically meaningful global periods, never independent per-note speeds.
   const indices=tempos.map((_,i)=>i).sort((a,b)=>grouped[b].length-grouped[a].length).slice(0,8);
   for(const i of indices){const t=tempos[i];let q=ppq;for(const tick of grouped[i])q=gcd(q,tick-t.tick);
    for(const quantumTicks of [ppq,q]){const period=quantumTicks/ppq*t.us/1e6*resolution/speed;for(const k of [Math.floor(period),Math.ceil(period)])if(k>0)add(period/k)}
   }
  }
  for(const factor of factors)candidates.push(candidate(resolution,factor));
 }
 // Whole-song timing error wins over a single near-coincident onset merge.
 // RMS penalizes large outliers without letting one irregular note dictate the
 // tempo of thousands of otherwise precisely aligned notes. Keep merge counts
 // visible and use them to break ties; no onset is silently dropped here.
 const compare=(a,b)=>Math.abs(a-b)<1e-6?0:a-b;
 candidates.sort((a,b)=>Number(b.exact)-Number(a.exact)||(a.exact?
  compare(a.maxSpeedChangePercent,b.maxSpeedChangePercent):
  compare(a.rootMeanSquareOnsetErrorMs,b.rootMeanSquareOnsetErrorMs)||compare(a.maxOnsetErrorMs,b.maxOnsetErrorMs)||compare(a.boundaryErrorMs,b.boundaryErrorMs)||a.mergedOnsets-b.mergedOnsets||compare(a.meanOnsetErrorMs,b.meanOnsetErrorMs)||b.alignedOnsets-a.alignedOnsets)||compare(a.maxSpeedChangePercent,b.maxSpeedChangePercent)||a.resolution-b.resolution);
 let chosen=candidates[0];
 // A few irregular notes must not force two full redstone phases for an
 // otherwise 10t score. Compare distinct onsets as well as note counts: a
 // large chord may not hide timing damage in a sparse melody. Never delete
 // events, change individual intervals or downgrade a true fast passage.
 if(opt.midiAutoResolution!==false&&opt.midiPrefer10t!==false&&chosen.resolution===20){
  const ten=candidates.find(c=>c.resolution===10),twenty=chosen;
  const limits={maxDistinctOnsetRmsMs:10,maxAddedDistinctOnsetRmsMs:3,maxLateOnsetFraction:.02,maxLateNoteFraction:.02,maxAddedMergeFraction:.005};
  const safe=ten&&(ten.exact||mode!=='strict'&&
   ten.distinctOnsetRmsMs<=Math.max(limits.maxDistinctOnsetRmsMs,twenty.distinctOnsetRmsMs+limits.maxAddedDistinctOnsetRmsMs)+1e-5&&
   ten.onsetsAbove25Ms<=ten.distinctSourceOnsets*limits.maxLateOnsetFraction+1e-7&&
   ten.notesAbove25Ms<=ten.totalNotes*limits.maxLateNoteFraction+1e-7&&
   ten.mergedOnsets-twenty.mergedOnsets<=Math.floor(ten.distinctSourceOnsets*limits.maxAddedMergeFraction));
  if(safe)chosen=ten;
  const summary=c=>({resolution:c.resolution,exact:c.exact,maxOnsetErrorMs:c.maxOnsetErrorMs,distinctOnsetRmsMs:c.distinctOnsetRmsMs,onsetsAbove25Ms:c.onsetsAbove25Ms,notesAbove25Ms:c.notesAbove25Ms,mergedOnsets:c.mergedOnsets,maxSpeedChangePercent:c.maxSpeedChangePercent});
  chosen={...chosen,compactTiming:{policy:'prefer-10t-with-small-onset-error',selected:!!safe,limits,candidate10:ten?summary(ten):null,candidate20:summary(twenty)}};
 }
 if(mode==='strict'&&!chosen.exact)throw Error('MIDI 原速无法严格对齐 10t / 20t；请选择节拍适配或允许量化。');
 return chosen;
}
function mapExact(tick,p){let lo=0,hi=p.segments.length;while(lo+1<hi){const m=(lo+hi)>>1;if(p.segments[m].tick<=tick)lo=m;else hi=m}const s=p.segments[lo];return s.outputStart+(tick-s.tick)/p.ppq*s.ticksPerBeat}
function mapTick(tick,p){return Math.round(mapExact(tick,p))}
function messages(p){return [`MIDI 自动选择 ${p.resolution}t；${p.segments.length} 个速度段，保持各段 BPM 比例；整体速度调整 ${p.maxSpeedChangePercent.toFixed(3)}%。`,...(p.compactTiming?[p.compactTiming.selected?`优先紧凑 10t：独立起音均方根误差 ${p.distinctOnsetRmsMs.toFixed(3)} ms，超过 25 ms 的起音 ${p.onsetsAbove25Ms} / ${p.distinctSourceOnsets}；全部音符保留。`:'10t 的节奏误差或起音合并超出紧凑阈值，保留 20t。']:[]),...p.segments.slice(0,8).map(s=>`BPM ${s.originalBpm.toFixed(3)} → ${s.actualBpm.toFixed(3)}（${s.adjustmentPercent>=0?'+':''}${s.adjustmentPercent.toFixed(3)}%）。`),p.exact?'起音和速度段边界全部落在整刻上，节拍无累积错位。':`${p.alignedOnsets} / ${p.totalNotes??'?'} 个音符起音精确对齐，剩余 ${p.quantizedNotes??'?'} 个需量化；平均偏差 ${p.meanOnsetErrorMs.toFixed(3)} ms，最大 ${p.maxOnsetErrorMs.toFixed(3)} ms，${p.mergedOnsets} 个不同起音合并。${p.boundaryErrorMs>=1e-5?`速度段边界偏差 ${p.boundaryErrorMs.toFixed(3)} ms。`:''}没有逐间隔累加取整。`]}
module.exports={plan,mapTick,mapExact,messages};
