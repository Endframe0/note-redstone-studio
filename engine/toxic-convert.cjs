'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {parse}=require('./nbs.cjs'),{normalize}=require('./normalize.cjs');
const {designToxic,auditTemplate,addControl}=require('./toxic-layout.cjs');
function convertToxic(options,progress=()=>{}){
 const started=Date.now(),opt={target:'26.1.2',support:'cobblestone',...options,objective:'toxic',backend:'cpu',autoStartWiring:true,heavyCore:false,maxZ:100,maxY:100,maxAspect:0,maxSpatialAspect:0,maxListeningRadius:0};
 if(!require('./versions.cjs').supports(opt.target,'toxic'))throw Error('毒曲模式及命令方块投影目前需要 Java 26.1.2');
 if(!require('./support-materials.cjs').materials[opt.support])throw Error('不支持的结构材料');
 const source=fs.readFileSync(opt.input),raw=parse(source,{maxNotes:1000000}),song=normalize(raw,opt);
 progress({phase:'parsed',notes:song.notes.length,events:song.events.length,warnings:song.warnings});
 progress({phase:'log',message:'毒曲使用固定截面同步总线，CPU 直接生成；不受搜索预算、并行线路上限和原比例限制影响。'});
 const template=auditTemplate();let body=designToxic(song,opt,progress);
 progress({phase:'log',message:'正在连接各层同步入口，并在启动区生成每游戏刻传送控制器。'});
 const tag='nbs_'+crypto.randomBytes(6).toString('hex'),quinnAdapter=require('./quinn.cjs'),extendedAdapter=require('./extended-noteblock.cjs'),m=extendedAdapter.attach(quinnAdapter.attach(addControl(body,tag),opt),opt);
 body=extendedAdapter.attach(quinnAdapter.attach(body,opt),opt);
 // Source-preserving comparison includes duplicate notes and their layer IDs.
 const sig=n=>[n.sourceMusicTick??n.tick,n.layer,n.instrument,n.key].join();
 const actual=m.notes.map(sig).sort(),expected=song.notes.map(sig).sort();
 if(actual.length!==expected.length||actual.some((v,i)=>v!==expected[i]))throw Error('毒曲源音符审计失败');
 const name=(opt.name||raw.name||path.basename(opt.input,'.nbs')).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,90)||'毒曲';
 const stamp=new Date().toISOString().replace(/[:.]/g,'-'),dir=path.resolve(opt.output,name+'_'+stamp);fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,name+'.litematic');progress({phase:'log',message:`正在分区导出 ${m.blocks.length} 个方块；保留全部 ${m.notes.length} 个音符。`});
 const format=require('./litematic.cjs').write(file,m,{name,target:opt.target});
 const min=m.bounds.map(b=>b[0]),local=p=>p.map((v,i)=>v-min[i]),dimensions={x:body.dimensions[0],z:body.dimensions[2],y:body.dimensions[1]};
 const counts={};for(const b of m.blocks){const id=b.block.split('[')[0];counts[id]=(counts[id]||0)+1}
 const materials=Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([id,count])=>({id,count,stacks:Math.floor(count/64),remainder:count%64}));
 const maxAdvance=m.follow.points.reduce((a,p,i,all)=>i?Math.max(a,Math.abs(p.target[0]-all[i-1].target[0])):a,0);
 const warnings=[...song.warnings,'毒曲保留重复音符；客户端可同时混音的声音数量有限，数百音符物理触发不保证全部可听。','每游戏刻传送一次，在高速推进区间可能有部分音符超出听音距离。','本布局仅完成模板电路和源事件静态检查，未经本次整曲游戏演奏。','命令方块的相对坐标不随投影旋转；请保持原始朝向，不要旋转或镜像。'];
 const report={programVersion:'2.10.0',template:'toxic-synchronous-banks',timeResolution:Number(opt.timeResolution??10),name,input:path.resolve(opt.input),sourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),target:opt.target,nbsVersion:raw.version,sourceTempo:raw.tempo,options:opt,dimensions,volume:body.volume,blocks:body.blocks.length,totalBlocks:m.blocks.length,notes:m.notes.length,physicalNotes:m.notes.length,onsets:new Set(song.notes.map(n=>n.tick)).size,durationSeconds:song.notes.at(-1).tick/10,schematicDimensions:{x:m.dimensions[0],z:m.dimensions[2],y:m.dimensions[1]},schematicVolume:m.volume,button:local(m.button),inputs:[],externalStartWiresIncluded:true,search:{actualAspect:Math.max(dimensions.x,dimensions.z)/Math.min(dimensions.x,dimensions.z),workerErrors:[],seconds:(Date.now()-started)/1000,attempts:1,improvements:1,optimality:'固定截面直接生成；没有全局最优证明。'},toxic:{peak:body.toxic.peak,banks:body.toxic.banks,layers:body.toxic.layers,capacity:body.toxic.capacity,phases:body.toxic.phases,stripes:body.toxic.stripes,widthLimit:100,heightLimit:100,lengthLimit:null,bodyOrigin:local(body.bounds.map(b=>b[0])),startupRedstoneTicks:m.externalStart.addedStartupRedstoneTicks+2,buttonPulseAccepted:true},follow:{tag,intervalGameTicks:1,controller:local(m.follow.controller),objective:m.follow.objective,loadedCornerChunks:m.follow.loadedCornerChunks.map(local),commandBlocks:m.commandBlocks.length,maximumAdvancePerGameTick:maxAdvance,maximumAdvancePerSecond:maxAdvance*20,recommendedSimulationDistance:Math.max(5,Math.ceil(maxAdvance*20/16)+3),targetMode:'fixed-body-centerline',yaw:-90,pitch:0,facing:'+X pending music',points:m.follow.points.map(p=>({...p,position:local(p.position),target:local(p.target),bounds:p.bounds.map((b,i)=>b.map(v=>v-min[i]))})),rotationSupported:false},audit:{pass:false,status:'template-and-source-checked',scope:'最大密度模板的独立上升沿电路、源音符逐项含重复校验、100 格截面与空间冲突检查；非完整 Minecraft 模拟。',template,exactSourceEvents:true,notesRetained:m.notes.length,startup:m.externalStart.audit},format,warnings,materials,runtimeVerified:false,schematic:file,folder:dir};
 report.quinn=quinnAdapter.details(m,dir);report.extendedNoteblock=extendedAdapter.details(m,dir);
 fs.writeFileSync(path.join(dir,'转换报告.json'),JSON.stringify(report,null,2));
 fs.writeFileSync(path.join(dir,'材料清单.csv'),'\ufeff方块ID,数量,整组数,余数\r\n'+materials.map(r=>[r.id.includes(':')?r.id:'minecraft:'+r.id,r.count,r.stacks,r.remainder].join(',')).join('\r\n'));
 fs.writeFileSync(path.join(dir,'命令方块配置.json'),JSON.stringify(m.commandBlocks.map(c=>({...c,position:local(c.position)})),null,2));
 const guide=`${name} — 毒曲模式（Java ${opt.target}）\n\n音乐主体 X × Z × 高：${dimensions.x} × ${dimensions.z} × ${dimensions.y}。长度不设几何上限，宽高均不超过 100。启动区不计主体尺寸；完整投影 ${m.dimensions[0]} × ${m.dimensions[2]} × ${m.dimensions[1]}。\n音符 ${m.notes.length} 个，最大同时 ${body.toxic.peak} 音；没有删除重复音符或把和弦拆开播放。\n\n1. 加载全部 ${format.regions} 个投影区域，保持原朝向，不旋转、不镜像。音符盒上方保持空气，沙子下的支撑不能拆。\n2. 命令方块必须由有权限的玩家粘贴，且要保留方块实体 NBT；只放空命令方块不会自动写入命令。手动配置见命令方块配置.json。服务器需 enable-command-block=true。\n3. 先用创造模式站到启动按钮附近，按下相对投影原点 ${report.button.join(', ')} 处的石按钮。按钮同时启动音乐和绑定附近最近一名玩家。按下后切到旁观模式：固定中轴线可能在方块内部，旁观模式本身不能按按钮。控制线已连接，不要再给其他入口单独触发。\n4. 从音乐主线开始，每 1 游戏刻（正常 20 TPS 下每秒 20 次）传送这位听者到音乐主体的固定中轴线上：高度和横向位置始终不变，仅 X 跟随当前发声片区中心前进；命令只控制跟随，声音全部由实体音符盒发出。传送控制器与启动线放在一起，逐刻选择当前起音片区，水平朝向 +X 的待播放方向（yaw -90、pitch 0）；休止时保持原位置；末尾自动解除绑定。\n5. 建议模拟距离与视距至少 ${report.follow.recommendedSimulationDistance} 区块，并确保所有层同时加载。超长结构必须随播放持续加载前方区块；控制器至多临时强加载 4 个区块，结束时仅释放本次新加载的区块，原有强加载不移除。联机由服务器模拟距离决定。低 TPS 时音乐和跟随均按游戏刻变慢。\n6. 正常按钮长脉冲可用；请等曲末后至少 3 秒再启动。中途退出可执行 /tag @s remove ${tag}，会停止自己的跟随，但不会倒退已传播的红石信号。重播前请使整机全部断电复位。\n7. 每游戏刻最大前进 ${maxAdvance} 格；正常 20 TPS 下每秒 20 次传送。无法保证所有音符等响；大量声音还受客户端混音限制。\n\n${body.phase20?'20t 启动区命令控制器将按钮转换为 2 游戏刻脉冲，随后错拍启动器驱动实体红石和音符盒；不用命令播放声音。\n':''}共同音乐启动延迟约 ${report.toxic.startupRedstoneTicks/10} 秒（从总入口收到电力起）。音乐内部时间不变。\n资源限制：最多读取 1,000,000 音符、32 MB NBS、60 分钟（逐刻控制链另限 65,536 条命令，约 54 分钟）；当前同步截面上限 ${body.toxic.capacity} 音/起音时刻。超出会明确报错，绝不静默丢音。\n\n检查：${report.audit.scope}\n此次整曲未实机演奏验证。\n\n${warnings.join('\n')}\n`;
 fs.writeFileSync(path.join(dir,'使用说明.txt'),'\ufeff'+extendedAdapter.guide(quinnAdapter.guide(guide,m),m));
 fs.writeFileSync(path.join(dir,'层预览.json'),JSON.stringify({size:[Math.min(256,m.dimensions[0]),m.dimensions[1],m.dimensions[2]],fullSize:m.dimensions,previewClipped:m.dimensions[0]>256,button:report.button,blocks:m.blocks.filter(b=>b.position[0]-min[0]<256).map(b=>[...local(b.position),b.block.split('[')[0]])}));
 if(opt.debug)fs.writeFileSync(path.join(dir,'layout.json'),JSON.stringify(m));
 progress({phase:'done',report});return report;
}
module.exports={convertToxic};
