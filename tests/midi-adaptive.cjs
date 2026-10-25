'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {smf,tempo}=require('./midi.cjs');
const {parse}=require('../engine/midi.cjs'),{plan}=require('../engine/adaptive.cjs'),{normalize}=require('../engine/normalize.cjs');
const file=smf([[tempo(0,500000),[0,192,71],[0,176,11,0],[0,176,72,96],[0,176,64,127],
 [0,144,60,100],[240,176,11,127],[480,128,60,80],[720,176,64,0],
 [960,176,121,0],[960,144,60,100],[1440,128,60,64]]]);
const raw=parse(file),opt={adaptive:true,target:'26.1.2',soundEngine:'extended',midiEnvelope:'adaptive'};
const p=plan(raw,opt),song=normalize(raw,p.options),[a,b]=song.notes;
assert.equal(song.notes.length,2,'notes initially silent under expression may crescendo');
assert.equal(raw.notes[0].midiKeyOffTick,480);assert.equal(raw.notes[0].midiEndTick,720);
assert.equal(raw.notes[0].midiReleaseVelocity,80);
assert.equal(a.enbVolumePoints[0].v,0);assert(a.enbVolumePoints.some(p=>p.v>.5));
assert(a.midiEnvelopeInfo.releaseTicks>b.midiEnvelopeInfo.releaseTicks,'CC72 changes independent release');
assert(a.enbSustainTime-a.midiEnvelopeInfo.gateTicks>b.enbSustainTime-b.midiEnvelopeInfo.gateTicks,'CC72 still changes the audible release duration');
assert.equal(a.midiEnvelopeInfo.releaseSource,'CC72-relative-to-instrument');
assert.equal(b.midiEnvelopeInfo.releaseSource,'instrument-estimate','reset clears release override');
assert(a.enbSustainTime>a.midiEnvelopeInfo.gateTicks,'tail extends past pedal-up');
assert.equal(a.enbVelocity,100,'controller curve must not multiply the onset gain twice');
const manual=normalize(raw,{...p.options,midiEnvelope:'custom'});assert.equal(manual.notes.length,1,'legacy onset-only volume behavior retained');
assert.equal(manual.notes[0].tick,b.tick,'adaptive release never shifts later onsets');
const key=require('../engine/note-volume.cjs').toneKey;
assert.notEqual(key(a),key({...a,enbVolumePoints:[{t:0,v:.5},{t:1,v:0}]}),'reuse includes volume curve');
for(const n of song.notes){assert(n.enbVolumePoints.every((p,i,all)=>p.v>=0&&p.v<=1&&p.t>=0&&p.t<=1&&(!i||p.t>all[i-1].t)));assert.equal(n.enbVolumePoints.at(-1).t,1);}
const dir=path.resolve('tests/output/midi-adaptive');fs.mkdirSync(dir,{recursive:true});const input=path.join(dir,'controller-fixture.mid');fs.writeFileSync(input,file);
const report=require('../engine/cli.cjs').convert({...p.options,adaptive:false,objective:'toxic',input,output:dir},()=>{});
const blocks=JSON.parse(fs.readFileSync(path.join(report.folder,'扩展音符盒配置.json'))).blocks;
assert.equal(blocks.length,2);assert(blocks.every(n=>n.volumePoints.length>1));
fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify({pass:true,schematic:report.schematic,blocks},null,2));
console.log('PASS adaptive MIDI: controllers, pedal release, onset silence, individual curves, reset, reuse identity and schematic export');
