'use strict';
const fs=require('node:fs');
const {designChordBus,compileBus}=require('./chord-bus-layout.cjs'),{transform,merge}=require('./parallel-layout.cjs'),{auditSignals}=require('./signal-audit.cjs'),{fits}=require('./objective.cjs'),{snareTracks,buildSnarePart,designSnareSplit}=require('./snare-split-layout.cjs');
const {packingMask,compatibleMasks}=require('./typed-packing.cjs');

// The two lanes retain absolute source ticks. All silence, folds and phase
// alignment live inside the measured machine, with simultaneous external inputs.
function searchSnareSplit(song,baseline,opt={},progress=()=>{}){
 const limits={maxX:80,maxY:48,maxZ:80,maxAspect:1.5,maxSpatialAspect:2,maxListeningRadius:40,...opt},settings={seconds:120,maxCap:38,maxRows:32,interlockDepth:2,translationMargin:0,exhaustiveOffsets:false,riseStyles:['powered','folded','wide'],...opt.snareSearch};
 if(!require('./versions.cjs').supports(opt.target,'compression')||(opt.backend||'cpu')!=='cpu')throw Error('Snare split search requires Java 26.1.2 and CPU');
 if(opt.externalInputs===false||Number(opt.maxTracks??8)<2)throw Error('Snare split requires two simultaneous external inputs');
 if(!Number.isFinite(settings.seconds)||settings.seconds<0||!Number.isInteger(settings.maxCap)||settings.maxCap<4||settings.maxCap>128||!Number.isInteger(settings.maxRows)||settings.maxRows<1||settings.maxRows>128)throw Error('Invalid snare search settings');
 for(const key of ['interlockDepth','translationMargin'])if(!Number.isInteger(settings[key])||settings[key]<0||settings[key]>16)throw Error('Invalid snare packing range');
 if(!Array.isArray(settings.riseStyles)||!settings.riseStyles.length||settings.riseStyles.some(s=>!['wide','folded','powered'].includes(s)))throw Error('Invalid snare rise styles');
 const started=Date.now(),deadline=settings.seconds?started+settings.seconds*1000:Infinity,stopped=()=>Date.now()>=deadline||Boolean(opt.stopFile&&fs.existsSync(opt.stopFile));
 const voices=snareTracks(song),stats={backend:'cpu',notes:voices.map(n=>n.length),builds:0,poses:0,audits:0,improvements:0,runtimeVerified:false,globalMinimumProven:false};let best=baseline,last=0;
 const notify=force=>{const incumbent=opt.getIncumbent?.();if(incumbent&&(incumbent.volume<best.volume||incumbent.volume===best.volume&&incumbent.blocks.length<best.blocks.length))best=incumbent;if(force||Date.now()-last>1000){last=Date.now();progress({phase:'snare-search',...stats,seconds:(Date.now()-started)/1000,bestVolume:best.volume,dimensionsXZY:[best.dimensions[0],best.dimensions[2],best.dimensions[1]]})}};
 const better=m=>m.volume<best.volume||m.volume===best.volume&&m.blocks.length<best.blocks.length;
 const accept=m=>{if(!fits(m.dimensions,limits)||!better(m)||opt.candidateFilter&&!opt.candidateFilter(m))return;best=m;stats.improvements++;notify(true);opt.onSnareCandidate?.(m)};
 for(const recipe of opt.snareRecipes||[]){if(stopped())break;try{accept(designSnareSplit(song,recipe,{support:opt.support||'cobblestone'}))}catch{}}
 if(voices.some(v=>!v.length)||settings.seedOnly){stats.seconds=(Date.now()-started)/1000;return {manifest:best,stats}}
 // Improve the incumbent's real routes before rebuilding a large catalog.
 // This also upgrades old cached recipes without importing their block arrays.
 if(best.snareSplit?.recipe){const incumbent=best.snareSplit.recipe;
  for(const mainStyle of settings.riseStyles)for(const sandStyle of settings.riseStyles){
   if(stopped())break;const recipe=structuredClone(incumbent);recipe.parts[0].params.riseStyle=mainStyle;recipe.parts[1].params.riseStyle=sandStyle;
   try{stats.audits++;accept(designSnareSplit(song,recipe,{support:opt.support||'cobblestone'}))}catch{}
  }
 }
 try{for(const notes of voices)compileBus({notes},{splitLongRests:true})}catch{return{manifest:best,stats:{...stats,skipped:'chord-density-exceeds-two-voice-split'}}}
 const catalogSlice=(deadline-Date.now())*.45/2;
 const catalog=voices.map((notes,index)=>{
  const found=[],jobs=[],count=compileBus({notes},{splitLongRests:true}).length,until=Math.min(deadline,Date.now()+catalogSlice);
  for(let cap=4;cap<=Math.min(settings.maxCap,Math.floor((Math.max(limits.maxX,limits.maxZ)-4)/2));cap++)for(let rows=1;rows<=settings.maxRows;rows++)for(const riseStyle of settings.riseStyles){
   const rowCount=Math.ceil(count/cap),dims=[2*cap+4,Math.ceil(rowCount/rows)*(index?4:3),2*Math.min(rows,rowCount)+(riseStyle==='wide'?5:1)];
   // An estimate only orders actual builds. Parts may be flat or long because
   // their union, rather than each part, must satisfy the listening limits.
   const score=dims.reduce((a,b)=>a*b,1)*(1+.01*Math.max(dims[0],dims[2])/Math.min(dims[0],dims[2]));
   jobs.push({cap,rows,riseStyle,score});
  }
  jobs.sort((a,b)=>a.score-b.score);
  for(const {cap,rows,riseStyle} of jobs){
   if(stopped()||Date.now()>=until){stats.catalogBudgetLimited=true;break}stats.builds++;const params={cap,rows,layerHeight:index?4:3,rowPitch:2,splitLongRests:true,cutMode:'adaptive',support:opt.support||'cobblestone',...(riseStyle!=='wide'?{riseStyle}:{})};
   try{const m=designChordBus({notes},params);if(Math.max(m.dimensions[0],m.dimensions[2])>Math.max(limits.maxX,limits.maxZ)||m.dimensions[1]>limits.maxY)continue;found.push({params,dimensions:m.dimensions,volume:m.volume})}catch{}notify();
  }
  found.sort((a,b)=>a.volume-b.volume);return [...new Map(found.map(c=>[[c.dimensions.join(),c.params.riseStyle||'wide'].join('|'),c])).values()];
 });stats.catalog=catalog.map(c=>c.length);
 const jobs=[];
 for(let ai=0;ai<catalog[0].length&&!stopped();ai++){
  for(let bi=0;bi<catalog[1].length;bi++)for(const rotation of [0,1,2,3])for(let axis=0;axis<3;axis++)for(let gap=-settings.interlockDepth;gap<=1;gap++){
   const a=catalog[0][ai].dimensions,b=catalog[1][bi].dimensions,bd=rotation%2?[b[2],b[1],b[0]]:b,dims=a.map((v,i)=>i===axis?Math.max(v,bd[i],v+bd[i]+gap):Math.max(v,bd[i])),volume=dims.reduce((a,b)=>a*b,1);
   if(volume<=best.volume&&fits(dims,limits))jobs.push({ai,bi,rotation,axis,gap,volume});
  }notify();
 }jobs.sort((a,b)=>a.volume-b.volume);stats.packingJobs=jobs.length;
 // Bound cached geometry independently of the amount of permitted CPU time.
 const cache=new Map(),get=(track,index,rotation=0)=>{const k=[track,index,rotation].join();if(cache.has(k)){const v=cache.get(k);cache.delete(k);cache.set(k,v);return v}const m=buildSnarePart(voices[track],{params:catalog[track][index].params,rotation},opt.support||'cobblestone'),entry={m,data:packingMask(m),valid:auditSignals(m).pass};stats.audits++;cache.set(k,entry);if(cache.size>12)cache.delete(cache.keys().next().value);return entry};
 for(const job of jobs){
  if(stopped()||job.volume>best.volume)break;
  const a=get(0,job.ai),b=get(1,job.bi,job.rotation);if(!a.valid||!b.valid)continue;
  const offsets=[0,1,2].filter(i=>i!==job.axis).map(i=>{const delta=a.m.dimensions[i]-b.m.dimensions[i];if(!settings.exhaustiveOffsets)return [...new Set([0,Math.floor(delta/2),delta])];const lo=Math.min(0,delta)-settings.translationMargin,hi=Math.max(0,delta)+settings.translationMargin;return Array.from({length:hi-lo+1},(_,n)=>lo+n);});
  for(const reverse of [false,true])for(const u of offsets[0])for(const v of offsets[1]){
   if(stopped())break;const offset=[];let j=0;for(let i=0;i<3;i++)offset.push(i===job.axis?(reverse?-b.m.dimensions[i]-job.gap:a.m.dimensions[i]+job.gap):[u,v][j++]);stats.poses++;notify();
   const dims=a.m.dimensions.map((n,i)=>Math.max(n,offset[i]+b.m.dimensions[i])-Math.min(0,offset[i]));if(dims.reduce((a,b)=>a*b,1)>best.volume||!fits(dims,limits))continue;
   if(!compatibleMasks(a.data,b.data,offset))continue;
   let m;try{m=merge([a.m,transform(b.m,{offset})])}catch{continue}if(!fits(m.dimensions,limits)||!better(m))continue;stats.audits++;if(!auditSignals(m).pass)continue;
   const recipe={parts:[{params:catalog[0][job.ai].params,rotation:0},{params:catalog[1][job.bi].params,rotation:job.rotation,offset}],normalizeBeforeOffset:true};
   accept(designSnareSplit(song,recipe,{support:opt.support||'cobblestone'}));
  }
 }
 stats.seconds=(Date.now()-started)/1000;stats.stopReason=stopped()?'time-or-stop-request':stats.catalogBudgetLimited?'partial-catalog-packing-complete':'finite-search-complete';notify(true);
 return {manifest:best,stats};
}
module.exports={searchSnareSplit};
