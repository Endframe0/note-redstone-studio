'use strict';
// Boundary-heavy NBS fixture shared by the converter and isolated port tests.
const fs=require('node:fs');
function encode(notes,{name='ENB 音域验证',instrumentCount=20,tempo=10,layerVolumes=[]}={}){
 const chunks=[],u8=v=>chunks.push(Buffer.from([v])),u16=v=>{const b=Buffer.alloc(2);b.writeUInt16LE(v);chunks.push(b)},i32=v=>{const b=Buffer.alloc(4);b.writeInt32LE(v);chunks.push(b)},str=v=>{const b=Buffer.from(v);i32(b.length);chunks.push(b)};
 notes=[...notes].sort((a,b)=>a.tick-b.tick||a.layer-b.layer);const layers=Math.max(...notes.map(n=>n.layer))+1;
 u16(0);u8(6);u8(instrumentCount);u16(notes.at(-1).tick);u16(layers);for(const s of [name,'','',''])str(s);u16(Math.round(tempo*100));u8(0);u8(10);u8(4);for(let i=0;i<5;i++)i32(0);str('');u8(0);u8(0);u16(0);
 const groups=new Map();for(const n of notes){if(!groups.has(n.tick))groups.set(n.tick,[]);groups.get(n.tick).push(n)}let tick=-1;
 for(const [t,ns]of groups){u16(t-tick);tick=t;let layer=-1;for(const n of ns){u16(n.layer-layer);layer=n.layer;u8(n.instrument);u8(n.key);u8(n.velocity??100);u8(100);u16(0)}u16(0)}u16(0);
 for(let i=0;i<layers;i++){str('voice '+i);u8(0);u8(layerVolumes[i]??100);u8(100)}u8(0);return Buffer.concat(chunks);
}
const boundaryKeys=[0,8,9,32,33,45,57,58,81,87];
const notes=Array.from({length:20},(_,instrument)=>boundaryKeys.map((key,layer)=>({tick:instrument*4,layer,instrument,key}))).flat();
if(require.main===module){fs.writeFileSync('tests/fixtures/ENB音域验证.nbs',encode(notes));console.log('Created 200-note, 20-instrument, NBS 6 fixture')}
module.exports={encode,notes,boundaryKeys};
