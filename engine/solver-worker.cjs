'use strict';
const {workerData,receiveMessageOnPort}=require('node:worker_threads'),{plan,profile}=require('./planner.cjs'),{design}=require('./layout.cjs'),{audit}=require('./electrical.cjs');
const {fits,shapePenalty}=require('./objective.cjs');
const {song,opt,id,port,shared,seeds}=workerData,flags=new Int32Array(shared),groups=profile(song),n=groups.length,profiles={delayed:groups,direct:profile(song,'direct')};
let rng=(0x9e3779b9^(id+1)*0x85ebca6b)>>>0,attempts=0,builds=0,valid=0,restarts=0;
const random=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return(rng>>>0)/4294967296},ri=k=>Math.floor(random()*k);
const legal=Array(n+1).fill(false);legal[0]=legal[n]=true;for(let i=1;i<n;i++)legal[i]=groups[i].tick-groups[i-1].tick>=2;
const maxCap=Math.min(n,Math.floor((opt.maxX-3)/3)),maxRows=Math.min(60,n,Math.floor(opt.maxZ/3)),dpCache=new Map(),seen=new Map(),elite=[];
let ownBest=Infinity;
function partition(cap,start=0,end=n,count=null){
 let dp=dpCache.get(cap);if(!dp){dp=new Int32Array(n+1).fill(1000000);dp[n]=0;for(let i=n-1;i>=0;i--)if(legal[i])for(let j=i+1;j<=Math.min(n,i+cap);j++)if(legal[j])dp[i]=Math.min(dp[i],1+dp[j]);dpCache.set(cap,dp)}
 if(start===0&&end===n&&count===null)count=dp[0]+(random()<.2?ri(3):0);
 if(!Number.isFinite(count)||count>n||count<1||end-start>cap*count||end-start<count)return null;
 if(count>maxRows*Math.ceil(opt.maxY/3))return null;
 const failed=new Set(),stack=[{at:start,left:count}],chosen=[];let operations=0;
 while(stack.length){if((++operations&1023)===0&&Atomics.load(flags,0))return null;const f=stack.at(-1),key=f.at+','+f.left;
  if(f.left===1&&end-f.at<=cap&&end>f.at)return[...chosen,end-f.at];
  if(!f.options){f.options=[];f.index=0;if(!failed.has(key)&&f.left>1)for(let j=Math.max(f.at+1,end-cap*(f.left-1));j<=Math.min(f.at+cap,end-f.left+1);j++)if(legal[j])f.options.push(j);
   for(let i=f.options.length-1;i>0;i--){const j=ri(i+1);[f.options[i],f.options[j]]=[f.options[j],f.options[i]]}}
  if(f.index>=f.options.length){failed.add(key);stack.pop();if(chosen.length)chosen.pop();continue}
  const j=f.options[f.index++];chosen.push(j-f.at);stack.push({at:j,left:f.left-1});
 }return null;
}
function evaluate(params,force=false){
 if(opt.externalInputs)params={...params,buttonMode:'external'};
 if(!params.counts)return null;
 const key=params.cap+':'+params.rows+':'+params.spacing+':'+params.branchMode+':'+params.counts.join(',')+':'+(params.rowShifts||[]).join(',');if(seen.has(key))return seen.get(key);
 attempts++;let result=null;
 try{const p=plan(song,params,profiles[params.branchMode||'delayed']),[x,y,z]=p.dimensions;
  if(!opt.unboundedSize&&(x>opt.maxX||y>opt.maxY||z>opt.maxZ||p.volume>8000000))return null;
  const meanSpan=p.rawSpans.reduce((a,b)=>a+b,0)/p.rawSpans.length,maxSpan=Math.max(1,...p.rawSpans);
  let score=p.volume*shapePenalty(p.dimensions,opt)*(1+.10*p.penalty+.02*meanSpan/maxSpan);
  if(fits(p.dimensions,opt)&&(force||(p.volume<ownBest&&p.volume<=Atomics.load(flags,1)))){builds++;
   try{const m=design(song,{...params,support:opt.support}),a=audit(m);if(!a.pass)throw Error(a.errors[0].type);
    valid++;ownBest=Math.min(ownBest,m.volume);port.postMessage({type:'candidate',params,volume:m.volume,dimensions:m.dimensions,attempts,builds});
   }catch{score*=1.20}
  }
  result={params,score,volume:p.volume};
  if(elite.length<64||score<elite.at(-1).score){if(opt.backend==='gpu'&&(!elite.length||score<elite[0].score))port.postMessage({type:'geometry',params});elite.push(result);elite.sort((a,b)=>a.score-b.score);if(elite.length>64)elite.pop()}
 }catch{}
 if(seen.size>60000)seen.clear();seen.set(key,result);return result;
}
function fresh(){const cap=1+ri(Math.max(1,maxCap)),rows=random()<.03?1:2*(1+ri(Math.max(1,Math.floor(maxRows/2))));return{cap,rows,counts:partition(cap),spacing:2,buttonMode:'buffered',branchMode:random()<.8?'direct':'delayed'}}
function mutate(p){
 const q={...p,counts:p.counts.slice(),rowShifts:p.counts.map((_,i)=>p.rowShifts?.[i]||0)},r=random();
 if(random()<.2){const i=ri(q.counts.length);q.rowShifts[i]=ri(q.cap-q.counts[i]+1);return q}
 if(r<.55&&q.counts.length>1){const i=ri(q.counts.length-1),delta=(1+ri(random()<.7?2:Math.max(2,q.cap-1)))*(random()<.5?1:-1);q.counts[i]+=delta;q.counts[i+1]-=delta;
  if(q.counts[i]<1||q.counts[i+1]<1||q.counts[i]>q.cap||q.counts[i+1]>q.cap)return null;
  const at=q.counts.slice(0,i+1).reduce((a,b)=>a+b,0);if(!legal[at])return null;
 }else if(r<.88&&q.counts.length>1){const first=ri(q.counts.length-1),take=Math.min(q.counts.length-first,2+ri(7)),start=q.counts.slice(0,first).reduce((a,b)=>a+b,0),end=start+q.counts.slice(first,first+take).reduce((a,b)=>a+b,0);
  const count=Math.max(1,take+(random()<.18?(random()<.5?-1:1):0)),part=partition(q.cap,start,end,count);if(!part)return null;q.counts.splice(first,take,...part);
 }else if(r<.96){q.rows=Math.max(2,Math.min(maxRows,q.rows+(random()<.5?-2:2)))}
 else{q.cap=Math.max(1,Math.min(maxCap,q.cap+(random()<.5?-1:1)));q.counts=partition(q.cap);if(!q.counts)return null}
 q.rowShifts=q.counts.map((c,i)=>Math.min(q.rowShifts[i]||0,q.cap-c));return q;
}
try{
 for(const s of seeds||[])for(const branchMode of ['delayed','direct'])evaluate({...s,spacing:2,buttonMode:'buffered',branchMode},true);
 const catalogue=[];for(let cap=1;cap<=maxCap;cap++)for(let rows=2;rows<=maxRows;rows+=2)catalogue.push({cap,rows});
 for(let k=id;k<catalogue.length;k+=opt.workers){if(Atomics.load(flags,0))break;const t=catalogue[k],counts=partition(t.cap);for(const branchMode of ['direct','delayed'])evaluate({...t,counts,spacing:2,buttonMode:'buffered',branchMode});if((k&31)===0)port.postMessage({type:'stats',attempts,builds,valid,restarts,stage:'catalogue'})}
 let current=elite.length?elite[ri(Math.min(16,elite.length))]:null,steps=0,last=Date.now();
 while(!Atomics.load(flags,0)){
  if((steps&255)===0)for(let p;p=receiveMessageOnPort(port);){if(p.message.type==='elite'){const incoming=evaluate(p.message.params);if(incoming&&random()<.5){current=incoming;steps=0}}}
  if(!current||steps>1500){restarts++;steps=0;current=elite.length&&random()<.85?elite[ri(elite.length)]:evaluate(fresh());if(!current)continue}
  const params=random()<.015?fresh():mutate(current.params);steps++;if(!params)continue;
  const next=evaluate(params);if(next){const temperature=(.002+.08*(1-steps/1501))*current.score;if(next.score<current.score||random()<Math.exp((current.score-next.score)/temperature))current=next}
  if(Date.now()-last>2000){last=Date.now();port.postMessage({type:'stats',attempts,builds,valid,restarts,stage:'annealing'})}
 }
 port.postMessage({type:'stats',attempts,builds,valid,restarts,stage:'finished'});
}catch(e){port.postMessage({type:'error',message:e.stack})}finally{port.postMessage({type:'finished'});port.close()}
