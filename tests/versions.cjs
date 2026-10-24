const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {catalog,get}=require('../engine/versions.cjs'),{write}=require('../engine/litematic.cjs');
const {designToxic,addControl}=require('../engine/toxic-layout.cjs'),{designHopperTimer}=require('../engine/hopper-timer.cjs');
const {normalize}=require('../engine/normalize.cjs'),{convert}=require('../engine/cli.cjs');
fs.mkdirSync('tests/fixtures',{recursive:true});fs.writeFileSync('tests/fixtures/auto-5t.nbs',require('./enb-fixture.cjs').encode([0,1,2,3].map(tick=>({tick,layer:0,instrument:0,key:45,velocity:100})),{tempo:5,instrumentCount:16,name:'synthetic-regression'}));
const dir=path.resolve('tests/version-output');fs.mkdirSync(dir,{recursive:true});
const raw={tempo:20,instrumentCount:16,layers:[{volume:100}],notes:[0,1,2,3].map((tick,i)=>({tick,layer:0,instrument:i,key:45,pitch:0,velocity:100}))};
const out=[];
for(const v of catalog){
 for(const timeResolution of [10,20]){
  const s=normalize({...raw,tempo:timeResolution},{target:v.id,timeResolution}),body=designToxic(s,{target:v.id,timeResolution});
  const m=addControl(body,'ver_test'),file=path.join(dir,v.id+'-'+timeResolution+'.litematic');
  const format=write(file,m,{target:v.id});assert.equal(format.dataVersion,v.dataVersion);assert.equal(m.notes.length,4);
  out.push({file,target:v.id,dataVersion:v.dataVersion,format:v.format,notes:4,commands:m.commandBlocks.length});
 }
 const file=path.join(dir,v.id+'-hopper.litematic');write(file,designHopperTimer(),{target:v.id});out.push({file,target:v.id,dataVersion:v.dataVersion,format:v.format,components:v.components,hopper:true});
 if(!v.heavyCore)assert.equal(v.reuse,false);
 assert.equal(normalize(raw,{target:v.id,timeResolution:20}).notes.length,4);
}
assert.throws(()=>get('1.19.4'),/不支持/);
const copper={...raw,instrumentCount:20,notes:[{...raw.notes[0],instrument:16}]};
assert.throws(()=>normalize(copper,{target:'1.21.11'}),/铜管/);assert.equal(normalize(copper,{target:'26.1'}).notes[0].instrument,16);
for(const target of ['1.20','1.20.5','1.21.1','26.3']){
 const r=convert({input:'tests/fixtures/auto-5t.nbs',output:dir,target,seconds:2,workers:2,maxAspect:0,maxSpatialAspect:0,maxListeningRadius:0,autoStartWiring:true},()=>{});
 assert.equal(r.notes,4);assert.equal(r.format.dataVersion,get(target).dataVersion);assert.ok(r.audit.pass);out.push({file:r.schematic,target,dataVersion:get(target).dataVersion,format:get(target).format,notes:4});
}
fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(out,null,2));console.log('PASS',catalog.length,'versions; 10t/20t, hopper formats, four real layout searches.');
