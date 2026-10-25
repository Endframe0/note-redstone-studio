'use strict';
// Choose one octave per source part before folding exceptional notes, keeping
// melodic intervals intact whenever a part fits the vanilla two-octave range.
function less(a,b){for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]<b[i];return false;}
function fit(source,opt={}){
 if(source.sourceType!=='midi'||opt.pitch!=='smart'||(opt.soundEngine&&opt.soundEngine!=='vanilla'))return {source,report:null};
 const low=33,high=57,transpose=Number(opt.transpose??0),groups=new Map();
 const audible=n=>n.velocity!==0&&source.layers[n.layer]?.volume!==0;
 for(const n of source.notes){
  if(n.midiDrum||!audible(n))continue;
  const id=[n.layer,n.midiChannel,n.midiProgram,n.instrument].join(':');
  if(!groups.has(id))groups.set(id,[]);groups.get(id).push(n);
 }
 const shifts=new Map(),parts=[];
 for(const [id,notes] of groups){
  let best=null;
  for(let octave=-12;octave<=12;octave++){
   const shift=octave*12;let outside=0,distance=0;
   for(const n of notes){const k=n.key+(n.pitch??0)/100+transpose+shift,d=Math.max(low-k,0,k-high);if(d>0)outside++;distance+=d*d;}
   const score=[outside,distance,Math.abs(shift),shift];
   if(!best||less(score,best.score))best={score,shift};
  }
  shifts.set(id,best.shift);
  parts.push({layer:notes[0].layer,channel:notes[0].midiChannel,program:notes[0].midiProgram,instrument:notes[0].instrument,notes:notes.length,semitones:best.shift,remainingOutside:best.score[0]});
 }
 let originallyOutside=0,shifted=0,residual=0,changed=0;
 const notes=source.notes.map(n=>{
  if(!audible(n))return n;
  const original=n.key+(n.pitch??0)/100+transpose;
  const shift=n.midiDrum?0:shifts.get([n.layer,n.midiChannel,n.midiProgram,n.instrument].join(':'))??0;
  const k=n.key+shift;let final=Math.round(k+(n.pitch??0)/100+transpose);
  if(original<low||original>high)originallyOutside++;
  if(shift)shifted++;
  if(final<low||final>high){residual++;while(final<low)final+=12;while(final>high)final-=12;}
  if(final!==original)changed++;
  return shift?{...n,key:k,vanillaOriginalKey:n.key,vanillaOctaveShift:shift}:n;
 });
 return {source:{...source,notes},report:{mode:'per-part-octave',low,high,originallyOutside,shiftedTracks:parts.filter(p=>p.semitones).length,octaveShiftedNotes:shifted,residualFoldedNotes:residual,pitchAdjustedNotes:changed,parts,pitchClassesPreserved:true}};
}
module.exports={fit};
