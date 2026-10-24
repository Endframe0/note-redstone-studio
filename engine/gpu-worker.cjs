'use strict';
const {workerData}=require('node:worker_threads'),{spawn}=require('node:child_process'),path=require('node:path'),readline=require('node:readline');
const {plan}=require('./planner.cjs'),{design}=require('./layout.cjs'),{audit}=require('./electrical.cjs'),{fits}=require('./objective.cjs');
const {song,opt,port,shared,seeds}=workerData,flags=new Int32Array(shared);
let proc,timer,checks=0,finished=false,closing=false,mismatches=0;const examined=new Set();
function finish(){if(finished)return;finished=true;clearInterval(timer);port.postMessage({type:'finished'});port.close()}
// A completed GPU stage means its process has actually closed, not merely
// that a kill request was sent. CPU template stages start after this barrier.
function end(){if(closing||finished)return;closing=true;clearInterval(timer);if(proc?.pid&&proc.exitCode===null){if(!proc.killed)proc.kill()}else finish()}
try{
 const command=opt.gpuCommand;if(!Array.isArray(command)||!command.length)throw Error('GPU 辅助程序未配置；请从桌面程序选择 GPU 模式。');
 proc=spawn(command[0],command.slice(1),{windowsHide:true,stdio:['pipe','pipe','pipe']});
 if(proc.pid)port.postMessage({type:'gpu-process',pid:proc.pid});
 const send=o=>{if(proc.stdin.writable)proc.stdin.write(JSON.stringify(o)+'\n')};
 proc.stdin.on('error',()=>{});proc.on('error',e=>{port.postMessage({type:'gpu-status',active:false,error:e.message,message:'GPU 启动失败，继续 CPU：'+e.message});end()});
 proc.on('close',code=>{if(!closing&&!Atomics.load(flags,0))port.postMessage({type:'gpu-status',active:false,error:stderr||`GPU 进程退出 (${code})`,message:`GPU 进程退出 (${code})，CPU 搜索继续。`});finish()});
 let stderr='';proc.stderr.on('data',b=>{stderr=(stderr+b).slice(-2000)});
 readline.createInterface({input:proc.stdout}).on('line',line=>{try{const e=JSON.parse(line);
  if(e.type==='candidate'){
   if(Atomics.load(flags,0)||!fits(e.dimensions,opt)||e.volume>=Atomics.load(flags,1))return;
   const key=JSON.stringify(e.params);if(examined.has(key))return;if(examined.size>20000)examined.clear();examined.add(key);
   const p=plan(song,e.params);if(p.volume!==e.volume||p.dimensions.some((v,i)=>v!==e.dimensions[i])||p.penalty!==e.penalty){mismatches++;throw Error('GPU / CPU 几何计算不一致，候选已拒绝')}
   checks++;try{const m=design(song,{...e.params,support:opt.support});if(audit(m).pass)port.postMessage({type:'candidate',params:e.params})}catch{}
  }else if(e.type==='stats')port.postMessage({...e,builds:checks,restarts:e.batches,mismatches});
  else {port.postMessage({type:'gpu-status',active:e.type==='ready',device:e.device,compatibility:e.type==='ready'?{computeCapability:e.computeCapability,nvrtc:e.nvrtc,driverCudaVersion:e.driverCudaVersion,ptxTarget:e.ptxTarget}:undefined,error:e.type==='error'?e.message:undefined,message:e.message||JSON.stringify(e)});if(e.type==='error')end();}
 }catch(e){port.postMessage({type:'gpu-status',active:false,error:e.message,message:e.message});end()}});
 send({type:'init',song,opt,seeds});port.on('message',e=>{if(e.type==='elite')send(e)});
 timer=setInterval(()=>{if(Atomics.load(flags,0))end()},100);
}catch(e){port.postMessage({type:'gpu-status',active:false,error:e.message,message:'GPU 不可用，继续 CPU：'+e.message});end()}
