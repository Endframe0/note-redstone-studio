'use strict';
const {toneKey,eventKey}=require('./note-volume.cjs');
const {designChordBus}=require('./chord-bus-layout.cjs'),{decomposePhraseReuse,routeRepeaters}=require('./adaptive-phrase-reuse.cjs'),{glassWireRoute,exclusion}=require('./adaptive-scheduled-repeat.cjs'),{transform,measure}=require('./parallel-layout.cjs'),{auditSignals}=require('./signal-audit.cjs');
const add=(p,d)=>p.map((v,i)=>v+d[i]),key=p=>p.join(),signature=ns=>ns.map(eventKey).sort().join(';');
// Reconstruct a source-bound composition recipe. This is a component-level
// structural verifier, not a replacement for whole-song vanilla playback.
// No stored blocks, containers, success flags or timing claims are trusted.
function designPhraseHybrid(song,recipe,{support='cobblestone'}={}){
 const {pattern,calls,busParams,parameters={},coreRotation=0,coreOffset,driverRotation=0,driverOffset,maxRouteCells=64}=recipe;
 for(const r of [coreRotation,driverRotation])if(!Number.isInteger(r)||r<0||r>3)throw Error('Invalid component rotation');
 for(const p of [coreOffset,driverOffset])if(!Array.isArray(p)||p.length!==3||!p.every(Number.isInteger))throw Error('Invalid component position');
 if(!Array.isArray(pattern)||!pattern.length||!Array.isArray(calls)||!Number.isInteger(maxRouteCells)||maxRouteCells<15||maxRouteCells>96)throw Error('Invalid phrase recipe');
 if(parameters.routeTicks!==undefined)throw Error('Route compensation is derived from the actual route, not a recipe parameter');
 const remaining=[...song.notes];
 for(const t of calls)for(const n of pattern){const index=remaining.findIndex(s=>s.tick===t+n.tick&&toneKey(s)===toneKey(n));if(index<0)throw Error('Phrase recipe does not match NBS events');remaining.splice(index,1)}
 if(!remaining.length)throw Error('Whole-song single phrase needs the standalone composer');
 const bus=recipe.residualRecipe?require('./snare-split-layout.cjs').designSnareSplit({notes:remaining},recipe.residualRecipe):designChordBus({notes:remaining},busParams),busAudit=auditSignals(bus);if(!busAudit.pass)throw Error('Residual bus failed finite audit');
 let parts=decomposePhraseReuse(pattern,calls,parameters);
 const finiteCore={...parts.phrase,notes:parts.phrase.notes.slice(0,pattern.length).map(n=>({...n,tick:n.tick-calls[0]+(parameters.template==='planar'?1:0)}))},coreAudit=auditSignals(finiteCore);if(!coreAudit.pass)throw Error('Shared phrase failed finite audit');
 const core=transform(parts.phrase,{rotation:coreRotation,offset:coreOffset});let driver=transform(parts.driver,{rotation:driverRotation,offset:driverOffset});
 const bounds=recipe.bounds||bus.bounds;if(bounds.length!==3||bounds.some(b=>b.length!==2||!b.every(Number.isInteger)||b[0]>b[1]))throw Error('Invalid composition bounds');
 const checkInside=m=>m.blocks.every(b=>b.position.every((v,i)=>v>=bounds[i][0]&&v<=bounds[i][1]));if(![bus,core,driver].every(checkInside))throw Error('Component outside allocated volume');
 const blockedCore=exclusion(bus.blocks,bus.inputs,'electrical'),blockedDriver=exclusion([...bus.blocks,...core.blocks],bus.inputs,'electrical');
 if(core.blocks.some(b=>blockedCore.has(key(b.position)))||[...driver.blocks.map(b=>b.position),...driver.inputs.map(i=>i.wire)].some(p=>blockedDriver.has(key(p))))throw Error('Unsafe component separation');
 const out=driver.outputs[0],target=core.inputs[0],path=glassWireRoute([...bus.blocks,...core.blocks,...driver.blocks,...[...bus.inputs,...driver.inputs].map(i=>({position:i.wire,block:'redstone_block'}))],out.position,target.wire,add(out.position,out.direction.map(v=>-v)),target.repeater,bounds,{maxCells:maxRouteCells,maxStates:maxRouteCells>15?15000:2500});
 if(!path)throw Error('No internal trigger route');const relays=routeRepeaters(path);if(!relays||relays.length>8)throw Error('Cannot amplify route safely');
 if(relays.length){parts=decomposePhraseReuse(pattern,calls,{...parameters,routeTicks:relays.length});driver=transform(parts.driver,{rotation:driverRotation,offset:driverOffset})}
 const wires=path.flatMap((p,i)=>{let block='redstone_wire';if(relays.includes(i)){const q=path[i+1],face=q[0]>p[0]?'west':q[0]<p[0]?'east':q[2]>p[2]?'north':'south';block=`repeater[facing=${face},delay=1,powered=false,locked=false]`}return[{position:p,block},{position:add(p,[0,-1,0]),block:'glass'}]});
 const m=measure({blocks:[...bus.blocks,...core.blocks,...driver.blocks,...wires],notes:[...bus.notes,...core.notes],inputs:[...bus.inputs,...driver.inputs],containers:driver.containers,groups:[],connections:[],clockSolids:[],rowInfo:[],hybridNetwork:true,hopperTimer:{experimental:true},branchMode:'adaptive-phrase-hybrid-experimental',template:'adaptive-phrase-hybrid',busParams:bus.busParams,phraseReuse:{calls,physicalNotes:pattern.length,sourceNotes:core.notes.length,parameters:parts.parameters,coreRotation,coreOffset,driverRotation,driverOffset,path,routeRepeaters:relays,maxRouteCells,serialSchedule:driver.serialSchedule},safeRestartAfterTicks:driver.safeRestartAfterTicks});
 const occupied=new Set(m.blocks.map(b=>key(b.position)));if(occupied.size!==m.blocks.length)throw Error('Composition block collision');for(const n of m.notes)if(occupied.has(key(add(n.position,[0,1,0]))))throw Error('Composition covers a note');
 if(signature(m.notes)!==signature(song.notes))throw Error('Composition changed the song');
 m.compositionChecks={sourceEvents:true,finiteResidualAudit:busAudit,finitePhraseAudit:coreAudit,isolatedComponents:true,compensatedRouteTicks:relays.length,runtimeVerified:false,scope:'分部有限上升沿检查、原曲事件重数、部件隔离、线路增幅和计时补偿；不模拟完整漏斗复位或下沿，逐曲实机验证另行记录。'};
 if(recipe.residualRecipe)m.residualRecipe=recipe.residualRecipe;
 return require('./support-materials.cjs').replaceCanonicalSupports(m,support);
}
module.exports={designPhraseHybrid};
