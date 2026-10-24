'use strict';
const {design}=require('./layout.cjs'),{audit}=require('./electrical.cjs');
// A row-partition seed from the previously played and packet-verified 48×53×19 design.
const seed=[6,11,15,14,14,14,15,15,15,15,15,14,14,13,15,15,15,15,14,15,14,15,15,15,15,15,15,15,15,15,13,15,14,15,15,11];
function search(song,opt={},progress=()=>{}){
 const seconds=Number(opt.seconds??20),maxX=Number(opt.maxX??128),maxZ=Number(opt.maxZ??128),maxY=Number(opt.maxY??128);
 if(![seconds,maxX,maxY,maxZ].every(Number.isFinite)||seconds<1||seconds>300||Math.min(maxX,maxY,maxZ)<4||Math.max(maxX,maxZ)>512||maxY>384)throw Error('搜索时间或尺寸上限无效。');
 const start=Date.now(),deadline=start+seconds*1000;let attempts=0,valid=0,best=null,baseVolume=null,lastNotify=0,rand=0x5eedc0de;
 const random=()=>{rand^=rand<<13;rand^=rand>>>17;rand^=rand<<5;return(rand>>>0)/4294967296};
 const failures={};const top=[];
 function attempt(cap,rows,counts=null){attempts++;try{
  const m=design(song,{cap,rows,counts,support:opt.support||'cobblestone',spacing:3});
  if(m.dimensions[0]>maxX||m.dimensions[1]>maxY||m.dimensions[2]>maxZ)throw Error('尺寸超限');
  if(m.volume>8000000)throw Error('体积超限');
  if(best&&m.volume>=best.volume)return;
  const a=audit(m);if(!a.pass)throw Error(a.errors[0].type);
  valid++;if(baseVolume===null)baseVolume=m.volume;best=m;best.audit=a;
  top.push({cap,rows,counts:m.rowInfo.map(r=>r.count),volume:m.volume,dimensions:m.dimensions});
  progress({phase:'search',attempts,valid,dimensions:[m.dimensions[0],m.dimensions[2],m.dimensions[1]],volume:m.volume,elapsed:(Date.now()-start)/1000});
 }catch(e){failures[e.message]=(failures[e.message]||0)+1}
 if(Date.now()-lastNotify>1000){lastNotify=Date.now();progress({phase:'search',attempts,valid,elapsed:(Date.now()-start)/1000})}}
 if(song.events.length===511)attempt(15,6,seed);
 const caps=[15,12,18,10,20,24,8,28,6,32,36,4,40,3,2,1];
 for(const rows of [6,4,2,8,10,12,1])for(const cap of caps){if(Date.now()>deadline)break;if(3*cap+3<=maxX)attempt(cap,rows)}
 if(!best)for(let cap=5;cap<=Math.min(80,Math.floor((maxX-3)/3),song.events.length);cap++){if(Date.now()>deadline)break;for(const rows of [2,4,6,8])attempt(cap,rows)}
 let stagnation=0;
 while(best&&Date.now()<deadline&&stagnation<2000){const parent=random()<0.75?best:top[Math.floor(random()*top.length)];let counts=parent.counts?parent.counts.slice():parent.rowInfo.map(r=>r.count);if(counts.length<2)break;
  const i=Math.floor(random()*(counts.length-1)),delta=random()<.5?-1:1;counts[i]+=delta;counts[i+1]-=delta;
  if(counts[i]<1||counts[i+1]<1||counts[i]>parent.cap||counts[i+1]>parent.cap){stagnation++;continue}
  let idx=0,good=true;for(const n of counts){idx+=n;if(idx<song.events.length&&song.events[idx].tick-song.events[idx-1].tick<2){good=false;break}}
  if(!good){stagnation++;continue}const old=best.volume;attempt(parent.cap,parent.rows,counts);stagnation=best.volume<old?0:stagnation+1;
 }
 if(!best)throw Error('没有找到满足尺寸和电路检查的布局。可增大尺寸上限，或将速度设为 0.5 倍；密集的连续 0.1 秒起音可能没有足够的折返延迟。详情：'+JSON.stringify(failures));
 best.search={attempts,improvements:valid,seconds:(Date.now()-start)/1000,baselineVolume:baseVolume,bestVolume:best.volume,improvementPercent:100*(1-best.volume/baseVolume),failures,optimality:'在本模板和搜索预算内找到的最小包围盒；不保证全局最优。'};
 return best;
}
module.exports={search};
