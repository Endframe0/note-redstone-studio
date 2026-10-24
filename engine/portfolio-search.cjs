'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Worker,MessageChannel,receiveMessageOnPort}=require('node:worker_threads');
const {fits,aspect}=require('./objective.cjs');
const {ProgressTotals}=require('./portfolio-progress.cjs');
function searchPortfolio(song,opt,progress=()=>{}){
 const started=Date.now(),seconds=Number(opt.seconds??120);
 if(!Number.isFinite(seconds)||seconds<0||seconds>604800)throw Error('搜索总预算无效');
 const deadline=seconds?started+seconds*1000:Infinity;
 const limits={maxX:80,maxZ:80,maxY:48,maxAspect:1.5,maxSpatialAspect:2,maxListeningRadius:40,...opt};
 if(!['cpu','gpu'].includes(opt.backend||'cpu'))throw Error('未知计算设备');
 if(!Number.isInteger(Number(opt.workers??1))||Number(opt.workers??1)<1||Number(opt.workers??1)>128)throw Error('并行线程必须为 1–128');
 if(!Number.isInteger(Number(opt.maxTracks??8))||Number(opt.maxTracks??8)<1||Number(opt.maxTracks??8)>8)throw Error('并行线路上限必须为 1–8');
 for(const [key,max] of [['maxX',512],['maxZ',512],['maxY',384]])if(!Number.isFinite(Number(limits[key]))||Number(limits[key])<4||!limits.unboundedSize&&Number(limits[key])>max)throw Error('主体尺寸上限无效');
 for(const [key,max] of [['maxAspect',128],['maxSpatialAspect',128],['maxListeningRadius',512]]){const value=Number(limits[key]);if(!Number.isFinite(value)||value!==0&&(value<1||value>max))throw Error(key+' 参数无效');}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nbs-portfolio-')),stopFile=path.join(dir,'stop'),flags=new Int32Array(new SharedArrayBuffer(4));
 const file=opt.checkpoint?opt.checkpoint+'.portfolio.json':null;
 const lanes=['ordinary',...(opt.sandPacking?['sand-packing']:[]),...(opt.separateSnare&&song.notes.some(n=>n.instrument===3)&&song.notes.some(n=>n.instrument!==3)?['snare']:[]),...(opt.heavyCore?['heavy-core']:[]),...(opt.experimentalPhraseReuse?['reuse']:[])];
 const stats={mode:'concurrent-portfolio',attempts:0,improvements:0,workerErrors:[],lanes:{},backend:'cpu',gpu:null,gpuProcessIds:[],gpuState:{requested:opt.backend==='gpu',active:false,used:false},reuseDecision:opt.reuseDecision,stages:[]};
 let best=null,reuseResult=null,firstVolume=null,lastProgress=0;const jobs=[],packed=new Set(),totals=new ProgressTotals();
 function publishProgress(force=false){
  const now=Date.now();if(!force&&now-lastProgress<500)return;lastProgress=now;
  stats.attempts=totals.total;
  progress({phase:'portfolio-progress',elapsed:(now-started)/1000,attempts:stats.attempts,improvements:stats.improvements,bestVolume:best?.volume??null,dimensionsXZY:best?[best.dimensions[0],best.dimensions[2],best.dimensions[1]]:null,lanes:lanes.map(lane=>({lane,state:jobs.find(j=>j.lane===lane)?.done?'finished':stats.lanes[lane]?'running':'starting'}))});
 }
 function save(){if(!file||!best)return;const candidate=reuseResult?.recipe?{kind:'phrase-hybrid',recipe:reuseResult.recipe}:best.searchParams;if(!candidate)return;fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify({version:2,candidate,volume:best.volume}));fs.renameSync(file+'.tmp',file);}
 function toPacking(m){const job=jobs.find(j=>j.lane==='sand-packing');if(!job||job.done||!m.busParams||m.hybridNetwork)return;const key=JSON.stringify(m.busParams);if(packed.has(key))return;packed.add(key);if(packed.size>4096)packed.delete(packed.values().next().value);job.port.postMessage({type:'packing',manifest:m});}
 function accept(m,reuse,lane){
  if(!m||!fits(m.dimensions,limits)||m.inputs.length>Number(opt.maxTracks??8)||!opt.heavyCore&&m.blocks.some(b=>b.block.split('[')[0]==='heavy_core'))return;
  // A reused circuit has its separate, explicitly limited component audit.
  if(m.hybridNetwork?!reuse?.recipe||!m.compositionChecks?.sourceEvents:!m.audit?.pass)return;
  if(best&&(m.volume>best.volume||m.volume===best.volume&&m.blocks.length>=best.blocks.length))return;
  best=m;reuseResult=reuse;firstVolume??=m.volume;stats.improvements++;save();
  for(const j of jobs)if(!j.done)j.port.postMessage({type:'elite',manifest:m});
  toPacking(m);progress({phase:'pipeline-best',lane,dimensionsXZY:[m.dimensions[0],m.dimensions[2],m.dimensions[1]],volume:m.volume,template:m.branchMode,runtimeVerified:false});
 }
 function consume(j){for(let p;p=receiveMessageOnPort(j.port);){const e=p.message;
  if(e.type==='candidate')accept(e.manifest,e.reuse,j.lane);
  else if(e.type==='packing')toPacking(e.manifest);
  else if(e.type==='progress'){
   totals.observe(j.lane,e.cycle||1,e.event);
   // Per-lane counters and timers belong in diagnostics, not in the shared
   // status label. Only the coordinator publishes user-facing progress.
   if(e.event.phase==='log')progress(e.event);
  }
  else if(e.type==='gpu-process')stats.gpuProcessIds.push(e.pid);
  else if(e.type==='started'){stats.lanes[j.lane]={startedAt:e.time,startedAfterMs:e.time-started};progress({phase:'portfolio-start',lane:j.lane,lanes});}
  else if(e.type==='stats'){
   const s=e.stats;totals.observe(j.lane,e.round,s);stats.attempts=totals.total;stats.lanes[j.lane]={...stats.lanes[j.lane],cycles:e.round,work:totals.laneTotal(j.lane),last:s};
   if(s.gpuState){stats.gpuState={...stats.gpuState,...s.gpuState,used:stats.gpuState.used||s.gpuState.used,requested:opt.backend==='gpu'};if(s.gpuState.used)stats.backend='cpu+cuda';}
   if(s.gpu){stats.gpu??={attempts:0,batches:0,kernelAndTransferMs:0,builds:0,mismatches:0};for(const k of Object.keys(stats.gpu))stats.gpu[k]+=Number(s.gpu[k]||0);}
   stats.workerErrors.push(...s.workerErrors||[]);
  }else if(e.type==='error'){stats.workerErrors.push(j.lane+': '+e.message);progress({phase:'log',message:'搜索任务 '+j.lane+' 出错：'+e.message});}
  else if(e.type==='finished')j.done=true;
 }}
 try{
  let seeds=[...(opt.seedParams||[])],cachedReuse=null;
  if(file)try{const p=JSON.parse(fs.readFileSync(file)).candidate;if(p.kind==='phrase-hybrid')cachedReuse=p;else seeds.push(p);}catch{}
  for(const lane of lanes){const {port1,port2}=new MessageChannel();const worker=new Worker(path.join(__dirname,'portfolio-worker.cjs'),{workerData:{song,lane,opt:{...opt,seedParams:seeds,workers:Math.max(1,Number(opt.workers||1)-lanes.length+1),stopFile,motifAnalysis:lane==='reuse'?opt.motifAnalysis:undefined},port:port2,shared:flags.buffer,deadline},transferList:[port2]});worker.on('error',()=>{});jobs.push({worker,port:port1,lane,done:false});}
  if(cachedReuse&&opt.experimentalPhraseReuse)try{const m=require('./phrase-hybrid-layout.cjs').designPhraseHybrid(song,cachedReuse.recipe,{support:opt.support});m.audit={pass:false,status:'component-checks-only',scope:m.compositionChecks.scope};accept(m,{recipe:cachedReuse.recipe,stats:{resumed:true,runtimeVerified:false}},'reuse');}catch{}
  while(Date.now()<deadline&&!(opt.stopFile&&fs.existsSync(opt.stopFile))){for(const j of jobs)consume(j);publishProgress();if(jobs.every(j=>j.done))break;Atomics.wait(flags,0,0,20);}
 }finally{
  Atomics.store(flags,0,1);fs.writeFileSync(stopFile,'stop');const until=Date.now()+10000;
  while(jobs.some(j=>!j.done)&&Date.now()<until){for(const j of jobs)consume(j);Atomics.wait(flags,0,1,10);}
  for(const j of jobs){consume(j);stats.lanes[j.lane]={...stats.lanes[j.lane],finished:j.done};if(!j.done){stats.workerErrors.push(j.lane+': 停止超时，已保留收到的候选');j.worker.terminate();}j.worker.unref();j.port.close();}
  for(const pid of stats.gpuProcessIds)try{process.kill(pid)}catch{}
  // Leave a stop marker if a worker needed forced termination; never race its
  // filesystem polling by removing that marker prematurely.
  if(jobs.every(j=>j.done)){fs.unlinkSync(stopFile);fs.rmdirSync(dir);}
 }
 if(!best)throw Error('没有找到通过检查且满足限制的布局；可增加搜索时间或放宽形状限制。'+stats.workerErrors.slice(0,2).join('\n'));
 publishProgress(true);
 stats.gpuState.active=false;stats.seconds=(Date.now()-started)/1000;stats.stopReason=opt.stopFile&&fs.existsSync(opt.stopFile)?'user-export':'time-budget';
 best.search={...best.search,...stats,tracks:best.inputs.length,workers:opt.workers||1,backendRequested:opt.backend||'cpu',actualAspect:aspect(best.dimensions),maxAspect:opt.maxAspect??1.5,baselineVolume:firstVolume,bestVolume:best.volume,improvementPercent:100*(1-best.volume/firstVolume),checkpoint:file,optimality:'普通布线、沙子拆轨、层间压缩同时搜索并共享候选；符合重复度条件才加入乐句复用。按实际体积择优，未证明全局最小。'};
 save();return{manifest:best,reuseResult,stats};
}
module.exports={searchPortfolio};
