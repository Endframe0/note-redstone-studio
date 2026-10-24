'use strict';
const fs=require('node:fs'),mapping=require('./midi-instruments.json');
// SMF 0/1 reader. Events are merged before pairing voices, so tempo, pedal and
// program changes from conductor/other tracks affect the same MIDI channels.
function parse(file,{maxNotes=1000000}={}){
 if(!Number.isInteger(maxNotes)||maxNotes<1||maxNotes>1000000)throw Error('MIDI 音符数量上限无效。');
 const b=Buffer.isBuffer(file)?file:fs.readFileSync(file);let p=0;
 const need=n=>{if(n<0||p+n>b.length)throw Error('MIDI 文件截断。')};
 const u16=()=>{need(2);const v=b.readUInt16BE(p);p+=2;return v};
 const u32=()=>{need(4);const v=b.readUInt32BE(p);p+=4;return v};
 const str=n=>{need(n);const v=b.toString('ascii',p,p+n);p+=n;return v};
 if(b.length>32*1024*1024)throw Error('MIDI 超过 32 MB。');
 if(str(4)!=='MThd')throw Error('不是标准 MIDI 文件（缺少 MThd）。');
 const h=u32();if(h<6)throw Error('MIDI 头长度无效。');need(h);
 const format=u16(),tracks=u16(),ppq=u16();p+=h-6;
 if(format>1)throw Error('暂不支持 MIDI Format 2 独立序列，请先导出为 Format 0 或 1。');
 if(!ppq||(ppq&0x8000))throw Error('请使用按拍计时（PPQ）的 MIDI；暂不支持 SMPTE 时间码。');
 if(!tracks||tracks>4096||(format===0&&tracks!==1))throw Error('MIDI 轨道数量无效。');
 const events=[],trackNames=[];let eventCount=0,lastTick=0,hasSysEx=false,endedTracks=0,lastTrackDataStart=0,tailWarning='';
 for(let track=0;track<tracks;track++){
  if(str(4)!=='MTrk')throw Error('MIDI 缺少 MTrk 音轨。');const len=u32();need(len);lastTrackDataStart=p;const end=p+len;let tick=0,running=0,order=0;
  const byte=()=>{if(p>=end)throw Error('MIDI 音轨截断。');return b[p++]};
  const vlq=()=>{let v=0;for(let i=0;i<4;i++){const x=byte();v=v*128+(x&127);if(!(x&128))return v}throw Error('MIDI VLQ 超过 4 字节。')};
  while(p<end){
   tick+=vlq();if(!Number.isSafeInteger(tick)||tick>1e10)throw Error('MIDI 时间超出范围。');lastTick=Math.max(lastTick,tick);
   let status=byte();if(status<128){if(!running)throw Error('MIDI running status 缺失。');p--;status=running}
   if(++eventCount>5000000)throw Error('MIDI 事件超过 500 万。');
   const e={tick,track,order:order++};
   if(status===255){running=0;const type=byte(),n=vlq();if(p+n>end)throw Error('MIDI 元事件截断。');
    if(type===81){if(n!==3)throw Error('MIDI tempo 事件长度无效。');const us=b.readUIntBE(p,3);if(!us)throw Error('MIDI BPM 无效。');events.push({...e,type:'tempo',us})}
    if(type===3)trackNames[track]=b.toString('utf8',p,p+n).slice(0,256);
    p+=n;if(type===47){if(n)throw Error('MIDI 结束事件无效。');endedTracks++;p=end;break}continue;
   }
   if(status===240||status===247){running=0;const n=vlq();if(p+n>end)throw Error('MIDI SysEx 截断。');p+=n;hasSysEx=true;continue}
   if(status>=240)throw Error('不支持的 MIDI 系统事件。');running=status;
   const kind=status>>4,ch=status&15,a=byte(),c=(kind===12||kind===13)?0:byte();if(a>127||c>127)throw Error('MIDI 数据字节无效。');
   if([8,9,11,12,14].includes(kind))events.push({...e,type:kind,ch,a,c});
  }
 }
 if(p!==b.length){
  const tail=b.subarray(p),duplicate=tail.length<=p-lastTrackDataStart&&tail.equals(b.subarray(p-tail.length,p));
  // Only tolerate proven suffix duplication or zero padding after every
  // declared track has a valid End-of-Track. Never guess at extra note data.
  if(endedTracks===tracks&&(duplicate||tail.every(v=>v===0)))tailWarning=`MIDI 兼容读取：全部 ${tracks} 条音轨已完整结束，忽略末尾 ${tail.length} 字节${duplicate?'重复尾部':'零填充'}；原文件未改动。`;
  else throw Error('MIDI 含无法识别的尾部数据，不能确认是否为额外音轨。');
 }
 events.sort((a,b)=>a.tick-b.tick||a.track-b.track||a.order-b.order);
 const tempo=[{tick:0,us:500000,numerator:0}];let currentUs=500000,t0=0,numerator=0;
 for(const e of events)if(e.type==='tempo'){
  numerator+=(e.tick-t0)*currentUs;t0=e.tick;currentUs=e.us;
  if(tempo.at(-1).tick===e.tick)tempo.pop();tempo.push({tick:e.tick,us:e.us,numerator});
 }
 const seconds=t=>{let lo=0,hi=tempo.length;while(lo+1<hi){const m=(lo+hi)>>1;if(tempo[m].tick<=t)lo=m;else hi=m}const s=tempo[lo];return (s.numerator+(t-s.tick)*s.us)/ppq/1e6};
 if(seconds(lastTick)>3600)throw Error('MIDI 超过 60 分钟。');
 const channels=Array.from({length:16},()=>({program:0,volume:100,expression:127,pedal:false,active:new Map(),held:[]}));
 const notes=[],layers=Array.from({length:tracks*16},()=>({volume:100,panning:100}));let orphan=0,unterminated=0,unmapped=0,bends=0,ignoredCC=new Set();
 const finish=(n,t)=>{n.midiEndTick=Math.max(n.midiTick,t);n.durationSeconds=seconds(n.midiEndTick)-seconds(n.midiTick)};
 const release=(ch,key,t)=>{const q=ch.active.get(key);if(!q?.length){orphan++;return}const n=q.shift();if(!q.length)ch.active.delete(key);if(ch.pedal)ch.held.push(n);else finish(n,t)};
 for(const e of events){
  if(typeof e.type!=='number')continue;const ch=channels[e.ch];
  if(e.type===12){ch.program=e.a;continue}
  if(e.type===14){if(e.a+128*e.c!==8192)bends++;continue}
  if(e.type===11){
   if(e.a===7)ch.volume=e.c;else if(e.a===11)ch.expression=e.c;
   else if(e.a===64){const down=e.c>=64;if(ch.pedal&&!down){for(const n of ch.held)finish(n,e.tick);ch.held=[]}ch.pedal=down}
   else if(e.a===120||e.a===123){for(const key of [...ch.active.keys()])while(ch.active.has(key))release(ch,key,e.tick);if(e.a===120){for(const n of ch.held)finish(n,e.tick);ch.held=[]}}
   else if(e.a===121){ch.expression=127;ch.pedal=false;for(const n of ch.held)finish(n,e.tick);ch.held=[]}
   else ignoredCC.add(e.a);continue;
  }
  if(e.type===8||(e.type===9&&!e.c)){release(ch,e.a,e.tick);continue}
  if(e.type!==9)continue;
  const drum=e.ch===9,d=drum?mapping.drums[e.a-mapping.drumStart]:null,m=mapping.programs[ch.program];
  if(drum&&!d)unmapped++;
  const instrument=drum?(d?.instrument??3):m.instrument;
  const key=drum?(d?.key??45):e.a-21+m.octave*12;
  const v=Math.round(e.c*ch.volume/127*ch.expression/127),n={tick:seconds(e.tick)*1e6,midiTick:e.tick,midiKey:e.a,midiProgram:ch.program,midiChannel:e.ch,midiDrum:drum,layer:e.track*16+e.ch,instrument,key,pitch:0,velocity:v/127*100,midiVelocity:v,panning:100};
  notes.push(n);if(notes.length>maxNotes)throw Error(`本模式最多转换 ${maxNotes} 个音符。`);
  const q=ch.active.get(e.a)||[];q.push(n);ch.active.set(e.a,q);
 }
 for(const ch of channels){for(const q of ch.active.values())for(const n of q){finish(n,lastTick);unterminated++}for(const n of ch.held)finish(n,lastTick)}
 const compatibilityWarnings=tailWarning?[tailWarning]:[];
 if(unterminated)compatibilityWarnings.push(`${unterminated} 个 MIDI 音符缺少 Note Off，持续到文件结尾。`);
 if(orphan)compatibilityWarnings.push(`忽略 ${orphan} 个没有对应 Note On 的 Note Off。`);
 if(unmapped)compatibilityWarnings.push(`${unmapped} 个非映射打击乐音符使用小鼓默认音高近似。`);
 if(bends)compatibilityWarnings.push(`含 ${bends} 个非居中弯音事件；当前保留键盘音高，不还原弯音曲线。`);
 if(ignoredCC.size||hasSysEx)compatibilityWarnings.push('不还原 SysEx、音色库、声像、效果器及未支持控制器；声像随游戏听者位置。');
 compatibilityWarnings.push('CC7/11 音量与表情按起音瞬间取值，不还原音符播放过程中的控制器包络。');
 compatibilityWarnings.push('MIDI 乐器按 Open Note Block Studio 映射到音符盒音色与八度；不等同于原 MIDI 音源。');
 return {sourceType:'midi',version:format,tempo:1e6,instrumentCount:20,name:trackNames.find(Boolean)||'MIDI',layers,notes,compatibilityWarnings,midi:{format,ppq,tempo,lastTick,durationSeconds:seconds(lastTick),trackNames,mappingSource:mapping.source}};
}
module.exports={parse};
