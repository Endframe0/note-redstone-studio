'use strict';
const {designScheduledRepeat}=require('./scheduled-repeat.cjs'),{transform,measure}=require('./parallel-layout.cjs');
function designScheduledBank(specs){
 if(!Array.isArray(specs)||!specs.length)throw Error('Empty scheduled bank');
 const parts=[];let level=0;
 for(const spec of specs){const m=designScheduledRepeat(spec);parts.push(transform(m,{offset:[0,level,0]}));level+=4}
 const m=measure({blocks:parts.flatMap(p=>p.blocks),notes:parts.flatMap(p=>p.notes),inputs:parts.flatMap(p=>p.inputs),containers:parts.flatMap(p=>p.containers),connections:[],groups:[],clockSolids:[],rowInfo:[],template:'scheduled-rhythm-bank',branchMode:'scheduled-rhythm-bank-experimental',hopperTimer:{experimental:true},specs:structuredClone(specs),safeRestartAfterTicks:Math.max(...parts.map(p=>p.loop.safeRestartAfterTicks))});
 const positions=new Set(m.blocks.map(b=>b.position.join()));if(positions.size!==m.blocks.length)throw Error('Scheduled bank overlap');
 for(const n of m.notes)if(positions.has([n.position[0],n.position[1]+1,n.position[2]].join()))throw Error('Covered scheduled speaker');return m;
}
module.exports={designScheduledBank};
