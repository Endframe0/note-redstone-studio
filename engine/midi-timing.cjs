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
  let maxErrorMs=0,sumError=0,boundaryErrorMs=0,alignedOnsets=0;const segments=[];
  for(let i=0;i<tempos.length;i++){
   const t=tempos[i],end=tempos[i+1]?.tick??raw.midi.lastTick;
   const outputStart=t.numerator/ppq/1e6*resolution/speed/factor,ticksPerBeat=t.us/1e6*resolution/speed/factor;
   const next=outputStart+(end-t.tick)/ppq*ticksPerBeat;
   if(i+1<tempos.length)boundaryErrorMs=Math.max(boundaryErrorMs,Math.abs(next-Math.round(next))/resolution*1000);
   const seg={tick:t.tick,endTick:end,outputStart,ticksPerBeat,originalBpm:60e6/t.us,actualBpm:60*resolution/ticksPerBeat,speedFactor:speed*factor,adjustmentPercent:(factor-1)*100};
   for(const tick of grouped[i]){const x=outputStart+(tick-t.tick)/ppq*ticksPerBeat,error=Math.abs(x-Math.round(x))/resolution*1000;maxErrorMs=Math.max(maxErrorMs,error);sumError+=error;if(error<1e-5)alignedOnsets++}
   segments.push(seg);
  }
  const timing={resolution,ppq,mode,tolerancePercent:tolerance,globalSpeedFactor:speed*factor,tempoRatiosPreserved:true,segments,maxOnsetErrorMs:maxErrorMs,meanOnsetErrorMs:sumError/Math.max(1,raw.notes.length),boundaryErrorMs,maxSpeedChangePercent:Math.abs(factor-1)*100,alignedOnsets};
  let previousSource=-1,previousTarget=-1,merged=0;
  for(const n of raw.notes){if(n.midiTick===previousSource)continue;const tick=mapTick(n.midiTick,timing);if(tick===previousTarget)merged++;previousTarget=tick;previousSource=n.midiTick}
  timing.mergedOnsets=merged;timing.exact=maxErrorMs<1e-5&&boundaryErrorMs<1e-5;return timing;
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
 candidates.sort((a,b)=>Number(b.exact)-Number(a.exact)||a.mergedOnsets-b.mergedOnsets||(a.exact?a.maxSpeedChangePercent-b.maxSpeedChangePercent:a.maxOnsetErrorMs-b.maxOnsetErrorMs||b.alignedOnsets-a.alignedOnsets||a.meanOnsetErrorMs-b.meanOnsetErrorMs)||a.maxSpeedChangePercent-b.maxSpeedChangePercent||a.resolution-b.resolution);
 const chosen=candidates[0];
 if(mode==='strict'&&!chosen.exact)throw Error('MIDI 原速无法严格对齐 10t / 20t；请选择节拍适配或允许量化。');
 return chosen;
}
function mapExact(tick,p){let lo=0,hi=p.segments.length;while(lo+1<hi){const m=(lo+hi)>>1;if(p.segments[m].tick<=tick)lo=m;else hi=m}const s=p.segments[lo];return s.outputStart+(tick-s.tick)/p.ppq*s.ticksPerBeat}
function mapTick(tick,p){return Math.round(mapExact(tick,p))}
function messages(p){return [`MIDI 自动选择 ${p.resolution}t；${p.segments.length} 个速度段，保持各段 BPM 比例；整体速度调整 ${p.maxSpeedChangePercent.toFixed(3)}%。`,...p.segments.slice(0,8).map(s=>`BPM ${s.originalBpm.toFixed(3)} → ${s.actualBpm.toFixed(3)}（${s.adjustmentPercent>=0?'+':''}${s.adjustmentPercent.toFixed(3)}%）。`),p.exact?'起音和速度段边界全部落在整刻上，节拍无累积错位。':`仍有无法整刻对齐的拍点：起音最大量化偏差 ${p.maxOnsetErrorMs.toFixed(3)} ms，${p.mergedOnsets} 个不同起音合并；没有逐间隔累加取整。`]}
module.exports={plan,mapTick,mapExact,messages};
