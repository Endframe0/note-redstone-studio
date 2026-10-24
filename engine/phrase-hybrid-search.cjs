'use strict';
const fs=require('node:fs');
const {analyzeMotifs,combineScheduledMotifs}=require('./motif-analysis.cjs');
const {designChordBus}=require('./chord-bus-layout.cjs');
const {chordBusSeeds}=require('./chord-bus-seeds.cjs');
const {decomposePhraseReuse,designAdaptivePhraseReuse}=require('./adaptive-phrase-reuse.cjs');
const {designPhraseHybrid}=require('./phrase-hybrid-layout.cjs');
const {exclusion}=require('./adaptive-scheduled-repeat.cjs');
const {fits}=require('./objective.cjs');
const {phraseCoreShapes,shapesInside,coreCompatibility}=require('./phrase-core-shapes.cjs');
const {placementGrid,corePlacements}=require('./core-placement.cjs');

// This search replaces one exact repeated phrase at a time. It searches actual
// occupied cells, not the sum of component bounding boxes. All internal timers,
// return paths, inventories and compensated relay routes are reconstructed.
// Finite component audits do not certify a complete hopper network's replay.
function eligible(c){
 const calls=c.calls.map(v=>v.tick);
 return calls.length>=2&&calls.length<=3&&calls[0]>=8&&calls[0]<=1286&&
  calls.every((t,i)=>!i||t-calls[i-1]>c.duration+4&&t-calls[i-1]>=6&&t-calls[i-1]<=1285);
}
function packingBounds(bus,maxVolume,limits,extraSpace){
 const choices=[bus.bounds];
 for(let axis=0;axis<3;axis++)for(const face of [0,1])for(let extra=1;extra<=extraSpace;extra++){
  const b=bus.bounds.map(v=>[...v]);b[axis][face]+=(face?1:-1)*extra;choices.push(b);
 }
 return choices.filter(b=>{const dims=b.map(([a,z])=>z-a+1);return dims.reduce((a,b)=>a*b,1)<=maxVolume&&fits(dims,limits)});
}
function searchPhraseHybrids(song,baseline,opt={},progress=()=>{}){
 const limits={maxX:80,maxY:48,maxZ:80,maxAspect:1.5,maxSpatialAspect:2,maxListeningRadius:40,...opt};
 if(!require('./versions.cjs').supports(opt.target,'reuse'))throw Error('乐句复用需要 Java 1.21 或更新版本');
 if(opt.backend&&opt.backend!=='cpu')throw Error('乐句复用实验仅支持 CPU');
 if(opt.externalInputs===false||Number(opt.maxTracks??8)<2)throw Error('乐句复用需要至少两个同时启动的外部入口');
 const settings={seconds:120,maxMotifs:8,residualCandidates:40,residualBuildLimit:800,corePoseLimit:16,placementLimit:16,maxRouteCells:64,extraHeight:3,...opt.reuseSearch};
 if(!Number.isFinite(settings.seconds)||settings.seconds<0)throw Error('复用搜索时间无效');
 for(const k of ['maxMotifs','residualCandidates','residualBuildLimit','corePoseLimit','placementLimit','maxRouteCells','extraHeight'])if(!Number.isInteger(settings[k])||settings[k]<0||(k!=='extraHeight'&&settings[k]===0))throw Error('复用搜索参数无效：'+k);
 if(settings.maxRouteCells<15||settings.maxRouteCells>96)throw Error('复用内部线路长度须为 15–96');
 if(settings.splitSeconds!==undefined&&(!Number.isFinite(settings.splitSeconds)||settings.splitSeconds<=0))throw Error('残余拆轨搜索时间必须为正数');
 if(settings.driverShapes&&(!Array.isArray(settings.driverShapes)||!settings.driverShapes.length||settings.driverShapes.some(v=>!['flat','stack'].includes(v))))throw Error('复用调度器形状无效');
 const started=Date.now(),deadline=settings.seconds===0?Infinity:started+1000*settings.seconds;
 const stopped=()=>Date.now()>=deadline||Boolean(opt.stopFile&&fs.existsSync(opt.stopFile));
 let best=baseline,bestRecipe=null,lastNotify=0;
 const stats={engine:'adaptive-phrase-hybrid',scheduler:'round-robin',backend:'cpu',baselineVolume:baseline.volume,attemptedRecipes:0,rejectedRecipes:0,motifs:0,residualBuilds:0,corePlacements:0,improvements:0,runtimeVerified:false};
 function notify(force=false){const incumbent=opt.getIncumbent?.();if(incumbent&&(incumbent.volume<best.volume||incumbent.volume===best.volume&&incumbent.blocks.length<best.blocks.length)){best=incumbent;bestRecipe=null;}if(force||Date.now()-lastNotify>1000){lastNotify=Date.now();progress({phase:'reuse-search',...stats,seconds:(Date.now()-started)/1000,bestVolume:best.volume,dimensionsXZY:[best.dimensions[0],best.dimensions[2],best.dimensions[1]]})}}
 function candidate(recipe){
  stats.attemptedRecipes++;
  let m;try{m=designPhraseHybrid(song,recipe,{support:opt.support})}catch(e){stats.rejectedRecipes++;stats.lastRejection=e.message;return}
  if(m.inputs.length>Number(opt.maxTracks??8))return;
  if(!fits(m.dimensions,limits)||m.volume>best.volume||m.volume===best.volume&&m.blocks.length>=best.blocks.length)return;
  best=m;bestRecipe=recipe;stats.improvements++;notify(true);opt.onReuseCandidate?.({manifest:m,recipe});
 }
 // Seeds are source-bound recipes, never cached block arrays or pass flags.
 for(const recipe of opt.reuseRecipes||[]){if(stopped())break;candidate(recipe)}
 if(!stopped()&&!settings.seedOnly){
  const analysis=opt.motifAnalysis||analyzeMotifs(song,{maxEvents:settings.maxEvents??64,limit:128,candidateLimit:Infinity,includeCandidates:true,candidateDiversity:true,candidateFilter:eligible});
  // Nearby phrase lengths often have identical calls. Keep their best note
  // saving first, then diversify by voice and call schedule before packing.
  const usable=analysis.candidates.filter(c=>coreCompatibility(c.pattern).supported);
  const combinedRaw=settings.combineVoices===false?[]:combineScheduledMotifs(usable).filter(eligible);
  const combined=combinedRaw.filter(c=>coreCompatibility(c.pattern).supported);stats.combinedSchedules=combined.length;
  stats.unsupportedCoreCandidates=analysis.candidates.length-usable.length+combinedRaw.length-combined.length;
  const unique=new Map();for(const c of [...usable,...combined].sort((a,b)=>b.savedNotes-a.savedNotes)){const k=c.view+':'+c.calls.map(v=>v.tick).join();if(!unique.has(k))unique.set(k,c)}
  const diverse=[],similar=[];for(const c of unique.values()){const ids=new Set(c.calls.flatMap(v=>v.noteIds));if(diverse.some(other=>{let shared=0;for(const id of ids)if(other.ids.has(id))shared++;return shared>Math.min(ids.size,other.ids.size)*.8}))similar.push(c);else diverse.push({c,ids})}
  const motifs=[...diverse.map(v=>v.c),...similar].filter(c=>!settings.motifViews||settings.motifViews.includes(c.view)).slice(0,settings.maxMotifs);stats.detectedCandidates=analysis.candidateCount;stats.eligibleSchedules=unique.size;
  function* explore(motif){
   if(stopped())return;stats.motifs++;notify(true);
   const calls=motif.calls.map(c=>c.tick),used=new Set(motif.calls.flatMap(c=>c.noteIds)),remaining=song.notes.filter((_,i)=>!used.has(i));if(!remaining.length)return;
   const residuals=[],seen=new Set(),seeds=[...(opt.reuseResidualSeeds||[]),...chordBusSeeds({notes:remaining},{...limits,externalInputs:true})];
   if(opt.separateSnare&&Number(opt.maxTracks??8)>=3&&remaining.some(n=>n.instrument===3)&&remaining.some(n=>n.instrument!==3)&&!stopped()){
    yield;
    const result=require('./snare-split-search.cjs').searchSnareSplit({notes:remaining},best,{...limits,backend:'cpu',externalInputs:true,maxSpatialAspect:0,snareSearch:{seconds:Math.max(.001,Math.min(settings.splitSeconds??30,(deadline-Date.now())/1000)),maxCap:28,maxRows:24},candidateFilter:m=>packingBounds(m,best.volume-1,limits,settings.extraHeight).length>0,onSnareCandidate:m=>residuals.push({params:m.searchParams,volume:m.volume,blocks:m.blocks.length})},()=>notify());
    stats.residualSplitBuilds=(stats.residualSplitBuilds||0)+result.stats.builds;stats.residualSplitPoses=(stats.residualSplitPoses||0)+result.stats.poses;notify(true);yield;
   }
   let builds=0;
   for(const params of seeds){
    if(stopped()||builds>=settings.residualBuildLimit)break;const k=JSON.stringify(params);if(seen.has(k))continue;seen.add(k);builds++;stats.residualBuilds++;
    try{const m=params.kind==='snare-split'?require('./snare-split-layout.cjs').designSnareSplit({notes:remaining},params.recipe):designChordBus({notes:remaining},params);if(m.inputs.length+1<=Number(opt.maxTracks??8)&&m.volume<=best.volume&&packingBounds(m,best.volume,limits,settings.extraHeight).length)residuals.push({params,volume:m.volume,blocks:m.blocks.length})}catch{}
    notify();if(builds%25===0)yield;
   }
   residuals.sort((a,b)=>a.volume-b.volume||a.blocks-b.blocks);
   if(!residuals.length){stats.noResidualLayout=(stats.noResidualLayout||0)+1;return;}
   const cores=[];
   if(settings.coreVariants){for(const params of settings.coreVariants){try{cores.push({params,core:decomposePhraseReuse(motif.pattern,calls,params).phrase})}catch{}}}
   else for(const shape of phraseCoreShapes(motif.pattern,calls,{maxHorizontal:Math.max(limits.maxX,limits.maxZ),maxHeight:limits.maxY,shouldStop:stopped})){cores.push(shape);if(cores.length%8===0)yield}
   stats.coreShapes=(stats.coreShapes||0)+cores.length;notify(true);
   for(const seed of residuals.slice(0,settings.residualCandidates)){
    if(stopped())break;const bus=seed.params.kind==='snare-split'?require('./snare-split-layout.cjs').designSnareSplit({notes:remaining},seed.params.recipe):designChordBus({notes:remaining},seed.params),blocked=exclusion(bus.blocks,bus.inputs,'electrical'),boxes=packingBounds(bus,best.volume,limits,settings.extraHeight);
    for(const bounds of boxes){
     if(stopped())break;const grid=placementGrid(bounds,blocked);
     for(const shape of shapesInside(cores,bounds))for(const driverShape of settings.driverShapes||['flat']){
      const {core}=shape,params={...shape.params,driverShape};
      if(stopped())break;
      for(const {rotation,offset:coreOffset} of corePlacements(core,grid,{limit:settings.corePoseLimit,shouldStop:stopped})){
       stats.corePlacements++;notify();
       let part;try{part=designAdaptivePhraseReuse(motif.pattern,calls,{...params,bounds,coreOffset,coreRotation:rotation,obstacles:bus.blocks,externalInputs:bus.inputs,placementLimit:settings.placementLimit,maxRouteCells:settings.maxRouteCells,shouldStop:stopped})}catch(e){stats.placementFailures=(stats.placementFailures||0)+1;stats.lastPlacementError=e.message}
       if(part){const p=part.phraseReuse;candidate({pattern:motif.pattern,calls,...(seed.params.kind==='snare-split'?{residualRecipe:seed.params.recipe}:{busParams:seed.params}),parameters:p.parameters,coreRotation:rotation,coreOffset,driverRotation:p.driverRotation,driverOffset:p.driverOffset,maxRouteCells:p.maxRouteCells,bounds})}
       yield;
      }
      notify();yield;
     }stats.occupancyProbes=(stats.occupancyProbes||0)+grid.probes;
    }
   }
  }
  // Each motif advances in small batches, so one difficult placement does not
  // consume the entire finite budget before other repeated phrases are tried.
  const queue=motifs.map(explore);while(queue.length&&!stopped()){const task=queue.shift();if(!task.next().done)queue.push(task)}
 }
 stats.seconds=(Date.now()-started)/1000;stats.bestVolume=best.volume;stats.stopReason=opt.stopFile&&fs.existsSync(opt.stopFile)?'user-export':Date.now()>=deadline?'time-budget':'finite-search-complete';stats.globalMinimumProven=false;
 notify(true);return{manifest:best,recipe:bestRecipe,stats};
}
module.exports={searchPhraseHybrids,eligible,packingBounds};
