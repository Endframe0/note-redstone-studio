'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {smf,tempo}=require('./midi.cjs');
const {parse}=require('../engine/midi.cjs'),{plan}=require('../engine/adaptive.cjs'),{normalize}=require('../engine/normalize.cjs');
// Simultaneous piano, snare and bass drum. Only the sand-base snare bypasses
// MIDI hold/release; the channel's onset expression still scales its velocity.
const fixture=smf([[tempo(0,500000),[0,144,60,100],[4800,128,60,0]],
 [[0,185,7,127],[0,185,11,64],[0,153,38,100],[0,153,36,100],[4800,137,38,0],[4800,137,36,0]]]);
const raw=parse(fixture),dir=path.resolve('tests/output/midi-snare-natural');fs.mkdirSync(dir,{recursive:true});
const input=path.join(dir,'snare-natural.mid');fs.writeFileSync(input,fixture);
const reports=[];
for(const mode of ['adaptive','custom','none']){
 const opt=plan(raw,{target:'26.1.2',soundEngine:'extended',midiEnvelope:mode,midiFadeInMs:300,midiFadeOutMs:450}).options;
 const song=normalize(raw,opt),snare=song.notes.find(n=>n.instrument===3);
 assert(snare);assert(snare.enbNaturalPercussion);assert.equal(snare.enbSustainTime,undefined);assert.equal(snare.enbVolumePoints,undefined);
 assert.equal(snare.enbVelocity,raw.notes.find(n=>n.instrument===3).midiVelocity);
 assert.equal(song.midiConversion.envelope.naturalSnareNotes,1);
 assert(song.notes.filter(n=>n.instrument!==3).every(n=>n.enbSustainTime>0));
 const r=require('../engine/cli.cjs').convert({...opt,input,output:dir,objective:'toxic'},()=>{});
 const blocks=JSON.parse(fs.readFileSync(path.join(r.folder,'扩展音符盒配置.json'))).blocks;
 const s=blocks.find(n=>n.vanillaInstrument==='snare');
 assert(s.oneShot&&!s.holdUntilRelease);assert.equal(s.sustainTime,0);assert.equal(s.fadeInTime,0);assert.equal(s.fadeOutTime,0);assert(!s.volumePoints);
 assert.equal(s.note,snare.key+21);assert.equal(s.velocity,snare.enbVelocity);
 assert(blocks.filter(n=>n.vanillaInstrument!=='snare').every(n=>!n.oneShot&&n.sustainTime>0));
 reports.push({mode,schematic:r.schematic,blocks});
}
// A one-shot snare cannot crescendo after a silent attack: omit it instead of
// emitting a silent block. The sustained melodic note must still be retained.
const silent=parse(smf([[[0,176,11,0],[0,144,60,100],[240,176,11,127],[480,128,60,0]],
 [[0,185,11,0],[0,153,38,100],[240,185,11,127],[480,137,38,0]]]));
const s=normalize(silent,plan(silent,{target:'26.1.2',soundEngine:'extended',midiEnvelope:'adaptive'}).options);
assert.equal(s.notes.length,1);assert.notEqual(s.notes[0].instrument,3);
fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify({pass:true,reports},null,2));
console.log('PASS natural snare: adaptive/custom/none, natural playback flags, zero duration/fades, no curve, onset velocity/pitch, other instruments unchanged and silent-onset handling');
