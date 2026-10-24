'use strict';
const legacy=require('./midi-instruments.json');
// Project extension of OpenNBS's legacy GM table. Minecraft exposes four
// copper timbres, not a full GM brass sound bank. Weathered/oxidized samples
// sound one octave below harp/trumpet at the same note-block setting.
const copper={
 56:{instrument:16,octave:0,name:'Trumpet'},
 57:{instrument:18,octave:1,name:'Trombone'},
 58:{instrument:19,octave:1,name:'Tuba'},
 59:{instrument:17,octave:0,name:'Muted Trumpet'},
 60:{instrument:17,octave:0,name:'French Horn'},
 61:{instrument:16,octave:0,name:'Brass Section'},
 62:{instrument:16,octave:0,name:'Synth Brass 1'},
 63:{instrument:17,octave:0,name:'Synth Brass 2'}
};
function apply(raw,opt={}){
 if(raw.sourceType!=='midi')return raw;
 const modern=require('./versions.cjs').supports(opt.target,'trumpets');
 const profile=modern?'minecraft26-copper-v1':'opennbs-legacy';
 if(raw.midi.mappingProfile===profile)return raw;
 let count=0;
 const notes=raw.notes.map(n=>{
  if(n.midiDrum||!copper[n.midiProgram])return n;
  count++;const m=modern?copper[n.midiProgram]:legacy.programs[n.midiProgram];
  return {...n,instrument:m.instrument,key:n.midiKey-21+m.octave*12};
 });
 const warnings=(raw.compatibilityWarnings||[]).filter(s=>!s.startsWith('MIDI 铜管映射：'));
 if(count)warnings.push(modern?`MIDI 铜管映射：${count} 个音符使用 26.1+ 的四种铜块音色，按音色基准补偿八度；这是 GM 铜管的近似音色映射。`:`MIDI 铜管映射：目标版本没有铜块小号，${count} 个音符使用 OpenNBS 旧版兼容音色。`);
 return {...raw,notes,compatibilityWarnings:warnings,midi:{...raw.midi,mappingProfile:profile,copperMappedNotes:modern?count:0}};
}
module.exports={apply,copper};
