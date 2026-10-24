'use strict';
const fs=require('node:fs'),zlib=require('node:zlib');
const {blockStates}=require('./electrical.cjs');
const T={byte:v=>[1,v],int:v=>[3,v],long:v=>[4,BigInt(v)],float:v=>[5,v],double:v=>[6,v],str:v=>[8,v],list:(type,v)=>[9,{type,v}],compound:v=>[10,v],longs:v=>[12,v]};
function encode(root){
 const chunks=[];const byte=v=>{const b=Buffer.alloc(1);b.writeUInt8(v);chunks.push(b)},int=v=>{const b=Buffer.alloc(4);b.writeInt32BE(v);chunks.push(b)},str=v=>{const b=Buffer.from(v,'utf8');if(b.length>65535)throw Error('NBT 字符串过长');const n=Buffer.alloc(2);n.writeUInt16BE(b.length);chunks.push(n,b)};
 function payload(t,v){switch(t){case 1:{const b=Buffer.alloc(1);b.writeInt8(v);chunks.push(b);break}case 3:int(v);break;case 4:{const b=Buffer.alloc(8);b.writeBigInt64BE(BigInt.asIntN(64,v));chunks.push(b);break}case 5:{const b=Buffer.alloc(4);b.writeFloatBE(v);chunks.push(b);break}case 6:{const b=Buffer.alloc(8);b.writeDoubleBE(v);chunks.push(b);break}case 8:str(v);break;case 9:byte(v.type);int(v.v.length);for(const a of v.v)payload(v.type,a);break;case 10:for(const [k,[type,val]]of Object.entries(v)){byte(type);str(k);payload(type,val)}byte(0);break;case 12:{int(v.length);const b=Buffer.alloc(v.length*8);for(let i=0;i<v.length;i++)b.writeBigInt64BE(BigInt.asIntN(64,v[i]),i*8);chunks.push(b);break;}default:throw Error('Unknown NBT type '+t)}}
 byte(10);str('');payload(10,root);return Buffer.concat(chunks);
}
const xyz=p=>T.compound({x:T.int(p[0]),y:T.int(p[1]),z:T.int(p[2])});
function containerTags(m,target){
 if(!m.containers?.length)return [];
 const version=require('./versions.cjs').get(target);
 const blocks=new Map(m.blocks.map(b=>[b.position.join(),b.block])),seen=new Set(),min=m.bounds.map(b=>b[0]);
 return m.containers.map(c=>{
  if(!Array.isArray(c.position)||c.position.length!==3||!c.position.every(Number.isInteger))throw Error('Invalid container position');
  const key=c.position.join(),block=blocks.get(key)?.replace(/^minecraft:/,'').split('[')[0];
  if(c.id!=='minecraft:hopper'||block!=='hopper'||seen.has(key))throw Error('Unsupported, duplicate or missing hopper container');
  seen.add(key);const p=c.position.map((v,i)=>v-min[i]);
  if(p.some((v,i)=>v<0||v>=m.dimensions[i]))throw Error('Container outside schematic bounds');
  const slots=new Set();
  if(!Array.isArray(c.inventory))throw Error('Missing hopper inventory');
  const items=c.inventory.map(i=>{
   // Current timers use ordinary 64-stack cobblestone. Reject unknown stack
   // limits instead of silently changing the timer's transfer duration.
   if(!Number.isInteger(i.slot)||i.slot<0||i.slot>4||slots.has(i.slot)||i.id!=='minecraft:cobblestone'||!Number.isInteger(i.count)||i.count<1||i.count>64)throw Error('Invalid hopper timer inventory');
   slots.add(i.slot);return version.components?{Slot:T.byte(i.slot),id:T.str(i.id),count:T.int(i.count),components:T.compound({})}:{Slot:T.byte(i.slot),id:T.str(i.id),Count:T.byte(i.count)};
  });
  return{id:T.str(c.id),x:T.int(p[0]),y:T.int(p[1]),z:T.int(p[2]),TransferCooldown:T.int(0),Items:T.list(10,items)};
 });
}
function commandTags(m){
 const occupied=new Map(m.blocks.map(b=>[b.position.join(),b.block])),min=m.bounds.map(b=>b[0]),seen=new Set();
 return (m.commandBlocks||[]).map(c=>{
  const k=c.position.join(),block=occupied.get(k)||'';
  if(seen.has(k)||!/^((chain|repeating)_)?command_block\[/.test(block)||typeof c.command!=='string'||c.command.length>32000)throw Error('Invalid command block entity');
  seen.add(k);const p=c.position.map((v,i)=>v-min[i]);
  return {id:T.str('minecraft:command_block'),x:T.int(p[0]),y:T.int(p[1]),z:T.int(p[2]),Command:T.str(c.command),auto:T.byte(c.auto?1:0),powered:T.byte(0),conditionMet:T.byte(0),TrackOutput:T.byte(0),SuccessCount:T.int(0),UpdateLastExecution:T.byte(1)};
 });
}
function entityTags(m){
 const min=m.bounds.map(b=>b[0]),seen=new Set();
 return (m.entities||[]).map(e=>{
  if(e.id!=='minecraft:interaction'||e.position?.length!==3||!e.position.every(Number.isFinite)||e.anchor?.length!==3||!e.anchor.every(Number.isInteger)||!['o1-3','o3-5','o5-7','o7-9'].some(t=>e.tags?.includes(t)))throw Error('Invalid Quinn entity');
  if(seen.has(e.anchor.join()))throw Error('Duplicate Quinn entity');seen.add(e.anchor.join());
  return {id:T.str(e.id),Pos:T.list(6,e.position.map((v,i)=>v-min[i])),Motion:T.list(6,[0,0,0]),Rotation:T.list(5,[0,0]),Tags:T.list(8,e.tags),width:T.float(e.width),height:T.float(e.height),response:T.byte(0)};
 });
}
function extendedNoteTags(m){
 const {BLOCK,ENTITY,PITCHES}=require('./extended-noteblock.cjs'),min=m.bounds.map(b=>b[0]),occupied=new Map(m.blocks.map(b=>[b.position.join(),b.block])),seen=new Set();
 return (m.extendedNoteBlocks||[]).map(n=>{
  const k=n.position?.join(),p=n.position?.map((v,i)=>v-min[i]);
  if(!p||p.length!==3||!p.every(Number.isInteger)||p.some((v,i)=>v<0||v>=m.dimensions[i])||seen.has(k)||n.id!==ENTITY||!Number.isInteger(n.note)||n.note<0||n.note>127||occupied.get(k)!==`${BLOCK}[pitch=${PITCHES[n.note%12]},powered=false]`||!require('./normalize.cjs').names.includes(n.vanillaInstrument))throw Error('Invalid extended note block entity');
  seen.add(k);
  if(!Number.isInteger(n.velocity)||n.velocity<0||n.velocity>127)throw Error('Invalid extended note block velocity');
  return {id:T.str(ENTITY),x:T.int(p[0]),y:T.int(p[1]),z:T.int(p[2]),note:T.int(n.note),vanillaInstrument:T.str(n.vanillaInstrument),velocity:T.int(n.velocity),sustainTime:T.int(n.sustainTime??40),delayedPlayingTime:T.int(n.delayedPlayingTime??0),fadeInTime:T.int(n.fadeInTime??0),fadeOutTime:T.int(n.fadeOutTime??0),holdUntilRelease:T.byte(n.holdUntilRelease?1:0),oneShot:T.byte(n.oneShot===false?0:1)};
 });
}
function write(file,m,{name='红石音乐',target='26.1.2'}={}){
 if(m.toxic)return writeLong(file,m,{name,target});
 const size=m.dimensions,min=m.bounds.map(a=>a[0]),volume=m.volume;
 const tileEntities=[...containerTags(m,target),...commandTags(m),...extendedNoteTags(m)];
 const palette=[{Name:T.str('minecraft:air')}],lookup=new Map([['minecraft:air',0]]),cells=[];
 for(const b of blockStates(m)){
  const props=Object.entries(b.properties).sort(),key=JSON.stringify([b.name,props]);let id=lookup.get(key);
  if(id===undefined){id=palette.length;lookup.set(key,id);const p={Name:T.str(b.name)};if(props.length)p.Properties=T.compound(Object.fromEntries(props.map(([k,v])=>[k,T.str(v)])));palette.push(p)}
  const [x,y,z]=b.position.map((v,i)=>v-min[i]);cells.push([(y*size[2]+z)*size[0]+x,id]);
 }
 const bits=Math.max(2,Math.ceil(Math.log2(palette.length))),longs=Array(Math.ceil(volume*bits/64)).fill(0n);
 for(const [idx,id]of cells){const bit=idx*bits,word=Math.floor(bit/64),shift=bit%64;longs[word]|=BigInt(id)<<BigInt(shift);if(shift+bits>64)longs[word+1]|=BigInt(id)>>BigInt(64-shift)}
 const now=BigInt(Date.now());const root={Version:T.int(require('./versions.cjs').get(target).format),SubVersion:T.int(1),MinecraftDataVersion:T.int(require('./versions.cjs').get(target).dataVersion),Metadata:T.compound({Name:T.str(name),Author:T.str('音符工坊'),Description:T.str(m.extendedNoteblock?'Extended Note Block 配套 Fabric 模组：需配套模组，粘贴须保留全部方块实体 NBT。':m.quinn?'Quinn v1.3 扩展音域；需官方数据包与资源包。粘贴包含实体并保留幽匿脉络。':m.externalStart?'包含自动外部同步启动线；只接总入口1红石刻脉冲。主体尺寸见转换报告，完整投影尺寸包含线路。':m.inputs?.length?'纯红石音乐；所有绿色玻璃输入点同时触发。外部同步线由用户自行连接，不包含在投影中。':'纯红石音乐；绿色底座按钮启动。请保持音符盒上方空气。'),RegionCount:T.int(1),TimeCreated:T.long(now),TimeModified:T.long(now),TotalBlocks:T.int(m.blocks.length),TotalVolume:T.int(volume),EnclosingSize:xyz(size)}),Regions:T.compound({Music:T.compound({Position:xyz([0,0,0]),Size:xyz(size),BlockStatePalette:T.list(10,palette),BlockStates:T.longs(longs),Entities:T.list(10,entityTags(m)),TileEntities:T.list(10,tileEntities),PendingBlockTicks:T.list(10,[]),PendingFluidTicks:T.list(10,[])})})};
 fs.writeFileSync(file,zlib.gzipSync(encode(root)));return{paletteEntries:palette.length,bitsPerBlock:bits,bytes:fs.statSync(file).size,dataVersion:require('./versions.cjs').get(target).dataVersion};
}
// Long music is split into adjacent regions. Encode each region before moving
// to the next, avoiding a BigInt array for the complete (mostly air) envelope.
// Wire shapes are evaluated against the whole model, including region seams.
function writeLong(file,m,{name,target}){
 const min=m.bounds.map(b=>b[0]),groups=new Map(),regionOf=p=>Math.floor((p[0]-min[0])/256);
 for(const b of blockStates(m)){const i=regionOf(b.position);if(!groups.has(i))groups.set(i,[]);groups.get(i).push(b)}
 const raw=new Map();for(const b of m.blocks){const i=regionOf(b.position);if(!raw.has(i))raw.set(i,[]);raw.get(i).push(b)}
 const now=BigInt(Date.now()),root={Version:T.int(require('./versions.cjs').get(target).format),SubVersion:T.int(1),MinecraftDataVersion:T.int(require('./versions.cjs').get(target).dataVersion),Metadata:T.compound({Name:T.str(name),Author:T.str('音符工坊'),Description:T.str((m.extendedNoteblock?'Extended Note Block 配套 Fabric 模组：需配套模组及完整方块实体 NBT。':'')+(m.quinn?'Quinn v1.3：需数据包、资源包及实体粘贴；保留幽匿脉络。':'')+'毒曲：实体音符盒、红石时序线、启动按钮及每游戏刻跟随命令方块。请完整粘贴所有区域及方块实体 NBT，不要旋转或镜像。'),RegionCount:T.int(groups.size),TimeCreated:T.long(now),TimeModified:T.long(now),TotalBlocks:T.int(m.blocks.length),TotalVolume:T.int(m.volume),EnclosingSize:xyz(m.dimensions)}),Regions:T.compound({})};
 const chunks=[encode(root).subarray(0,-2)];let paletteEntries=0;
 for(const [i,cells]of groups){
  const bounds=[0,1,2].map(axis=>cells.reduce((a,b)=>[Math.min(a[0],b.position[axis]),Math.max(a[1],b.position[axis])],[Infinity,-Infinity]));
  const lo=bounds.map(b=>b[0]),size=bounds.map(b=>b[1]-b[0]+1),volume=size.reduce((a,b)=>a*b,1);
  const sub={blocks:raw.get(i),bounds,dimensions:size,containers:(m.containers||[]).filter(c=>regionOf(c.position)===i),commandBlocks:(m.commandBlocks||[]).filter(c=>regionOf(c.position)===i),entities:(m.entities||[]).filter(e=>regionOf(e.anchor)===i),extendedNoteBlocks:(m.extendedNoteBlocks||[]).filter(n=>regionOf(n.position)===i)};
  const palette=[{Name:T.str('minecraft:air')}],lookup=new Map([['minecraft:air',0]]),ids=[];
  for(const b of cells){const props=Object.entries(b.properties).sort(),k=JSON.stringify([b.name,props]);let id=lookup.get(k);if(id===undefined){id=palette.length;lookup.set(k,id);const p={Name:T.str(b.name)};if(props.length)p.Properties=T.compound(Object.fromEntries(props.map(([k,v])=>[k,T.str(v)])));palette.push(p)}ids.push(id)}
  const bits=Math.max(2,Math.ceil(Math.log2(palette.length))),longs=Array(Math.ceil(volume*bits/64)).fill(0n);
  cells.forEach((b,j)=>{const [x,y,z]=b.position.map((v,a)=>v-lo[a]),bit=((y*size[2]+z)*size[0]+x)*bits,word=Math.floor(bit/64),shift=bit%64;longs[word]|=BigInt(ids[j])<<BigInt(shift);if(shift+bits>64)longs[word+1]|=BigInt(ids[j])>>BigInt(64-shift)});
  const region={Position:xyz(lo.map((v,a)=>v-min[a])),Size:xyz(size),BlockStatePalette:T.list(10,palette),BlockStates:T.longs(longs),Entities:T.list(10,entityTags(sub)),TileEntities:T.list(10,[...containerTags(sub,target),...commandTags(sub),...extendedNoteTags(sub)]),PendingBlockTicks:T.list(10,[]),PendingFluidTicks:T.list(10,[])};
  chunks.push(encode({['Music_'+i]:T.compound(region)}).subarray(3,-1));paletteEntries=Math.max(paletteEntries,palette.length);
 }
 chunks.push(Buffer.from([0,0]));fs.writeFileSync(file,zlib.gzipSync(Buffer.concat(chunks)));
 return{paletteEntries,regions:groups.size,bytes:fs.statSync(file).size,dataVersion:require('./versions.cjs').get(target).dataVersion,regionSpanX:256};
}
module.exports={write,encode,T,commandTags,entityTags,extendedNoteTags};
