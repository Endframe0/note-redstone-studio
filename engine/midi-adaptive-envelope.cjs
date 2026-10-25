'use strict';
const {mapExact}=require('./midi-timing.cjs');
// Deliberate musical approximations, not a claim to recover the source synth's ADSR.
function profile(n){
 const p=n.midiProgram??0;
 if(n.midiDrum)return {name:'percussion',attack:0,decay:.18,level:0,release:.06};
 if(p<8)return {name:'piano',attack:0,decay:1.4,level:.08,release:.22};
 if(p<16)return {name:'mallet',attack:0,decay:1.1,level:.04,release:.28};
 if(p<24)return {name:'organ-reed',attack:.015,decay:.2,level:1,release:.10};
 if(p<32||p>=104&&p<112)return {name:'plucked',attack:0,decay:.65,level:.06,release:.14};
 if(p<40)return {name:'bass',attack:.01,decay:.5,level:.28,release:.12};
 if(p<56)return {name:'strings-choir',attack:.10,decay:.3,level:.85,release:.32};
 if(p<80)return {name:'wind',attack:.025,decay:.2,level:.92,release:.16};
 if(p<88)return {name:'lead',attack:.015,decay:.3,level:.8,release:.16};
 if(p<104)return {name:'pad',attack:.20,decay:.5,level:.85,release:.45};
 return {name:'percussive-effect',attack:0,decay:.45,level:.05,release:.18};
}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const scale=v=>2**((v-64)/32);
const QUIET_THRESHOLD=.11,QUIET_FADE_TICKS=5;
// Finish only the last falling tail. An attack or a later controller crescendo
// must remain audible, even when it passes through the same low gain range.
function finishQuietTail(points,attack=0){
 let lastRise=attack;
 for(let i=1;i<points.length;i++)if(points[i].v>points[i-1].v+.000001)lastRise=Math.max(lastRise,i);
 const start=points.findIndex((p,i)=>i>lastRise&&p.v>0&&p.v<QUIET_THRESHOLD&&p.v<points[i-1].v);
 if(start<0)return {points,info:null};
 const end=Math.min(points.length-1,start+QUIET_FADE_TICKS),out=points.slice(0,end+1).map(p=>({...p}));
 for(let i=start;i<=end;i++){
  const u=(i-start)/(end-start),smooth=1-u*u*(3-2*u);
  out[i].v=+(out[i].v*smooth).toFixed(6);
 }
 return {points:out,info:{threshold:QUIET_THRESHOLD,fadeTicks:end-start,startTick:start,endTick:end,originalDurationTicks:points.length}};
}
function lowerBound(lane,order){let lo=0,hi=lane.length;while(lo<hi){const m=(lo+hi)>>1;if(lane[m].order<=order)lo=m+1;else hi=m;}return lo;}
function adaptive(n,startRedstoneTick,plan,source){
 const preset=profile(n),start=startRedstoneTick*2;
 const gate=Math.max(1,Math.round(mapExact(n.midiEndTick,plan)*20/plan.resolution)-start);
 const lane=source.midi.controlLanes?.[n.midiChannel]||[],first=lowerBound(lane,n.midiOrder??-1);
 const initial={7:100,11:127,...n.midiCC},atRelease={...initial};
 const apply=(cc,e)=>{if(e.cc===121){const volume=cc[7];for(const k of Object.keys(cc))delete cc[k];cc[7]=volume;cc[11]=127;}else cc[e.cc]=e.value;};
 for(let i=first;i<lane.length&&lane[i].tick<=n.midiEndTick;i++)apply(atRelease,lane[i]);
 const release=Math.max(1,Math.round(clamp(preset.release*scale(atRelease[72]??64),.05,2)*20));
 const attackSeconds=preset.attack*scale(initial[73]??64)+Math.max(0,(initial[73]??64)-64)/63*.25;
 const attack=Math.min(Math.max(0,gate-1),Math.round(clamp(attackSeconds,0,2)*20));
 const decay=Math.max(1,preset.decay*scale(initial[75]??64)*20);
 const total=gate+release,breath=!n.midiDrum&&((n.midiProgram>=56&&n.midiProgram<80)||(n.midiProgram>=20&&n.midiProgram<24));
 const cc={...initial},used=new Set(Object.keys(n.midiCC||{}).filter(k=>[2,7,11,72,73,75].includes(+k)).map(Number));
 // Controllers are channel-scoped in MIDI. Each active note receives its own slice.
 const changes=[];
 for(let i=first;i<lane.length;i++){
  const e=lane[i],age=Math.round(mapExact(e.tick,plan)*20/plan.resolution)-start;
  if(age>=total)break;
  if(age>=0)changes.push({...e,age});
 }
 const held=age=>{
  const attackGain=attack?Math.min(1,age/attack):1;
  const decayGain=preset.level+(1-preset.level)*Math.exp(-3*Math.max(0,age-attack)/decay);
  return attackGain*decayGain;
 };
 let cursor=0;let points=[];
 for(let age=0;age<total;age++){
  while(cursor<changes.length&&changes[cursor].age<=age){const e=changes[cursor++];apply(cc,e);if(e.cc!==121)used.add(e.cc);}
  const channel=(cc[7]??100)/127*(cc[11]??127)/127*(breath?(cc[2]??127)/127:1);
  // Release begins at Note Off / pedal-up; the following notes retain their onsets.
  const env=age===total-1?0:age<gate?held(age):held(gate)*(1-(age-gate)/Math.max(1,release-1))**2;
  const v=+clamp(channel*env,0,1).toFixed(6);
  points.push({t:age/Math.max(1,total-1),v});
 }
 const quiet=finishQuietTail(points,attack);points=quiet.points;
 const duration=points.length;
 points.forEach((p,i)=>{p.t=i/Math.max(1,duration-1);});
 // Sparse piecewise-linear curve; error is bounded in absolute gain units.
 const anchors=[0,...(quiet.info?[quiet.info.startTick]:[]),points.length-1];
 const keep=new Set(anchors),stack=anchors.slice(1).map((b,i)=>[anchors[i],b]);
 while(stack.length){const [a,b]=stack.pop();let error=.001,index=-1;for(let i=a+1;i<b;i++){const expected=points[a].v+(points[b].v-points[a].v)*(i-a)/(b-a),d=Math.abs(points[i].v-expected);if(d>error){error=d;index=i;}}if(index>=0){keep.add(index);stack.push([a,index],[index,b]);}}
 const curve=[...keep].sort((a,b)=>a-b).map(i=>points[i]);
 return {enbVelocity:n.midiRawVelocity??n.midiVelocity,enbSustainTime:duration,enbFadeInTime:attack,enbFadeOutTime:quiet.info?.fadeTicks??release,enbVolumePoints:curve,
  midiEnvelopeInfo:{preset:preset.name,gateTicks:gate,releaseTicks:release,quietTail:quiet.info,controllerNumbers:[...used].sort((a,b)=>a-b),breathApplied:breath&&used.has(2),releaseSource:atRelease[72]==null?'instrument-estimate':'CC72-relative-to-instrument',releaseVelocityUsed:false}};
}
module.exports={adaptive,profile,finishQuietTail};
