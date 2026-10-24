'use strict';
const fs=require('node:fs');
const {workerData,receiveMessageOnPort}=require('node:worker_threads');
const {song,opt,lane,port,shared,deadline}=workerData,flags=new Int32Array(shared);
const post=e=>port.postMessage(e),empty={volume:Infinity,dimensions:[0,0,0],blocks:[],inputs:[],notes:[]};
let best=empty,round=0,packing=[],incoming=[],lastPacking=0,gpuFailed=false;
const stopped=()=>Atomics.load(flags,0)!==0||Date.now()>=deadline||fs.existsSync(opt.stopFile);
function drain(){for(let packet;packet=receiveMessageOnPort(port);){const e=packet.message;
 if(e.type==='elite'){if(e.manifest.volume<best.volume||e.manifest.volume===best.volume&&e.manifest.blocks.length<best.blocks.length)best=e.manifest;if(e.manifest.searchParams)incoming.push(e.manifest.searchParams);}
 if(e.type==='packing'){packing.push(e.manifest);if(packing.length>32)packing.sort((a,b)=>a.volume-b.volume).splice(32);}
}}
function publish(m,reuse=null){if(!m||!Number.isFinite(m.volume))return;post({type:'candidate',manifest:m,reuse,lane});if(m.volume<best.volume||m.volume===best.volume&&m.blocks.length<best.blocks.length)best=m;}
function progress(event){drain();post({type:'progress',cycle:round,event:{...event,lane}});}
const budget=cap=>Math.max(.001,Math.min(cap,(deadline-Date.now())/1000));
post({type:'started',lane,time:Date.now()});
try{
 while(!stopped()){
  drain();
  if(lane==='sand-packing'&&!packing.length){Atomics.wait(flags,0,0,25);continue;}
  round++;
  if(lane==='ordinary'){
   // Ordinary solver already performs its own multi-start exploration. Keep
   // its workers, elite pool, counters and GPU process alive for the whole run.
   const m=require('./search.cjs').search(song,{...opt,backend:gpuFailed?'cpu':opt.backend,seconds:Number.isFinite(deadline)?budget(Infinity):0,seedParams:[...(opt.seedParams||[]),...incoming.splice(0)],checkpoint:opt.checkpoint?opt.checkpoint+'.ordinary.json':null},progress,{
    onCandidate:m=>publish(m),
    onPackingCandidate:m=>{if(opt.sandPacking&&Date.now()-lastPacking>75){lastPacking=Date.now();post({type:'packing',manifest:m});}},
    pollCandidates:()=>{drain();return incoming.splice(0);},
    onGpuProcess:pid=>post({type:'gpu-process',pid})
   });if(m.search.gpuState?.error)gpuFailed=true;publish(m);post({type:'stats',lane,round,stats:m.search});break;
  }else if(lane==='snare'){
   const result=require('./snare-split-search.cjs').searchSnareSplit(song,best,{...opt,backend:'cpu',getIncumbent:()=>{drain();return best;},snareSearch:{maxCap:Math.min(64,26+round*4),maxRows:Math.min(64,24+round*4),...opt.snareSearch,seconds:budget(Math.min(180,30*round))},onSnareCandidate:m=>publish(m)},progress);
   publish(result.manifest);post({type:'stats',lane,round,stats:result.stats});
  }else if(lane==='heavy-core'){
   const result=require('./heavy-core-search.cjs').searchHeavyCore(song,best,{...opt,backend:'cpu',getIncumbent:()=>{drain();return best;},heavyCoreSearch:{maxCap:Math.min(96,32+round*4),maxRows:Math.min(96,28+round*4),...opt.heavyCoreSearch,seconds:budget(Math.min(120,30*round))},onHeavyCoreCandidate:m=>publish(m)},progress);
   publish(result.manifest);post({type:'stats',lane,round,stats:result.stats});
  }else if(lane==='reuse'){
   const result=require('./phrase-hybrid-search.cjs').searchPhraseHybrids(song,best,{...opt,backend:'cpu',getIncumbent:()=>{drain();return best;},reuseSearch:{driverShapes:['flat','stack'],maxMotifs:Math.min(64,4+round*4),...opt.reuseSearch,seconds:budget(Math.min(240,60*round))},onReuseCandidate:({manifest,recipe})=>{manifest.audit={pass:false,status:'component-checks-only',scope:manifest.compositionChecks.scope};publish(manifest,{recipe,stats:{runtimeVerified:false}});}},progress);
   if(result.recipe){result.manifest.audit={pass:false,status:'component-checks-only',scope:result.manifest.compositionChecks.scope};publish(result.manifest,{recipe:result.recipe,stats:result.stats});}
   post({type:'stats',lane,round,stats:result.stats});
  }else if(lane==='sand-packing'){
   if(!packing.length){Atomics.wait(flags,0,0,25);continue;}
   const m=packing.shift(),result=require('./sand-layer-packing.cjs').compactSandLayers(song,m,{...opt,shouldStop:stopped},progress);
   if(result!==m)publish(result);post({type:'stats',lane,round,stats:{builds:result.sandPacking?.trials||1}});
  }
  // No-snare and exhausted finite catalogs should not busy spin.
  if(lane!=='ordinary'&&lane!=='sand-packing')Atomics.wait(flags,0,0,100);
 }
}catch(e){post({type:'error',lane,message:e.stack||e.message});}
finally{post({type:'finished',lane});port.close();}
