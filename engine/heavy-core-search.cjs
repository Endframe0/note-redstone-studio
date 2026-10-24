'use strict';
const fs=require('node:fs'),{designChordBus,compileBus}=require('./chord-bus-layout.cjs'),{auditSignals}=require('./signal-audit.cjs'),{fits}=require('./objective.cjs');
function searchHeavyCore(song,baseline,opt={},progress=()=>{}){
 if(!opt.heavyCore)return{manifest:baseline,stats:{disabled:true}};
 if(!require('./versions.cjs').supports(opt.target,'heavyCore')||(opt.backend||'cpu')!=='cpu'||opt.externalInputs===false)throw Error('沉重核心模板需要 Java 1.21 或更新版本、CPU 和外部同步入口。');
 const limits={maxX:80,maxZ:80,maxY:48,maxAspect:1.5,maxSpatialAspect:2,maxListeningRadius:40,...opt},settings={seconds:30,maxCap:38,maxRows:32,...opt.heavyCoreSearch};
 if(!Number.isFinite(settings.seconds)||settings.seconds<0||!Number.isInteger(settings.maxCap)||settings.maxCap<4||settings.maxCap>128||!Number.isInteger(settings.maxRows)||settings.maxRows<1||settings.maxRows>128)throw Error('Invalid heavy core search settings');
 const start=Date.now(),deadline=settings.seconds?start+1000*settings.seconds:Infinity,stopped=()=>Date.now()>=deadline||Boolean(opt.stopFile&&fs.existsSync(opt.stopFile));
 const stats={backend:'cpu',builds:0,audits:0,improvements:0,runtimeVerified:false,globalMinimumProven:false};let best=baseline,last=0;
 const notify=force=>{const incumbent=opt.getIncumbent?.();if(incumbent&&(incumbent.volume<best.volume||incumbent.volume===best.volume&&incumbent.blocks.length<best.blocks.length))best=incumbent;if(force||Date.now()-last>1000){last=Date.now();progress({phase:'heavy-core-search',...stats,seconds:(Date.now()-start)/1000,bestVolume:best.volume})}};
 const candidate=params=>{stats.builds++;try{
  const m=designChordBus(song,{...params,support:opt.support||'cobblestone',snareBase:'heavy_core'});
  if(!fits(m.dimensions,limits)||m.volume>best.volume||m.volume===best.volume&&m.blocks.length>=best.blocks.length)return;
  stats.audits++;const audit=auditSignals(m);if(!audit.pass)return;m.audit=audit;m.searchParams={kind:'chord-bus',...m.busParams};m.heavyCore={enabled:true,coreCount:m.blocks.filter(b=>b.block.startsWith('heavy_core[')).length,snareBase:'heavy_core',runtimeVerified:false};best=m;stats.improvements++;notify(true);opt.onHeavyCoreCandidate?.(m);
 }catch{}};
 if(!song.notes.some(n=>n.instrument===3))return{manifest:best,stats:{...stats,noSnare:true}};
 if(baseline.busParams&&!stopped())for(const riseStyle of ['powered','folded'])candidate({...baseline.busParams,layerHeight:3,layerHeights:null,riseStyle});
 let count;try{count=compileBus(song,{splitLongRests:true}).length}catch{return{manifest:best,stats:{...stats,skipped:'chord-density-exceeds-single-bus'}}}
 const jobs=[];
 for(let cap=4;cap<=settings.maxCap;cap++)for(let rows=1;rows<=settings.maxRows;rows++)for(const riseStyle of ['powered','folded','wide']){
  const rowCount=Math.ceil(count/cap),dims=[2*cap+4,3*Math.ceil(rowCount/rows),2*Math.min(rows,rowCount)+(riseStyle==='wide'?5:1)];
  const score=dims.reduce((a,b)=>a*b,1)*(1+.05*Math.max(...dims)/Math.min(...dims));
  jobs.push({params:{cap,rows,layerHeight:3,rowPitch:2,cutMode:'adaptive',splitLongRests:true,riseStyle},score});
 }
 jobs.sort((a,b)=>a.score-b.score);
 for(const {params}of jobs){if(stopped())break;candidate(params);notify()}
 stats.seconds=(Date.now()-start)/1000;stats.stopReason=stopped()?'time-or-stop-request':'finite-search-complete';notify(true);return{manifest:best,stats};
}
module.exports={searchHeavyCore};
