'use strict';
const {workerData}=require('node:worker_threads'),{splitSong,transform,merge,cells,compatible,designParallel}=require('./parallel-layout.cjs');
const {designChain,chainSong,planChain}=require('./chain-layout.cjs'),{design}=require('./layout.cjs'),{plan,profile}=require('./planner.cjs'),{audit}=require('./electrical.cjs'),{fits,aspect,shapePenalty}=require('./objective.cjs');
const {song,opt,port,shared}=workerData,flags=new Int32Array(shared);let attempts=0,builds=0,restarts=0,last=0,rng=982451653;
const random=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return(rng>>>0)/4294967296};
const stopped=()=>Atomics.load(flags,0),stats=()=>{if(Date.now()-last>1000){last=Date.now();port.postMessage({type:'stats',attempts,builds,restarts,stage:'parallel-packing'})}};
function options(s,template){
 if(template==='mixed'){
  const found=['chain-interleaved','chain-packed','chain','spiral'].flatMap(t=>options(s,t).map(c=>({...c,params:{...c.params,template:t}}))).sort((a,b)=>a.m.volume-b.m.volume),bins=new Set();
  return found.filter(c=>{const key=c.params.template+':'+Math.round(c.m.dimensions[1]/3)+':'+Math.round(Math.log2(c.m.dimensions[0]/c.m.dimensions[2])*2);if(bins.has(key))return false;bins.add(key);return true}).slice(0,36);
 }
 if(template==='spiral'){
  const found=[],build=require('./path-layout.cjs').designSpiral;
  for(let width=8;width<=Math.min(40,opt.maxX-3);width++)for(let depth=Math.max(8,width-4);depth<=Math.min(40,width+4,opt.maxZ-3);depth+=2)for(const trim of [1,3,5])for(const layerHeight of [3,4]){
   if(stopped())return found;attempts++;try{const params={width,depth,trim,layerHeight,pitch:3},m=build(s,{...params,support:opt.support});builds++;if(m.dimensions[1]>opt.maxY||m.volume>=Atomics.load(flags,1)||!audit(m).pass)continue;found.push({m,params});found.sort((a,b)=>a.m.volume-b.m.volume);if(found.length>80)found.pop()}catch{}stats();
  }
  const bins=new Set();return found.filter(c=>{const key=c.m.dimensions.join();if(bins.has(key))return false;bins.add(key);return true}).slice(0,24);
 }
 const prepared=template.startsWith('chain')?chainSong(s):profile(s,'direct'),catalogue=[];
 for(let cap=2;cap<=Math.min(template.startsWith('chain')?prepared.events.length:prepared.length,Math.floor((Math.max(opt.maxX,opt.maxZ)-5)/(template==='chain-packed'?1:template.startsWith('chain')?2:3)));cap++)for(let rows=1;rows<=Math.min(32,Math.floor(Math.max(opt.maxX,opt.maxZ)/(template==='chain-interleaved'?2:3)));rows++){
  if(stopped())return[];attempts++;try{const params={cap,rows,compact:template==='chain-packed'||template==='chain-interleaved',interleave:template==='chain-interleaved',layerHeight:template==='chain-interleaved'?4:3,spacing:2,branchMode:'direct',buttonMode:'external'},p=template.startsWith('chain')?planChain(s,params,prepared):plan(s,params,prepared);if(p.dimensions[1]>opt.maxY||p.volume>=Atomics.load(flags,1))continue;catalogue.push({params,p})}catch{}stats();
 }
 catalogue.sort((a,b)=>a.p.volume-b.p.volume);const result=[],shapes=new Set();
 for(const c of catalogue){if(stopped())break;const bin=c.p.dimensions[1]+':'+Math.round(Math.log2(c.p.dimensions[0]/c.p.dimensions[2])*2);if(shapes.has(bin))continue;try{builds++;const m=(template.startsWith('chain')?designChain:design)(s,{...c.params,support:opt.support});if(!audit(m).pass)continue;shapes.add(bin);result.push({m,params:{...c.params,counts:m.rowInfo.map(r=>r.count)}});if(result.length>=(opt.maxSpatialAspect?24:10))break}catch{}stats()}
 return result;
}
function offsets(a,b){return [...new Set([0,1,-1,2,-2,Math.floor((a-b)/2),a-b,...Array.from({length:10},(_,i)=>a-1-i),...Array.from({length:10},(_,i)=>-b+i)])]}
function pack(parts){
 const order=parts.map((p,i)=>({i,v:p.m.volume})).sort((a,b)=>b.v-a.v).map(x=>x.i),placements=Array(parts.length),models=[];
 for(const index of order){if(stopped())return null;const raw=parts[index].m;if(!models.length){const rotation=restarts%4,m=transform(raw,{rotation}),offset=m.bounds.map(b=>-b[0]);placements[index]={rotation,offset};models.push(transform(raw,placements[index]));continue}
  const union=merge(models),a=cells(union),candidates=[],maxV=Math.min(8000000,Atomics.load(flags,1)),lastPart=models.length===parts.length-1;
  for(let rotation=0;rotation<4;rotation++){const b=transform(raw,{rotation}),data=cells(b),[bx,by,bz]=b.dimensions;const dxs=offsets(union.dimensions[0],bx),dzs=offsets(union.dimensions[2],bz);
   for(let y=0;y+by<=opt.maxY;y++)for(const x of dxs)for(const z of dzs){const offset=[x-b.bounds[0][0]+union.bounds[0][0],y-b.bounds[1][0]+union.bounds[1][0],z-b.bounds[2][0]+union.bounds[2][0]],bounds=union.bounds.map((v,i)=>[Math.min(v[0],b.bounds[i][0]+offset[i]),Math.max(v[1],b.bounds[i][1]+offset[i])]),dimensions=bounds.map(v=>v[1]-v[0]+1),volume=dimensions.reduce((a,b)=>a*b,1);if(volume>=maxV||dimensions[0]>opt.maxX||dimensions[1]>opt.maxY||dimensions[2]>opt.maxZ||lastPart&&!fits(dimensions,opt))continue;candidates.push({rotation,offset,b,data,volume,score:volume*shapePenalty(dimensions,{...opt,maxAspect:0})})}
  }
  candidates.sort((a,b)=>a.score-b.score);let chosen=null;
  for(const c of candidates){if(stopped())return null;attempts++;stats();if(!compatible(a,c.data,c.offset))continue;try{builds++;const moved=transform(raw,{rotation:c.rotation,offset:c.offset}),combined=merge([...models,moved]);if(!audit(combined).pass)continue;chosen={m:moved,rotation:c.rotation,offset:c.offset};break}catch{}}
  if(!chosen)return null;models.push(chosen.m);placements[index]={rotation:chosen.rotation,offset:chosen.offset};
 }
 return{m:merge(models),placements};
}
try{
 const maxChord=Math.max(...song.events.map(e=>e.notes.length)),maxTracks=Math.min(8,Number(opt.maxTracks??4)),tasks=[];
 for(let count=2;count<=maxTracks;count++){tasks.push({template:'direct',split:{count,scheme:'round-robin'}});if(Math.ceil(maxChord/count)<=3)tasks.unshift({template:'chain',split:{count,scheme:'voices'}})}
 const triples=Math.ceil(maxChord/3);if(triples<=maxTracks)tasks.unshift({template:'chain',split:{count:Math.max(1,triples),scheme:'triples'}});
 if(maxChord<=3)tasks.unshift({template:'chain',split:{count:1,scheme:'triples'}});
 for(const t of [...tasks])if(t.template==='chain'){tasks.unshift({...t,template:'chain-packed'});tasks.unshift({...t,template:'spiral'});tasks.unshift({...t,template:'mixed'});tasks.unshift({...t,template:'chain-interleaved'})}
 const priority=t=>t==='chain-interleaved'?0:t==='mixed'?1:t==='spiral'?2:t.startsWith('chain')?3:4;
 tasks.sort((a,b)=>priority(a.template)-priority(b.template)||a.split.count-b.split.count||(a.split.scheme==='triples'?0:1)-(b.split.scheme==='triples'?0:1));
 const cache=new Map();
 while(tasks.length&&!stopped()){
  const task=tasks[Math.floor(restarts/6)%tasks.length],tracks=splitSong(song,task.split),key=JSON.stringify(task);let alternatives=cache.get(key);
  if(!alternatives){alternatives=tracks.map(s=>options(s,task.template));cache.set(key,alternatives)}
  if(alternatives.every(a=>a.length)){
   const parts=alternatives.map(a=>a[restarts%6===0?0:Math.floor(random()*Math.min(a.length,restarts%6===5?24:10))]),result=pack(parts);
   if(result&&fits(result.m.dimensions,opt)&&result.m.volume<Atomics.load(flags,1)){
    const params={kind:'parallel',...task,parts:parts.map(p=>p.params),placements:result.placements};
    try{const m=designParallel(song,params,opt.support);port.postMessage({type:'candidate',params,volume:m.volume});port.postMessage({type:'parallel-status',message:`并行 ${tracks.length} 路 / ${task.template==='mixed'?'混合模板':task.template==='spiral'?'自由路径内旋':task.template.startsWith('chain')?'音符盒传能链':'分支模板'}：${m.dimensions[0]} × ${m.dimensions[2]} × ${m.dimensions[1]}`})}catch{}
   }
  }restarts++;stats();
 }
}catch(e){port.postMessage({type:'error',message:e.stack})}finally{port.postMessage({type:'stats',attempts,builds,restarts});port.postMessage({type:'finished'});port.close()}
