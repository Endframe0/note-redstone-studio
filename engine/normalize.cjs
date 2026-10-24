'use strict';
const names=['harp','bass','basedrum','snare','hat','guitar','flute','bell','chime','xylophone','iron_xylophone','cow_bell','didgeridoo','bit','banjo','pling','trumpet','trumpet_exposed','trumpet_weathered','trumpet_oxidized'];
const bases=['dirt','oak_planks','stone','sand','glass','white_wool','clay','gold_block','packed_ice','bone_block','iron_block','soul_sand','pumpkin','emerald_block','hay_block','glowstone','waxed_copper_block','waxed_exposed_copper','waxed_weathered_copper','waxed_oxidized_copper'];
function normalize(source,opt={}){
 const quinn=require('./quinn.cjs').enabled(opt),extended=opt.soundEngine==='extended',low=extended?-21:quinn?9:33,high=extended?106:quinn?105:57;
 const warnings=[...require('./versions.cjs').warnings(opt.target,opt),...(source.compatibilityWarnings||[]),extended&&source.sourceType==='midi'?'ENB 力度读取 MIDI 起音力度、CC7 音量与 CC11 表情；不还原声像。':extended?'ENB 力度按 NBS 音符力度 × 音轨音量换算到 0–127；声像未还原，实际声像随听者位置变化。':'原版音符盒不能独立还原音符力度与声像；布局保留音高、乐器和起音，实际声像随听者位置变化。'];
 const speed=Number(opt.speed??1),transpose=Number(opt.transpose??0);
 if(![0.5,1,2].includes(speed)||!Number.isInteger(transpose)||Math.abs(transpose)>48)throw Error('速度或移调参数无效。');
 if(quinn)warnings.push(require('./quinn.cjs').requirements,'Quinn 数据包增加约 1 游戏刻共同延迟；扩展音色及采样调音以官方资源包为准。');
 if(extended)warnings.push('需要配套的 Extended Note Block 对应版本组合（旧版为官方 ENB＋NBS 兼容补丁，高版本为配套移植版），粘贴须保留方块实体 NBT；保留原版相对音色，MIDI 音高为 NBS key + 21。');
 const midiPlan=source.sourceType==='midi'?(opt.midiPlan||require('./midi-timing.cjs').plan(source,opt)):null;
 let timingErrorMs=0,pitchChanged=0,muted=0;const notes=[];
 for(const n of source.notes){const layer=source.layers[n.layer];if(n.velocity===0||layer?.volume===0){muted++;continue}
  if(n.instrument>=source.instrumentCount||n.instrument>=names.length)throw Error(`第 ${n.tick} tick 使用自定义乐器 ${n.instrument}，纯红石不能还原。请先在 NBS 中换成原版乐器。`);
  if(n.instrument>=16&&!require('./versions.cjs').supports(opt.target,'trumpets'))throw Error('铜管乐器需要 Minecraft 26.1 或更新版本；不会静默换成其他音色。');
  let key=n.key+n.pitch/100+transpose;const before=key;
  if(!Number.isInteger(key)){if(opt.pitch!=='fold')throw Error(`第 ${n.tick} tick 有微分音。请选择“八度折叠 / 半音取整”或修正源文件。`);key=Math.round(key)}
  if(key<low||key>high){if(opt.pitch!=='fold')throw Error(`音高 ${key} 超出${extended?'Extended Note Block':quinn?'Quinn v1.3':'原版'} ${low}–${high} 范围。请移调，或选择“八度折叠 / 半音取整”。`);while(key<low)key+=12;while(key>high)key-=12}
  if(key!==before)pitchChanged++;
  const resolution=Number(opt.timeResolution??10);if(![10,20].includes(resolution))throw Error('时序精度必须为 10 或 20');
  const exact=midiPlan?require('./midi-timing.cjs').mapExact(n.midiTick,midiPlan)*10/midiPlan.resolution:n.tick/source.tempo*10/speed,tick=Math.round(exact*(resolution/10))/(resolution/10),error=Math.abs(tick-exact)*100;
  if(error>0.00001&&!midiPlan&&opt.timing!=='quantize')throw Error(resolution===20?'此曲时序不能精确落在 0.05 秒游戏刻上，请选择最近游戏刻或调整速度。':'此曲时序不能精确落在 0.1 秒红石刻上。请选择“最近红石刻（±50 ms）”或调整 NBS 速度。');
  timingErrorMs=Math.max(timingErrorMs,error);notes.push({...n,tick,key,pitch:0,sourceTick:n.tick,...(extended?{layerVolume:layer?.volume??100,enbVelocity:n.midiVelocity??require('./note-volume.cjs').toEnbVelocity(n.velocity??100,layer?.volume??100),...(midiPlan?require('./midi-envelope.cjs').envelope(n,tick,midiPlan,opt):{})}:{})});
 }
 notes.sort((a,b)=>a.tick-b.tick||a.layer-b.layer);
 if(!notes.length)throw Error('文件没有可发声的音符。');
 if(notes.at(-1).tick>36000)throw Error('本版最多转换 60 分钟的单次演奏。');
 const gm=new Map();for(const n of notes){if(!gm.has(n.tick))gm.set(n.tick,[]);gm.get(n.tick).push(n)}
 let merged=0;for(const ns of gm.values())if(new Set(ns.map(n=>n.sourceTick)).size>1)merged++;
 const denseChords=[...gm.values()].filter(ns=>Math.max(Math.ceil(ns.length/2),ns.filter(n=>n.instrument===3).length)>14);
 if(denseChords.length)warnings.push(`有 ${denseChords.length} 组密集和弦，最多 ${Math.max(...denseChords.map(ns=>ns.length))} 音同时发声；将尝试同步拆轨，保留全部音符及起音。`);
 if(source.loop?.enabled)warnings.push('NBS 循环标志已识别；导出为单次演奏，不自动循环。');
 if(timingErrorMs>0.00001)warnings.push(`已量化时间：最大偏差 ${timingErrorMs.toFixed(3)} ms，${merged} 组不同起音合并。`);
 if(pitchChanged)warnings.push(`已按选项折叠 / 取整 ${pitchChanged} 个音高。`);
 if(muted)warnings.push(`省略 ${muted} 个音量为 0 的静音音符。`);
 if(speed!==1)warnings.push(`演奏速度为原曲 ${speed} 倍。`);
 if(midiPlan)warnings.push(...require('./midi-timing.cjs').messages(midiPlan),extended?'MIDI 持续时间由 Note Off / 延音踏板确定，淡入淡出为导入设置（不是 MIDI 自带时值字段）。ENB 可提前停止和改变音量，但不循环延长原版短采样；长音可能在设定结束前自然衰减。':'MIDI 使用原版音符盒时仅还原乐器、音高与起音；不保留 Note Off 时长、延音踏板时长、淡入淡出或独立力度，声音按原版采样自然播放。');
 const ticks=[...gm.keys()];let prev=0;if(ticks[0]>0)gm.set(0,[]);
 for(const t of ticks){while(t-prev>8){prev+=8;gm.set(prev,[])}prev=t}
 return{...source,midiConversion:midiPlan?{...midiPlan,envelope:{preserved:extended,mode:opt.midiEnvelope||'custom',fadeInMs:Number(opt.midiFadeInMs??0),fadeOutMs:Number(opt.midiFadeOutMs??50)},mappingSource:source.midi.mappingSource,sourceDurationSeconds:source.midi.durationSeconds,durationSeconds:notes.reduce((m,n)=>Math.max(m,(n.tick*2+(n.enbSustainTime??0))/20),0)}:null,tempo:10,notes,events:[...gm].sort((a,b)=>a[0]-b[0]).map(([tick,notes])=>({tick,notes})),warnings,timingErrorMs,pitchChanged,muted,merged,speed,transpose,denseChordCount:denseChords.length};
}
module.exports={normalize,names,bases};
