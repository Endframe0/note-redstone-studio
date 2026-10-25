'use strict';
const fs=require('fs');
const {searchPortfolio}=require('./portfolio-search.cjs'),{transform,merge,cells,compatible}=require('./parallel-layout.cjs'),{fits,aspect,shapePenalty}=require('./objective.cjs'),{auditSignals}=require('./signal-audit.cjs');
function splitPhases(song){
 return [0,1].map(phase=>{
  const notes=song.notes.filter(n=>Math.round(n.tick*2)%2===phase).map(n=>({...n,sourceGameTick:Math.round(n.tick*2),tick:(n.tick*2-phase)/2}));
  if(!notes.length)return null;
  const events=new Map([[0,[]]]);for(const n of notes){if(!events.has(n.tick))events.set(n.tick,[]);events.get(n.tick).push(n)}
  let prev=0;for(const t of [...events.keys()].sort((a,b)=>a-b)){while(t-prev>8){prev+=8;events.set(prev,[])}prev=t}
  return{phase,song:{...song,notes,events:[...events].sort((a,b)=>a[0]-b[0]).map(([tick,notes])=>({tick,notes}))}};
 }).filter(Boolean);
}
function pack(parts,opt){
 const models=parts.map(({m,phase})=>{const v=structuredClone(m);v.notes.forEach(n=>{n.tick+=phase/2;n.phaseGameTicks=phase});v.inputs.forEach(i=>i.phaseGameTicks=phase);return v});
 let best=null;const started=Date.now();let deadline=Infinity;const stopped=()=>Date.now()>=deadline||!!(opt.stopFile&&fs.existsSync(opt.stopFile));
 const stats={mode:'collision-aware-phase-packing',tested:0,signalChecks:0,fixedGap:false,sandClearance:'actual-blocks',interleaved:false};
 const accept=m=>{if(fits(m.dimensions,opt)&&(!best||m.volume<best.volume)){m.phase20=true;stats.signalChecks++;const check=auditSignals(m);if(check.pass){m.audit=check;if(opt.autoStartWiring){try{m._phaseWired=require('./phase-start.cjs').connectPhaseStart(m)}catch{return}}best=m}}};
 if(models.length===1)accept(models[0]);
 else{
  const a=models[0],ac=cells(a);
  for(let r=0;r<4;r++){const b=transform(models[1],{rotation:r}),bc=cells(b);
   for(const axis of [1,0,2])for(const gap of [0,1,2,3])for(const align of [0,.5,1]){
    const offset=a.bounds.map((v,i)=>i===axis?v[1]+gap+1-b.bounds[i][0]:Math.round(v[0]+(a.dimensions[i]-b.dimensions[i])*align)-b.bounds[i][0]);
    const size=require('./phase20-packing.cjs').dimensions(a,b,offset),volume=size.reduce((a,b)=>a*b,1);
    if(!fits(size,opt)||best&&volume>=best.volume)continue;
    stats.tested++;if(!compatible(ac,bc,offset))continue;
    accept(merge([a,transform(b,{offset})]));
   }
  }
  // Zero-gap candidates above are a cheap, safe fallback. Then let both
  // phase envelopes overlap wherever actual blocks and electrical clearance
  // allow it. Sand-free layers no longer inherit a fixed sand-support gap.
  deadline=Date.now()+Number(opt.phasePackingMs??5000);
  for(let r=0;r<4&&!stopped();r++){
   const b=transform(models[1],{rotation:r}),bc=cells(b);
   const candidates=require('./phase20-packing.cjs').packingCandidates(a,ac,b,bc,opt,stopped);
   for(const c of candidates){
    if(stopped()||best&&c.volume>=best.volume)break;
    stats.tested++;if(!compatible(ac,bc,c.offset))continue;
    const previous=best;accept(merge([a,transform(b,{offset:c.offset})]));
    if(best!==previous){stats.interleaved=a.bounds.every((v,i)=>v[0]<=b.bounds[i][1]+c.offset[i]&&v[1]>=b.bounds[i][0]+c.offset[i]);stats.rotation=r;stats.offset=c.offset;}
   }
  }
 }
 if(best){stats.seconds=(Date.now()-started)/1000;best.phasePacking=stats;}
 return best;
}
function search20(song,opt,progress=()=>{}){
 if(!require('./versions.cjs').supports(opt.target,'phase20'))throw Error('20t 错拍启动器当前仅验证 Java 26.1.2。');
 if((opt.objective||'volume')!=='volume')throw Error('20t 首版支持体积优先；极限省材和毒曲请暂用 10t。');
 const phases=splitPhases(song),limit=Number(opt.seconds??120);if(!Number.isFinite(limit)||limit<0||limit>604800)throw Error('搜索总预算无效');
 if(Number(opt.maxTracks??8)<phases.length)throw Error('20t 奇偶拆轨需要至少两条并行线路。');
 const started=Date.now(),deadline=limit?started+limit*1000:Infinity,parts=[],stats={mode:'two-phase-20gt',attempts:0,improvements:0,workerErrors:[],backend:'cpu',gpuState:{requested:opt.backend==='gpu',used:false,active:false}},perPhase=Math.floor(Number(opt.maxTracks??8)/phases.length);
 let best=null,round=0;const pools=phases.map(()=>[]);
 const cost=p=>p.song.notes.length*32+p.song.events.length*192;
 function remember(i,m){
  if(pools[i].includes(m))return;
  const signature=m.dimensions.map(d=>Math.round(d/2)).join(),same=pools[i].findIndex(v=>v.signature===signature);
  const ratio=phases.length===2?cost(phases[1-i])/Math.max(1,cost(phases[i])):0;
  const expected=[m.dimensions[0],m.dimensions[1]*(1+ratio)+1,m.dimensions[2]];
  const item={phase:phases[i].phase,m,signature,score:m.volume*shapePenalty(expected,opt)};
  if(same>=0){if(pools[i][same].m.volume<=m.volume)return;pools[i].splice(same,1);}
  pools[i].push(item);pools[i].sort((a,b)=>a.score-b.score||a.m.volume-b.m.volume);pools[i].splice(8);
 }
 progress({phase:'log',message:'20t：奇偶游戏刻独立布线，启动错拍器在主体外；首版暂不使用跨相位乐句复用。'});
 do{
  for(let i=0;i<phases.length;i++){
   if(round&&Date.now()>=deadline)break;
   if(round&&opt.stopFile&&fs.existsSync(opt.stopFile))break;
   const p=phases[i],seconds=Math.max(.2,Math.min(30,(deadline-Date.now())/1000/(phases.length-i)));
   const phaseOpt={...opt,seconds,stopFile:round?opt.stopFile:undefined,autoStartWiring:false,experimentalPhraseReuse:false,reuseDecision:{enabled:false,reason:'20t phase isolation'},motifAnalysis:undefined,maxTracks:perPhase,maxY:phases.length===2?Math.max(4,Math.floor((Number(opt.maxY??48)-2)/2)):opt.maxY,maxSpatialAspect:opt.unboundedSize?Number(opt.maxSpatialAspect||0)*phases.length:0,maxListeningRadius:0,checkpoint:opt.checkpoint?opt.checkpoint+'.20gt-'+p.phase:undefined,seedParams:parts[i]?.m.searchParams?[parts[i].m.searchParams]:[]};
   progress({phase:'log',message:`20t ${p.phase?'奇数':'偶数'}刻线路，第 ${round+1} 轮（全部候选按最终主体尺寸检查）。`});
   try{
    const result=searchPortfolio(p.song,phaseOpt,e=>{if(e.phase==='log')progress(e);if(e.phase==='portfolio-progress')progress({...e,elapsed:(Date.now()-started)/1000,attempts:stats.attempts+e.attempts,improvements:stats.improvements,bestVolume:best?.volume??null,dimensionsXZY:best?[best.dimensions[0],best.dimensions[2],best.dimensions[1]]:null})},{onCandidate:m=>remember(i,m)});
    stats.attempts+=result.stats.attempts;stats.workerErrors.push(...result.stats.workerErrors);stats.gpuState.used||=!!result.stats.gpuState?.used;if(stats.gpuState.used)stats.backend='cpu+cuda';
    remember(i,result.manifest);if(!parts[i]||result.manifest.volume<parts[i].m.volume)parts[i]={phase:p.phase,m:result.manifest};
   }catch(e){stats.workerErrors.push(e.message);progress({phase:'log',message:`20t ${p.phase?'奇数':'偶数'}刻线路本轮未找到有效方案；剩余预算内继续搜索。`});}
  }
  if(phases.every((_,i)=>parts[i])){
   const jobs=[{parts,score:0}];
   if(phases.length===2)for(const a of pools[0])for(const b of pools[1]){
    // Estimate a stack; actual packing checks rotations, three axes and
    // overlapping envelopes. Only the complete machine must meet ratios.
    const d=[Math.max(a.m.dimensions[0],b.m.dimensions[0]),a.m.dimensions[1]+b.m.dimensions[1]+1,Math.max(a.m.dimensions[2],b.m.dimensions[2])];
    jobs.push({parts:[a,b],score:d.reduce((a,b)=>a*b,1)*shapePenalty(d,opt)});
   }
   const tried=new Set();let packed=0;
   for(const job of jobs.sort((a,b)=>a.score-b.score)){
    const key=job.parts.map(p=>p.m.dimensions.join()+'/'+p.m.blocks.length).join(';');if(tried.has(key))continue;tried.add(key);
    const candidate=pack(job.parts,{...opt,phasePackingMs:Math.min(Number(opt.phasePackingMs??5000),1500)});packed++;
    if(candidate&&(!best||candidate.volume<best.volume)){best=candidate;stats.improvements++;progress({phase:'pipeline-best',lane:'20gt',dimensionsXZY:[best.dimensions[0],best.dimensions[2],best.dimensions[1]],volume:best.volume,template:'two-phase-20gt',runtimeVerified:false})}
    if(packed>=5||opt.stopFile&&fs.existsSync(opt.stopFile))break;
   }
  }
  round++;
 }while(Date.now()<deadline&&!(opt.stopFile&&fs.existsSync(opt.stopFile)));
 if(!best)throw Error('20t 两路合并后未满足主体尺寸限制；请放宽高度、比例或增加搜索时间。');
 stats.seconds=(Date.now()-started)/1000;stats.phases=phases.map(p=>({phaseGameTicks:p.phase,notes:p.song.notes.length}));stats.phaseAlternatives=pools.map(p=>p.length);
 best.search={...stats,phasePacking:best.phasePacking,actualAspect:aspect(best.dimensions),maxAspect:opt.maxAspect,maxTracks:opt.maxTracks,bestVolume:best.volume,baselineVolume:best.volume,improvementPercent:0,optimality:'奇偶游戏刻搜索紧凑模板，再按实际占用和电气隔离压紧、错层嵌入；不固定预留沙子间距。错拍启动器不计主体包围盒，未证明全局最小。'};
 best.phase20={enabled:true,timeResolution:20,phases:stats.phases,packing:best.phasePacking,phraseReuse:false,componentRuntimeVerified:false};
 const exported=best._phaseWired;delete best._phaseWired;
 if(exported){exported.phase20=structuredClone(best.phase20);exported.search=structuredClone(best.search)}
 return{manifest:best,stats,exported};
}
module.exports={search20,splitPhases,pack};
