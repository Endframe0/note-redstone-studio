const fs=require('fs'),assert=require('node:assert/strict'),path=require('path');
const {catalog}=require('../engine/versions.cjs'),{attach}=require('../engine/extended-noteblock.cjs'),{measure}=require('../engine/parallel-layout.cjs'),{write}=require('../engine/litematic.cjs'),{convert}=require('../engine/cli.cjs');
const {names,bases}=require('../engine/normalize.cjs');
const notes=[],blocks=[];
for(let i=0;i<16;i++)for(let midi=0;midi<128;midi++){
 const p=[midi*3,1,i*3];notes.push({position:p,tick:0,instrument:i,key:midi-21,enbVelocity:63});
 blocks.push({position:p,block:`note_block[instrument=${names[i]},note=12,powered=false]`},{position:[p[0],0,p[2]],block:bases[i]});
}
const dir=path.resolve('tests/version-output'),model=measure({blocks,notes}),results=[];
const input=path.join(dir,'全音域力度20t.nbs');
fs.writeFileSync(input,require('./enb-fixture.cjs').encode(Array.from({length:16},(_,instrument)=>({tick:instrument,layer:0,instrument,key:instrument%2?87:0,velocity:50})),{tempo:20,instrumentCount:16,name:'跨版本全音域力度20t'}));
for(const v of catalog.filter(v=>['port','upstream+compat'].includes(v.enb))){
 const opt={target:v.id,soundEngine:'extended'},m=attach(model,opt),file=path.join(dir,'enb-'+v.id+'.litematic');
 assert.equal(m.extendedNoteBlocks.length,2048);assert.deepEqual(m.dimensions,model.dimensions);
 assert.ok(m.extendedNoteBlocks.every(n=>n.velocity===63));write(file,m,{target:v.id});
 const r=convert({...opt,input,output:dir,objective:'toxic',timeResolution:20},()=>{});
 assert.equal(r.notes,16);assert.equal(r.durationSeconds,.75);assert.equal(r.extendedNoteblock.velocityPreserved,true);
 results.push({target:v.id,file,schematic:r.schematic,midiCount:128,instruments:16,velocity:63,notes:2048});
}
fs.writeFileSync(path.join(dir,'enb-results.json'),JSON.stringify(results,null,2));console.log('PASS ENB profiles:',results.map(r=>r.target).join(', '));
