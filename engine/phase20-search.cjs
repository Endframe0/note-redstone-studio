'use strict';
const fs=require('fs');
const {searchPortfolio}=require('./portfolio-search.cjs'),{transform,merge,cells,compatible}=require('./parallel-layout.cjs'),{fits,aspect}=require('./objective.cjs'),{auditSignals}=require('./signal-audit.cjs');
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
 let best=null;
 const accept=m=>{if(fits(m.dimensions,opt)&&(!best||m.volume<best.volume)){m.phase20=true;const check=auditSignals(m);if(check.pass){m.audit=check;if(opt.autoStartWiring){try{m._phaseWired=require('./phase-start.cjs').connectPhaseStart(m)}catch{return}}best=m}}};
 if(models.length===1)accept(models[0]);
 else{
  const a=models[0],ac=cells(a);
  for(let r=0;r<4;r++){const b=transform(models[1],{rotation:r}),bc=cells(b);
   for(const axis of [1,0,2])for(const gap of [1,2,3])for(const align of [0,.5,1]){
    const offset=a.bounds.map((v,i)=>i===axis?v[1]+gap+1-b.bounds[i][0]:Math.round(v[0]+(a.dimensions[i]-b.dimensions[i])*align)-b.bounds[i][0]);
    if(!compatible(ac,bc,offset))continue;
    accept(merge([a,transform(b,{offset})]));
   }
  }
 }
 return best;
}
function search20(song,opt,progress=()=>{}){
 if(!require('./versions.cjs').supports(opt.target,'phase20'))throw Error('20t 错拍启动器当前仅验证 Java 26.1.2。');
 if((opt.objective||'volume')!=='volume')throw Error('20t 首版支持体积优先；极限省材和毒曲请暂用 10t。');
 const phases=splitPhases(song),limit=Number(opt.seconds??120);if(!Number.isFinite(limit)||limit<0||limit>604800)throw Error('搜索总预算无效');
 if(Number(opt.maxTracks??8)<phases.length)throw Error('20t 奇偶拆轨需要至少两条并行线路。');
 const started=Date.now(),deadline=limit?started+limit*1000:Infinity,parts=[],stats={mode:'two-phase-20gt',attempts:0,improvements:0,workerErrors:[],backend:'cpu',gpuState:{requested:opt.backend==='gpu',used:false,active:false}},perPhase=Math.floor(Number(opt.maxTracks??8)/phases.length);
 let best=null,round=0;
 progress({phase:'log',message:'20t：奇偶游戏刻独立布线，启动错拍器在主体外；首版暂不使用跨相位乐句复用。'});
 do{
  for(let i=0;i<phases.length;i++){
   if(round&&Date.now()>=deadline)break;
   if(round&&opt.stopFile&&fs.existsSync(opt.stopFile))break;
   const p=phases[i],seconds=Math.max(.2,Math.min(30,(deadline-Date.now())/1000/(phases.length-i)));
   const phaseOpt={...opt,seconds,stopFile:round?opt.stopFile:undefined,autoStartWiring:false,experimentalPhraseReuse:false,reuseDecision:{enabled:false,reason:'20t phase isolation'},motifAnalysis:undefined,maxTracks:perPhase,maxY:phases.length===2?Math.max(4,Math.floor((Number(opt.maxY??48)-2)/2)):opt.maxY,maxSpatialAspect:0,maxListeningRadius:0,checkpoint:opt.checkpoint?opt.checkpoint+'.20gt-'+p.phase:undefined,seedParams:parts[i]?.m.searchParams?[parts[i].m.searchParams]:[]};
   progress({phase:'log',message:`20t ${p.phase?'奇数':'偶数'}刻线路，第 ${round+1} 轮（全部候选按最终主体尺寸检查）。`});
   try{
    const result=searchPortfolio(p.song,phaseOpt,e=>{if(e.phase==='log')progress(e);if(e.phase==='portfolio-progress')progress({...e,elapsed:(Date.now()-started)/1000,attempts:stats.attempts+e.attempts,improvements:stats.improvements,bestVolume:best?.volume??null,dimensionsXZY:best?[best.dimensions[0],best.dimensions[2],best.dimensions[1]]:null})});
    stats.attempts+=result.stats.attempts;stats.workerErrors.push(...result.stats.workerErrors);stats.gpuState.used||=!!result.stats.gpuState?.used;if(stats.gpuState.used)stats.backend='cpu+cuda';
    if(!parts[i]||result.manifest.volume<parts[i].m.volume)parts[i]={phase:p.phase,m:result.manifest};
   }catch(e){stats.workerErrors.push(e.message);progress({phase:'log',message:`20t ${p.phase?'奇数':'偶数'}刻线路本轮未找到有效方案；剩余预算内继续搜索。`});}
  }
  if(phases.every((_,i)=>parts[i])){const candidate=pack(parts,opt);if(candidate&&(!best||candidate.volume<best.volume)){best=candidate;stats.improvements++;progress({phase:'pipeline-best',lane:'20gt',dimensionsXZY:[best.dimensions[0],best.dimensions[2],best.dimensions[1]],volume:best.volume,template:'two-phase-20gt',runtimeVerified:false})}}
  round++;
 }while(Date.now()<deadline&&!(opt.stopFile&&fs.existsSync(opt.stopFile)));
 if(!best)throw Error('20t 两路合并后未满足主体尺寸限制；请放宽高度、比例或增加搜索时间。');
 stats.seconds=(Date.now()-started)/1000;stats.phases=phases.map(p=>({phaseGameTicks:p.phase,notes:p.song.notes.length}));
 best.search={...stats,actualAspect:aspect(best.dimensions),maxAspect:opt.maxAspect,maxTracks:opt.maxTracks,bestVolume:best.volume,baselineVolume:best.volume,improvementPercent:0,optimality:'奇偶游戏刻分别搜索紧凑模板，再检查合并主体；错拍启动器不计主体包围盒，未证明全局最小。'};
 best.phase20={enabled:true,timeResolution:20,phases:stats.phases,phraseReuse:false,componentRuntimeVerified:false};
 const exported=best._phaseWired;delete best._phaseWired;
 if(exported){exported.phase20=structuredClone(best.phase20);exported.search=structuredClone(best.search)}
 return{manifest:best,stats,exported};
}
module.exports={search20,splitPhases,pack};
