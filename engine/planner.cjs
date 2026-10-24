'use strict';
function profile(song,branchMode='delayed'){return song.events.map(e=>({tick:e.tick,notes:e.notes,depth:Math.max(1,(branchMode==='direct'?0:1)+Math.max(Math.ceil(e.notes.length/2),e.notes.filter(n=>n.instrument===3).length)),snare:e.notes.some(n=>n.instrument===3)}))}
function plan(song,{cap=20,rows=2,counts=null,rowShifts=null,spacing=2,buttonMode='wall',branchMode='delayed',origin=[0,2,0]}={},prepared=null){
 const groups=prepared||profile(song,branchMode),n=groups.length,rowInfo=[],firstK=branchMode==='direct'?1:2;
 for(let index=0;index<n;){let count=counts?counts[rowInfo.length]:Math.min(cap,n-index);
  if(!counts)while(index+count<n&&groups[index+count].tick-groups[index+count-1].tick<2)count--;
  if(!Number.isInteger(count)||count<1||count>cap||index+count>n)throw Error('无有效折返点');
  const r=rowInfo.length,layer=Math.floor(r/rows),local=r%rows,spatial=layer%2?rows-1-local:local;
  const shift=rowShifts?.[r]||0;if(!Number.isInteger(shift)||shift<0||shift>cap-count)throw Error('无效行错位');
  rowInfo.push({index,count,layer,local,spatial,dir:r%2?-1:1,offset:layer%2,shift});index+=count;
 }
 if(counts&&counts.length!==rowInfo.length)throw Error('分段总数不符');
 const layers=rowInfo.at(-1).layer+1,table=Array.from({length:layers},()=>Array(rows).fill(null));
 for(const r of rowInfo)table[r.layer][r.spatial]=r;
 const layerZ=[];
 for(let l=0;l<layers;l++){const zs=[0];for(let r=1;r<rows;r++){
  let width=spacing;if(r%2){width=4;const a=table[l][r-1],b=table[l][r];for(let c=0;c<cap;c++){
   const ka=a?(a.dir>0?c-a.shift:cap-1-a.shift-c):-1,kb=b?(b.dir>0?c-b.shift:cap-1-b.shift-c):-1;
   const da=a&&ka>=0&&ka<a.count?groups[a.index+ka].depth:0,db=b&&kb>=0&&kb<b.count?groups[b.index+kb].depth:0;
   width=Math.max(width,da+db+2);
  }}zs[r]=zs[r-1]+width;
 }layerZ.push(zs)}
 const rawSpans=layerZ.map(z=>z.at(-1)),span=Math.max(...rawSpans);for(const z of layerZ)z[rows-1]=span;
 const bounds=[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];const mark=(x,y,z)=>{if(x<bounds[0][0])bounds[0][0]=x;if(x>bounds[0][1])bounds[0][1]=x;if(y<bounds[1][0])bounds[1][0]=y;if(y>bounds[1][1])bounds[1][1]=y;if(z<bounds[2][0])bounds[2][0]=z;if(z>bounds[2][1])bounds[2][1]=z};
 let previous=null,penalty=0;
 for(const r of rowInfo){const y=origin[1]+r.layer*3,z=origin[2]+layerZ[r.layer][r.spatial],branch=r.spatial%2?-1:1,startX=origin[0]+r.offset+(r.dir>0?3*r.shift:3*(cap-1-r.shift));Object.assign(r,{y,z,branch,startX});
  for(let j=0;j<r.count;j++){const g=groups[r.index+j],x=startX+r.dir*3*j,side=r.layer%2?-1:1,sideCount=g.depth-firstK+1;
   mark(x,y,z);mark(x,y+1,z+branch*g.depth);
   if(g.notes.length){mark(x+side,y-1,z+branch*firstK);mark(x+side,y,z+branch*(firstK-1+Math.min(sideCount,g.notes.length)));if(g.notes.length>sideCount){mark(x-side,y-1,z+branch*firstK);mark(x-side,y,z+branch*(firstK-1+g.notes.length-sideCount))}if(g.snare)mark(x+side,y-2,z+branch*firstK)}
   if(previous){const gap=g.tick-previous.tick;if(!j){const outer=previous.dir>0?origin[0]+3*(cap-1)+3:origin[0]-2;mark(outer,previous.y,previous.z);mark(outer,y+1,z);let length=Math.abs(previous.x-outer)+Math.abs(x-outer)+Math.abs(z-previous.z);
     if(r.local===0){mark(outer,y+1,previous.z+(r.spatial===0?-1:1));length+=6}
     const lower=Math.max(1,Math.ceil((length-1)/15),Math.ceil(gap/4));if(gap<lower)penalty+=lower-gap;
   }}previous={x,y:y+1,z,tick:g.tick,dir:r.dir};
  }
 }
 const first=rowInfo[0];if(buttonMode==='external'){mark(first.startX-1,first.y,first.z);mark(first.startX-1,first.y+1,first.z)}else if(buttonMode==='floor'){mark(first.startX,first.y,first.z-2);mark(first.startX,first.y+1,first.z-2)}else if(buttonMode==='buffered'){mark(first.startX-2,first.y,first.z);mark(first.startX-2,first.y+1,first.z-1)}else mark(first.startX-1,first.y,first.z);
 const dimensions=bounds.map(([a,b])=>b-a+1),volume=dimensions.reduce((a,b)=>a*b,1);
 return{groups,rowInfo,layerZ,zlist:layerZ[0],bounds,dimensions,volume,penalty,rawSpans};
}
module.exports={profile,plan};
