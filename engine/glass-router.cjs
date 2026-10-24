'use strict';
// Bounded monotone 3D search. The only repeater remains at the receiver, so a
// detour changes geometry, never musical delay. No destructive obstacle edits.
const {state,solid}=require('./electrical.cjs');
const dirs=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]],add=(a,b)=>a.map((v,i)=>v+b[i]);
function findGlassRoute({blocks,notes,source,target,start,end,repeater,tick,maxStates=20000}){
 const map=new Map([...blocks].map(([k,b])=>[k,state(b.block)])),noteTimes=new Map(notes.map(n=>[n.position.join(),n.tick]));
 const air=new Set(notes.map(n=>add(n.position,[0,1,0]).join())),sourceKey=source.join(),repKey=repeater.join(),endKey=end.join();
 const bounds=[0,2].map(i=>[Math.min(source[i],target[i])-6,Math.max(source[i],target[i])+6]);
 function valid(p,path){const key=p.join(),below=add(p,[0,-1,0]),bk=below.join();
  if(p[1]<source[1]||p[1]>target[1]||[0,2].some((axis,i)=>p[axis]<bounds[i][0]||p[axis]>bounds[i][1])||map.has(key)||air.has(key)||air.has(bk))return false;
  const base=map.get(bk);if(base&&base.name!=='glass')return false;
  if(path.some(q=>q.join()===key||q.join()===bk||add(q,[0,-1,0]).join()===key))return false;
  for(const d of dirs){const q=add(p,d),k=q.join(),b=map.get(k);
   if(b&&(b.name==='repeater'&&k!==repKey||solid(b)&&k!==sourceKey&&noteTimes.get(k)!==tick))return false;
   for(const dy of [-1,0,1])if(map.get(add(q,[0,dy,0]).join())?.name==='redstone_wire')return false;
  }
  return true;
 }
 if(!valid(start,[]))return null;
 const heuristic=p=>Math.max(Math.abs(end[0]-p[0])+Math.abs(end[2]-p[2]),end[1]-p[1]);
 const queue=[{p:start,path:[start],score:heuristic(start)}],seen=new Map();let expanded=0;
 while(queue.length&&expanded++<maxStates){queue.sort((a,b)=>b.score-a.score);const cur=queue.pop();if(cur.p.join()===endKey)return{path:[source,...cur.path,repeater,target],expanded,wireCount:cur.path.length};
  if(cur.path.length>=14)continue;
  for(const d of dirs)for(const rise of [0,1]){const p=add(cur.p,[d[0],rise,d[2]]);if(!valid(p,cur.path))continue;
   // An ascending dust edge needs the cell over its lower end clear. Its
   // existing dust must also not be replaced by a new supporting glass block.
   if(rise&&map.has(add(cur.p,[0,1,0]).join()))continue;
   const cost=cur.path.length+1,key=p.join()+'|'+cur.p.join();if((seen.get(key)??Infinity)<=cost)continue;seen.set(key,cost);
   if(cost+heuristic(p)>14)continue;queue.push({p,path:[...cur.path,p],score:cost+heuristic(p)+.01*(Math.abs(p[0]-target[0])+Math.abs(p[2]-target[2]))});
  }
 }
 return null;
}
module.exports={findGlassRoute};
