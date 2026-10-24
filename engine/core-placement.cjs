'use strict';
const {transform}=require('./parallel-layout.cjs');
// Exact occupancy checks on the same electrical exclusion mask. Integer-array
// lookup avoids allocating coordinates and strings at every candidate block.
function placementGrid(bounds,excluded){
 const origin=bounds.map(b=>b[0]),size=bounds.map(([a,b])=>b-a+1),[sx,sy,sz]=size,mask=new Uint8Array(sx*sy*sz);
 for(const key of excluded){const p=key.split(',').map((v,i)=>Number(v)-origin[i]);if(p.every((v,i)=>v>=0&&v<size[i]))mask[p[0]+sx*(p[2]+sz*p[1])]=1}
 return{bounds,origin,size,mask,probes:0};
}
function* corePlacements(core,grid,{limit=16,shouldStop=()=>false}={}){
 const [sx,sy,sz]=grid.size;let delivered=0;
 for(let rotation=0;rotation<4;rotation++){
  const r=transform(core,{rotation}),min=r.bounds.map(b=>b[0]),d=r.dimensions;if(d[0]>sx||d[1]>sy||d[2]>sz)continue;
  const offsets=r.blocks.map(b=>{const p=b.position.map((v,i)=>v-min[i]);return p[0]+sx*(p[2]+sz*p[1])});
  for(let y=sy-d[1];y>=0;y--)for(let z=0;z<=sz-d[2];z++)for(let x=0;x<=sx-d[0];x++){
   if((++grid.probes&255)===0&&shouldStop())return;
   const base=x+sx*(z+sz*y);let blocked=false;for(const offset of offsets)if(grid.mask[base+offset]){blocked=true;break}if(blocked)continue;
   if(shouldStop()||delivered++>=limit)return;
   yield{rotation,offset:[x,y,z].map((v,i)=>v+grid.origin[i]-min[i])};
  }
 }
}
module.exports={placementGrid,corePlacements};
