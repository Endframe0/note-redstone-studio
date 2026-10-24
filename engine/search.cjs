'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Worker,MessageChannel,receiveMessageOnPort}=require('node:worker_threads');
const {design}=require('./layout.cjs'),{audit}=require('./electrical.cjs');
const {fits,aspect}=require('./objective.cjs');
const seed=[6,11,15,14,14,14,15,15,15,15,15,14,14,13,15,15,15,15,14,15,14,15,15,15,15,15,15,15,15,15,13,15,14,15,15,11];
function search(song,opt={},progress=()=>{},hooks={}){
 const seconds=Number(opt.seconds??600),maxX=Number(opt.maxX??128),maxZ=Number(opt.maxZ??128),maxY=Number(opt.maxY??19);
 const workers=Number(opt.workers??Math.min(os.availableParallelism(),32));
 if(![seconds,maxX,maxY,maxZ,workers].every(Number.isFinite)||seconds<0||seconds>604800||!Number.isInteger(workers)||workers<1||workers>128||Math.min(maxX,maxY,maxZ)<4||Math.max(maxX,maxZ)>512||maxY>384)throw Error('搜索时间、线程数或尺寸上限无效。');
 opt={...opt,maxX,maxY,maxZ,maxAspect:Number(opt.maxAspect??1.5)};
 if(opt.maxAspect!==0&&(!Number.isFinite(opt.maxAspect)||opt.maxAspect<1||opt.maxAspect>128))throw Error('长短边比例必须为 1–128，或 0 表示不限。');
 for(const [key,min,max] of [['maxSpatialAspect',1,128],['maxListeningRadius',1,512]]){const value=Number(opt[key]??0);if(!Number.isFinite(value)||(value!==0&&(value<min||value>max)))throw Error(key+' 参数无效');opt[key]=value}
 if(!['cpu','gpu'].includes(opt.backend||'cpu'))throw Error('未知计算设备');
 const requestedBackend=opt.backend||'cpu',gpuUnsupported=song.events.some(e=>Math.max(Math.ceil(e.notes.length/2),e.notes.filter(n=>n.instrument===3).length)>14);
 if(requestedBackend==='gpu'&&gpuUnsupported){opt={...opt,backend:'cpu'};progress({phase:'log',message:'此曲含密集和弦：同步拆轨使用 CPU，当前 GPU 单线路内核不适用，已自动跳过。'});}
 if(opt.maxTracks!==undefined&&(!Number.isInteger(Number(opt.maxTracks))||Number(opt.maxTracks)<1||Number(opt.maxTracks)>8))throw Error('并行线路上限必须为 1–8');
 const start=Date.now(),deadline=seconds===0?Infinity:start+seconds*1000,flags=new Int32Array(new SharedArrayBuffer(8));flags[1]=2147483647;
 let best=null,bestParams=null,improvements=0,baseline=null,fullChecks=0,resumed=false,lastNotify=0,lastSave=0,reason='time-budget',recovering=true;const seeds=[],stats={},errors=[],jobs=[];let gpuState={requested:requestedBackend==='gpu',active:false,used:false,...(requestedBackend==='gpu'&&gpuUnsupported?{skippedReason:'dense-chords-require-cpu-splitting'}:{})};
 function candidate(params){if(params.kind==='dense-chord'&&(!opt.externalInputs||!require('./versions.cjs').supports(opt.target,'compression')||params.recipe.split.count>Number(opt.maxTracks||1)||((!opt.heavyCore||!require('./versions.cjs').supports(opt.target,'heavyCore'))&&params.recipe.parts.some(p=>p.snareBase==='heavy_core'))||(!opt.sandPacking&&params.recipe.parts.some(p=>p.adaptiveSnare))||(!opt.separateSnare&&params.recipe.split.separateSnare)))return;if(params.snareBase==='heavy_core'&&(!opt.heavyCore||!require('./versions.cjs').supports(opt.target,'heavyCore')))return;if(params.kind==='snare-split'&&(!opt.separateSnare||!opt.externalInputs||Number(opt.maxTracks||1)<2||!require('./versions.cjs').supports(opt.target,'compression')))return;if(params.kind==='parallel'&&(!opt.externalInputs||params.parts.length>Number(opt.maxTracks||1)))return;if(params.kind==='chord-bus'&&(opt.chordBus===false||!opt.externalInputs||!require('./versions.cjs').supports(opt.target,'compression')))return;params={...params,buttonMode:opt.externalInputs?'external':params.buttonMode==='floor'?'floor':'buffered'};fullChecks++;try{const m=params.kind==='dense-chord'?require('./dense-chord-layout.cjs').designDenseChord(song,params.recipe,{support:opt.support||'cobblestone'}):params.kind==='snare-split'?require('./snare-split-layout.cjs').designSnareSplit(song,params.recipe,{support:opt.support||'cobblestone'}):params.kind==='chord-bus'?require('./chord-bus-layout.cjs').designChordBus(song,{...params,support:opt.support||'cobblestone'}):params.kind==='parallel'?require('./parallel-layout.cjs').designParallel(song,params,opt.support||'cobblestone'):design(song,{...params,support:opt.support||'cobblestone'});if((!opt.heavyCore||!require('./versions.cjs').supports(opt.target,'heavyCore'))&&m.blocks.some(b=>b.block.split('[')[0]==='heavy_core'))return;if(m.busParams&&m.volume<=8000000&&(!best||m.volume<=best.volume*1.6))hooks.onPackingCandidate?.(m);if(!fits(m.dimensions,opt)||m.volume>8000000||best&&(m.volume>best.volume||m.volume===best.volume&&m.blocks.length>=best.blocks.length))return;
  const a=m.busNetwork?require('./signal-audit.cjs').auditSignals(m):audit(m);if(!a.pass)return;m.audit=a;m.searchParams=params;best=m;bestParams=params.kind?params:{...params,counts:m.rowInfo.map(r=>r.count)};if(baseline===null)baseline=m.volume;improvements++;Atomics.store(flags,1,m.volume);
  for(const j of jobs)if(!j.done&&!params.kind)try{j.port.postMessage({type:'elite',params:bestParams})}catch{}
  hooks.onCandidate?.(m);progress({phase:'search',attempts:totals().attempts,valid:improvements,dimensions:[m.dimensions[0],m.dimensions[2],m.dimensions[1]],volume:m.volume,elapsed:(Date.now()-start)/1000,workers});save();
 }catch{}}
 function totals(){return Object.values(stats).reduce((a,b)=>({attempts:a.attempts+b.attempts,builds:a.builds+b.builds,restarts:a.restarts+b.restarts}),{attempts:fullChecks,builds:fullChecks,restarts:0})}
 function save(){if(recovering||!best||!opt.checkpoint)return;fs.mkdirSync(path.dirname(opt.checkpoint),{recursive:true});const data={version:2,updatedAt:new Date().toISOString(),best:bestParams,volume:best.volume,dimensions:best.dimensions,stats:totals(),seconds:(Date.now()-start)/1000};const temp=opt.checkpoint+'.tmp';fs.writeFileSync(temp,JSON.stringify(data));fs.renameSync(temp,opt.checkpoint);lastSave=Date.now()}
 let saved=null;if(opt.checkpoint&&fs.existsSync(opt.checkpoint))try{saved=JSON.parse(fs.readFileSync(opt.checkpoint))}catch{}
 if(song.events.length===511){const p={cap:15,rows:6,counts:seed,spacing:3,buttonMode:'floor'};candidate(p);seeds.push(p);candidate({...p,spacing:2,buttonMode:'buffered'})}
 if(saved?.version===2){if(!saved.best.kind)seeds.push(saved.best);candidate(saved.best);resumed=true}
 for(const p of opt.seedParams||[]){if(!p.kind)seeds.push(p);candidate(p)}
 if(opt.externalInputs){for(const p of require('./dense-chord-layout.cjs').denseChordSeeds(song,opt,Math.min(deadline,Date.now()+(best?.denseChord?1500:8000))))candidate(p)}
 if(opt.externalInputs){const busDeadline=Math.min(deadline,Date.now()+2000);for(const p of require('./chord-bus-seeds.cjs').chordBusSeeds(song,opt)){if(Date.now()>=busDeadline||opt.stopFile&&fs.existsSync(opt.stopFile))break;candidate(p)}}
 if(opt.externalInputs){for(const p of require('./interleaved-seeds.cjs').interleavedSeeds(song,opt,Math.min(deadline,Date.now()+4000)))candidate(p)}
 if(!best){outer:for(const rows of [6,4,2,8,10,12,1])for(const cap of [15,12,18,10,20,8,6,4,2,1]){candidate({cap,rows,spacing:2,buttonMode:'buffered'});if(best)break outer}}
 if(bestParams&&!bestParams.kind){bestParams={...bestParams,counts:best.rowInfo.map(r=>r.count)};seeds.push(bestParams)}
 recovering=false;save();
 try{
  for(let id=0;id<workers;id++){const {port1,port2}=new MessageChannel();const worker=new Worker(path.join(__dirname,'solver-worker.cjs'),{workerData:{song,opt:{...opt,maxX,maxY,maxZ,workers},id,port:port2,shared:flags.buffer,seeds},transferList:[port2]});worker.on('error',()=>{});jobs.push({worker,port:port1,done:false,id})}
  if(opt.backend==='gpu'){const {port1,port2}=new MessageChannel();const worker=new Worker(path.join(__dirname,'gpu-worker.cjs'),{workerData:{song,opt,port:port2,shared:flags.buffer,seeds},transferList:[port2]});worker.on('error',()=>{});jobs.push({worker,port:port1,done:false,id:'gpu'})}
  if(opt.externalInputs&&Number(opt.maxTracks||1)>=1){const {port1,port2}=new MessageChannel();const worker=new Worker(path.join(__dirname,'parallel-worker.cjs'),{workerData:{song,opt,port:port2,shared:flags.buffer},transferList:[port2]});worker.on('error',()=>{});jobs.push({worker,port:port1,done:false,id:'parallel'})}
  while(true){
   for(const p of hooks.pollCandidates?.()||[])candidate(p);
   for(const job of jobs){for(let packet;packet=receiveMessageOnPort(job.port);){const e=packet.message;if(e.type==='gpu-process'){job.childPid=e.pid;hooks.onGpuProcess?.(e.pid);}else if(e.type==='candidate')candidate(e.params);else if(e.type==='parallel-status')progress({phase:'log',message:e.message});else if(e.type==='geometry'){const gpu=jobs.find(j=>j.id==='gpu');if(gpu&&!gpu.done)gpu.port.postMessage({type:'elite',params:e.params})}else if(e.type==='gpu-status'){gpuState={...gpuState,active:e.active??gpuState.active,initialized:gpuState.initialized||Boolean(e.active),device:e.device||gpuState.device,compatibility:e.compatibility||gpuState.compatibility,error:e.error||gpuState.error};progress({phase:'log',message:e.message})}else if(e.type==='stats'){stats[job.id]=e;if(job.id==='gpu'&&e.attempts>0)gpuState.used=true;}else if(e.type==='finished')job.done=true;else if(e.type==='error')errors.push(e.message)}}
   if(opt.stopFile&&fs.existsSync(opt.stopFile)){reason='user-export';break}
   if(Date.now()>=deadline)break;
   if(jobs.every(j=>j.done)){reason='workers-finished';break}
   if(Date.now()-lastNotify>1000){lastNotify=Date.now();progress({phase:'search',...totals(),valid:improvements,elapsed:(Date.now()-start)/1000,workers,resumed})}
   if(Date.now()-lastSave>10000)save();
   Atomics.wait(flags,0,0,25);
  }
 }finally{Atomics.store(flags,0,1);const end=Date.now()+3000;while(jobs.some(j=>!j.done)&&Date.now()<end){for(const j of jobs){for(let p;p=receiveMessageOnPort(j.port);){const e=p.message;if(e.type==='gpu-process'){j.childPid=e.pid;hooks.onGpuProcess?.(e.pid);}if(e.type==='candidate')candidate(e.params);if(e.type==='stats'){stats[j.id]=e;if(j.id==='gpu'&&e.attempts>0)gpuState.used=true;}if(e.type==='gpu-status'){gpuState={...gpuState,active:e.active??gpuState.active,initialized:gpuState.initialized||Boolean(e.active),device:e.device||gpuState.device,compatibility:e.compatibility||gpuState.compatibility,error:e.error||gpuState.error};progress({phase:'log',message:e.message})}if(e.type==='finished')j.done=true;if(e.type==='error')errors.push(e.message)}}Atomics.wait(flags,0,1,10)}for(const j of jobs){if(!j.done){if(j.childPid)try{process.kill(j.childPid)}catch{}j.worker.terminate();}j.worker.unref();j.port.close()}save()}
 if(!best)throw Error('没有找到通过电路检查且满足尺寸、三维比例和中心试听距离的布局。可增加搜索时间或调整约束；不会放宽条件导出。'+errors.slice(0,2).join('\n'));
 best.search={parallel:stats.parallel||null,tracks:best.inputs?.length||1,backendRequested:requestedBackend,backend:gpuState.used?'cpu+cuda':'cpu',gpuState:{...gpuState,active:false},gpu:stats.gpu||null,gpuProcessIds:jobs.filter(j=>j.childPid).map(j=>j.childPid),maxSpatialAspect:opt.maxSpatialAspect,maxListeningRadius:opt.maxListeningRadius,maxAspect:opt.maxAspect,actualAspect:aspect(best.dimensions),...totals(),improvements,workers,seconds:(Date.now()-start)/1000,baselineVolume:baseline,bestVolume:best.volume,improvementPercent:100*(1-best.volume/baseline),resumed,stopReason:reason,checkpoint:opt.checkpoint||null,workerErrors:errors,optimality:'多模板、时间图拆分、多起点退火及三维装箱搜索得到的最小静态检查通过候选；尚无全局最优证明。'};
 return best;
}
module.exports={search};

