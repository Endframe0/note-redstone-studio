'use strict';
// Adapter for the author's 26.1 v1.3 protocol. No upstream pack is bundled.
const fs=require('node:fs'),path=require('node:path');
const bands=['o1-3','o3-5','o5-7','o7-9'];
function pitch(key){
 if(!Number.isInteger(key)||key<9||key>105)throw Error('Quinn v1.3 音域为 F♯1–F♯9（NBS 音高 9–105）。');
 const index=key<33?0:key<=57?1:key<=81?2:3;
 return {band:bands[index],note:key-(9+24*index)};
}
// Logical NBS keys remain untouched, including in phrase reuse signatures.
// Geometry is generated using vanilla placeholders before a sound adapter
// replaces their block state and NBT. Preserve the logical source key.
function noteValue(n){if(Number.isInteger(n.key)&&(n.key<9||n.key>105)&&n.key>=-21&&n.key<=106)return((n.key-33)%12+12)%12;return pitch(n.key).note}
function enabled(opt){
 const mode=opt.soundEngine||'vanilla';
 if(!['vanilla','quinn','extended'].includes(mode))throw Error('未知音符盒模式');
 if(mode==='extended')require('./versions.cjs').requireEnb(opt.target);
 if(mode==='quinn'&&(opt.target||'26.1.2')!=='26.1.2')throw Error('Quinn 兼容模式目前支持 Java 26.1.2 + 官方 v1.3 数据包和资源包。');
 return mode==='quinn';
}
function attach(m,opt){
 if(!enabled(opt))return m;
 if(m.quinn)return m;
 const occupied=new Map(m.blocks.map(b=>[b.position.join(),b.block])),physical=new Map();
 for(const n of m.notes){const k=n.position.join(),prev=physical.get(k);if(prev&&(prev.key!==n.key||prev.instrument!==n.instrument))throw Error('复用音符盒的 Quinn 音域冲突');physical.set(k,n)}
 const covers=[],entities=[],configuration=[];
 for(const n of physical.values()){
  const p=n.position,[x,y,z]=p,above=[x,y+1,z],v=pitch(n.key),block=occupied.get(p.join());
  if(!block?.startsWith('note_block[')||!block.includes(`note=${v.note},`))throw Error('Quinn 音高状态与源音符不一致');
  if(occupied.has(above.join()))throw Error('Quinn 幽匿脉络与已有方块冲突：'+above.join());
  covers.push({position:above,block:'sculk_vein[down=true,up=false,north=false,south=false,east=false,west=false,waterlogged=false]'});
  // The author also shrinks upgraded blocks to inactive interactions when
  // nobody holds the wrench. Its display is recreated by the pack on demand.
  entities.push({id:'minecraft:interaction',position:[x+.5,y-.025,z+.5],anchor:p,tags:['nb_interaction',v.band,'inactive','nbs_quinn'],width:.5,height:.5});
  configuration.push({position:p,key:n.key,instrument:n.instrument,...v});
 }
 const result=require('./parallel-layout.cjs').measure({...m,blocks:[...m.blocks,...covers],entities,quinn:{version:'1.3',range:[9,105],rangeName:'F♯1–F♯9',physicalNotes:physical.size,interactionEntities:entities.length,coverBlocks:covers.length,configuration,requiresDatapack:true,requiresResourcepack:true,requiresEntityPaste:true,additionalGameTickDelay:1,runtimeVerified:false}});
 return result;
}
const requirements='Quinn 模式需要 Java 26.1.2，以及官方 Quinn’s Better Noteblocks v1.3 数据包和配套资源包；两者缺一不可。投影粘贴必须包含实体（interaction），并保留音符盒上方的幽匿脉络。只粘贴方块或仅按投影手工搭建不能完成扩展音域。';
function details(m,dir){
 if(!m.quinn)return;
 const min=m.bounds.map(b=>b[0]),q={...m.quinn,configuration:m.quinn.configuration.map(n=>({...n,position:n.position.map((v,i)=>v-min[i])}))};
 fs.writeFileSync(path.join(dir,'Quinn音符配置.json'),JSON.stringify(q,null,2));
 return {...q,configuration:undefined};
}
function guide(text,m){
 if(!m.quinn)return text;
 return text.replace('音符盒音高与中继器档位都在投影方块状态内；生存施工需要逐个调准。','音符盒半音与中继器档位在方块状态中，Quinn 八度档位在交互实体中；手工施工需要官方扳手升级配置。').replaceAll('音符盒上方必须为空气','普通音符盒上方需要空气；本模式必须保留生成的幽匿脉络').replaceAll('音符盒上方保持空气','保留音符盒上方生成的幽匿脉络').replace('声音全部由实体音符盒发出','红石触发音符盒，由 Quinn 数据包播放扩展音色')+'\n\nQuinn 扩展音域：\n'+requirements+'\n创造模式粘贴时关闭忽略实体选项，先安装数据包再粘贴，等待放置完毕后启动。每个物理音符盒只附带一个交互实体，复用音符盒不会重复生成实体。拿官方调音扳手靠近时，数据包会自行显示调音模型。\n手工施工：先搭建音符盒与电路，暂时不要放音符盒上方的幽匿脉络；用官方调音扳手升级，让数据包自动生成脉络和实体，并按 Quinn音符配置.json 的坐标、band 和 note 调整；普通投影无法代替实体配置。\n全部音符使用同一扩展发声机制，数据包会增加约 1 游戏刻的共同发声延迟。使用严格保留音高可禁止八度折叠；微分音仍需半音取整。v1.3 可寻址 F♯1–F♯9（97 个半音位置），并非 108 个连续半音；作者标注的个别乐器采样八度偏差，本转换器不擅自校正。\n大量交互实体会增加游戏负载，毒曲模式尤其明显。未自动对本次整首歌进行游戏内演奏验证。\n数据包：https://modrinth.com/datapack/quinns-better-noteblocks-dp/version/v1.3\n资源包：https://modrinth.com/resourcepack/quinns-better-noteblocks-rp/version/v1.3\n';
}
module.exports={pitch,noteValue,enabled,attach,details,guide,requirements};
