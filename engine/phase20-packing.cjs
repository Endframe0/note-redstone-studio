'use strict';
const {fits}=require('./objective.cjs');

// Slide a component along an axis. Project the forbidden electrical cells
// into columns and mark every conflicting integer offset in one sweep. This
// searches inside the other component's bounding box, not just beside it.
function columns(c,axis){
 const uv=[0,1,2].filter(i=>i!==axis),records=new Map(),forbidden=new Map();
 const put=(map,p,v)=>{const k=p[uv[0]]+','+p[uv[1]];let col=map.get(k);if(!col)map.set(k,col=[]);col.push([p[axis],v]);};
 for(const r of c.records)put(records,r.p,r.type);
 for(const [key,mask]of c.forbidden)put(forbidden,key.split(',').map(Number),mask);
 return{uv,records,forbidden};
}
function forbiddenOffsets(a,b,offset,axis,min,max,shouldStop=()=>false){
 if(shouldStop())return null;
 const out=new Uint8Array(max-min+1),[u,v]=a.uv;let work=0;
 const scan=(records,forbidden,sign)=>{
  for(const [key,col]of records){
   if((++work&255)===0&&shouldStop())return false;
   const xy=key.split(',').map(Number),other=forbidden.get((xy[0]+sign*offset[u])+','+(xy[1]+sign*offset[v]));
   if(!other)continue;
   for(const [p,type]of col)for(const [q,mask]of other)if(type&mask){const d=sign*(q-p);if(d>=min&&d<=max)out[d-min]=1;}
  }
  return true;
 };
 if(!scan(b.records,a.forbidden,1)||!scan(a.records,b.forbidden,-1))return null;
 return out;
}
function dimensions(a,b,offset){return a.bounds.map((v,i)=>Math.max(v[1],b.bounds[i][1]+offset[i])-Math.min(v[0],b.bounds[i][0]+offset[i])+1);}
function alignments(a,b,axis){
 const values=new Set();
 for(const align of [0,.5,1]){
  const base=Math.round(a.bounds[axis][0]+(a.dimensions[axis]-b.dimensions[axis])*align)-b.bounds[axis][0];
  for(const delta of [0,-1,1])values.add(base+delta);
 }
 return [...values];
}
function packingCandidates(a,ac,b,bc,opt={},shouldStop=()=>false){
 const results=new Map();
 for(const axis of [1,0,2]){
  if(shouldStop())break;
  const ca=columns(ac,axis),cb=columns(bc,axis),[u,v]=ca.uv;
  const min=a.bounds[axis][0]-b.bounds[axis][1]-3,max=a.bounds[axis][1]-b.bounds[axis][0]+3;
  for(const x of alignments(a,b,u))for(const z of alignments(a,b,v)){
   if(shouldStop())return [...results.values()].sort((a,b)=>a.volume-b.volume);
   const offset=[0,0,0];offset[u]=x;offset[v]=z;
   const blocked=forbiddenOffsets(ca,cb,offset,axis,min,max,shouldStop);if(!blocked)break;
   for(let d=min;d<=max;d++){
    if(blocked[d-min])continue;offset[axis]=d;
    const size=dimensions(a,b,offset);if(!fits(size,opt))continue;
    const volume=size.reduce((a,b)=>a*b,1),key=offset.join();
    results.set(key,{offset:offset.slice(),dimensions:size,volume,axis});
   }
  }
 }
 return [...results.values()].sort((a,b)=>a.volume-b.volume);
}
module.exports={columns,forbiddenOffsets,packingCandidates,dimensions};
