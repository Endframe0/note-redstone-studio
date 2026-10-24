'use strict';
// Adapter for the paired 26.1.2 Fabric port; full block-entity NBT is required.
const fs=require('node:fs'),path=require('node:path');
const {enbVelocity}=require('./note-volume.cjs');
const BLOCK='extendednoteblock:extended_note_block',ENTITY='extendednoteblock:extended_note_block_entity';
const PITCHES=['c','cs','d','ds','e','f','fs','g','gs','a','as','b'];
function midi(key){const note=key+21;if(!Number.isInteger(note)||note<0||note>127)throw Error('Extended Note Block 音高须为 MIDI 0–127（NBS key -21–106）。');return note}
function enabled(opt){return opt.soundEngine==='extended'}
function attach(m,opt){
 if(!enabled(opt))return m;
 require('./versions.cjs').requireEnb(opt.target);
 if(m.extendedNoteblock)return m;
 if(m.quinn||m.entities?.length)throw Error('不能把 Quinn 实体模式与 Extended Note Block 混用。');
 const physical=new Map(),occupied=new Map(m.blocks.map(b=>[b.position.join(),b]));
 for(const n of m.notes){
  const key=n.position.join(),old=physical.get(key);
  if(old&&(require('./note-volume.cjs').toneKey(old)!==require('./note-volume.cjs').toneKey(n)))throw Error('复用扩展音符盒的音高、乐器、力度或音量包络冲突');
  physical.set(key,n);
 }
 const {names}=require('./normalize.cjs'),changes=new Map(),extendedNoteBlocks=[];
 for(const [key,n]of physical){
  if(!occupied.get(key)?.block.startsWith('note_block['))throw Error('扩展音符盒位置缺少原音符盒：'+key);
  if(!names[n.instrument])throw Error('扩展音符盒乐器无效');
  const note=midi(n.key),block=`${BLOCK}[pitch=${PITCHES[note%12]},powered=false]`;
  changes.set(key,block);
  extendedNoteBlocks.push({position:n.position,id:ENTITY,note,vanillaInstrument:names[n.instrument],velocity:enbVelocity(n),sustainTime:n.enbSustainTime??40,delayedPlayingTime:0,fadeInTime:n.enbFadeInTime??0,fadeOutTime:n.enbFadeOutTime??0,holdUntilRelease:false,oneShot:n.enbSustainTime==null});
 }
 const blocks=m.blocks.map(b=>changes.has(b.position.join())?{...b,block:changes.get(b.position.join())}:b);
 return {...m,blocks,extendedNoteBlocks,extendedNoteblock:{target:opt.target||'26.1.2',modProfile:require('./versions.cjs').get(opt.target).enb,noteRange:[0,127],nbsKeyRange:[-21,106],physicalNotes:physical.size,blockEntityCount:extendedNoteBlocks.length,interactionEntities:0,requiresClientMod:true,requiresServerMod:true,requiresBlockEntityNbt:true,naturalOneShot:extendedNoteBlocks.every(n=>n.oneShot),durationPreserved:extendedNoteBlocks.some(n=>!n.oneShot),velocityPreserved:true,layerVolumePreserved:true,velocityMapping:'round(127 * noteVelocity * layerVolume / 10000); nonzero minimum 1',wholeSongRuntimeVerified:false}};
}
function details(m,dir){
 if(!m.extendedNoteblock)return;
 const min=m.bounds.map(b=>b[0]);
 fs.writeFileSync(path.join(dir,'扩展音符盒配置.json'),JSON.stringify({block:BLOCK,entity:ENTITY,...m.extendedNoteblock,blocks:m.extendedNoteBlocks.map(n=>({...n,position:n.position.map((v,i)=>v-min[i])}))},null,2));
 return {...m.extendedNoteblock};
}
function guide(text,m){
 if(!m.extendedNoteblock)return text;
 return (m.extendedNoteblock.durationPreserved?'MIDI 音量包络：本投影使用 oneShot=false、holdUntilRelease=false，每块记录持续游戏刻与淡入淡出游戏刻；红石下降沿不截断音符。实际声音受采样自身长度限制，不能保证短采样持续发声到 Note Off。详见扩展音符盒配置.json。\n':'')+text.replace('音符盒音高与中继器档位都在投影方块状态内；生存施工需要逐个调准。','中继器档位在方块状态中；扩展音符盒的完整音高和乐器在方块实体 NBT 中，必须完整粘贴。')+'\n\nExtended Note Block 配套组合：\n客户端与服务器都需要安装对应版本组合；单人游戏在客户端安装即可。1.20.1 / 1.21.1 使用官方 ENB 1.9.1 加 enb-nbs-compat 补丁，两者缺一不可；26.x 使用对应版本的配套移植版。各版本均需 Fabric API，不能混装其他游戏版本的 JAR。\n音符盒替换为 extendednoteblock:extended_note_block；投影包含每块的方块实体 NBT，无需 interaction 实体或幽匿脉络，不增加建筑方块数或尺寸。\nMIDI 音高 = NBS key + 21，范围 0–127。音高不折回原版两八度；微分音仍受“严格保留 / 半音取整”选项控制。\nvanillaInstrument 固定原版音色，采用与 NBS 原版模式一致的相对音高倍率；各乐器采样自身的高低音特色保留。原模组未设置该字段的音符盒继续使用底座决定 GM 乐器。\nNBS 导入将 NBS 音符力度乘以音轨音量，再四舍五入到 ENB 0–127 力度；极低正音量最低取 1，零音量音符省略。旧 NBS 未存储单音符力度时按 100% 处理。声像仍未还原；NBS 本身没有统一的音符时值字段。NBS 导入使用 oneShot=true 让采样自然结束，holdUntilRelease=false 防止红石短脉冲截断尾音。没有使用全局无线红石代替原电路。\n创造粘贴需保留全部 TileEntities / 方块实体 NBT。只放外观相同的方块不会自动还原音高、音色和一次性播放设置；手工配置见“扩展音符盒配置.json”。\n极低或极高音通过变速得到，会改变采样长度与音色；不是额外录制的全音域采样。大量同时发声仍受客户端音频通道数量限制。\n本次整曲未自动实机演奏；测试结果不能代替每首新布局的验收。\n';
}
module.exports={BLOCK,ENTITY,PITCHES,midi,enabled,attach,details,guide};
