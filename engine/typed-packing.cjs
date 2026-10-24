'use strict';
const {cells}=require('./parallel-layout.cjs');
// Same type-aware exclusions as compatible(), without allocating a coordinate
// string at every probe. Outside the mask is genuinely unconstrained space.
function packingMask(model){
 const c=cells(model),positions=[...c.forbidden.keys()].map(k=>k.split(',').map(Number));
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of positions)for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
 const size=max.map((v,i)=>v-min[i]+1),[sx,sy,sz]=size;
 const mask=new Uint8Array(sx*sy*sz);
 for(let i=0;i<positions.length;i++){const p=positions[i].map((v,j)=>v-min[j]);mask[p[0]+sx*(p[2]+sz*p[1])]=c.forbidden.get(positions[i].join());}
 const records=c.records.slice().sort((a,b)=>(a.type===2?0:a.type===4?1:a.type===8?2:3)-(b.type===2?0:b.type===4?1:b.type===8?2:3));
 return {min,size,mask,records};
}
function blocked(a,records,offset){
 const [sx,sy,sz]=a.size,ox=offset[0]-a.min[0],oy=offset[1]-a.min[1],oz=offset[2]-a.min[2];
 for(const r of records){const x=r.p[0]+ox,y=r.p[1]+oy,z=r.p[2]+oz;if(x>=0&&x<sx&&y>=0&&y<sy&&z>=0&&z<sz&&(a.mask[x+sx*(z+sz*y)]&r.type))return true;}
 return false;
}
function compatibleMasks(a,b,offset){return !blocked(a,b.records,offset)&&!blocked(b,a.records,offset.map(v=>-v));}
module.exports={packingMask,compatibleMasks};
