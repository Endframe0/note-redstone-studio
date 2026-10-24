'use strict';
const {splitSong}=require('./parallel-layout.cjs'),{chainSong,planChain}=require('./chain-layout.cjs'),{fits}=require('./objective.cjs');
// Deterministic compact seed before expensive arbitrary 3D packing. Alternating
// rows offset their note columns by one block so wings occupy alternating gaps.
// Structural reference: omninbs/nbs-fractal Compact layout, c342553f17f6.
// Uses this project's existing chain routing and electrical verifier.
function interleavedSeeds(song,opt,deadline=Infinity){
 const count=Math.ceil(Math.max(...song.events.map(e=>e.notes.length))/3);
 if(!opt.externalInputs||count>Number(opt.maxTracks||1)||count<1)return [];
 const split={count,scheme:'triples'},tracks=splitSong(song,split),prepared=tracks.map(chainSong),seeds=[];
 const capMax=Math.min(32,Math.floor((Math.min(opt.maxX,opt.maxZ)-5)/2));
 for(let cap=4;cap<=capMax;cap++)for(let rows=2;rows<=Math.min(28,Math.floor((Math.max(opt.maxX,opt.maxZ)-4)/2));rows++){
  if(Date.now()>=deadline)return seeds.sort((a,b)=>a.volume-b.volume).slice(0,12).map(s=>s.params);
  try{
   const part={cap,rows,compact:true,interleave:true,layerHeight:4},plans=tracks.map((s,i)=>planChain(s,part,prepared[i]));
   let y=0;const placements=plans.map(p=>{const offset=[-p.bounds[0][0],y-p.bounds[1][0],-p.bounds[2][0]];y+=p.dimensions[1]+1;return{rotation:0,offset}});
   const dimensions=[Math.max(...plans.map(p=>p.dimensions[0])),y-1,Math.max(...plans.map(p=>p.dimensions[2]))];
   if(!fits(dimensions,opt))continue;
   seeds.push({volume:dimensions.reduce((a,b)=>a*b,1),params:{kind:'parallel',template:'chain-interleaved',split,parts:tracks.map(()=>({...part})),placements}});
  }catch{}
 }
 return seeds.sort((a,b)=>a.volume-b.volume).slice(0,12).map(s=>s.params);
}
module.exports={interleavedSeeds};
