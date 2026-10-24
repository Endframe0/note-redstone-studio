'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {parse}=require('./music-source.cjs'),{normalize}=require('./normalize.cjs'),{search}=require('./search.cjs'),{write}=require('./litematic.cjs');
const send=o=>process.stdout.write(JSON.stringify(o)+'\n');
const cn={cobblestone:'圆石',stone:'石头',light_gray_wool:'淡灰色羊毛',glass:'玻璃',lime_stained_glass:'黄绿色玻璃输入标记',green_stained_glass:'绿色玻璃输入标记',redstone_wire:'红石粉',repeater:'红石中继器',note_block:'音符盒',stone_button:'石按钮',lime_concrete:'黄绿色混凝土',sand:'沙子',dirt:'泥土',oak_planks:'橡木木板',white_wool:'白色羊毛',clay:'黏土块',gold_block:'金块',packed_ice:'浮冰',bone_block:'骨块',iron_block:'铁块',soul_sand:'灵魂沙',pumpkin:'南瓜',emerald_block:'绿宝石块',hay_block:'干草捆',glowstone:'荧石',waxed_copper_block:'涂蜡铜块',waxed_exposed_copper:'涂蜡斑驳的铜块',waxed_weathered_copper:'涂蜡锈蚀的铜块',waxed_oxidized_copper:'涂蜡氧化的铜块'};
function convert(opt,progress=send){
 if(opt.adaptive||opt.timing==='auto'||opt.soundEngine==='auto'||require('./music-source.cjs').isMidi(opt.input)){
  const planned=require('./adaptive.cjs').inspect(opt);opt={...planned.options,adaptiveSummary:planned.summary};
  progress({phase:'adaptive',summary:planned.summary});
  for(const message of planned.summary.messages)progress({phase:'log',message});
 }
 if(Number(opt.timeResolution??10)===20&&(!require('./versions.cjs').supports(opt.target,'compression')||!['volume','toxic',undefined].includes(opt.objective)))throw Error('20t 支持体积优先和毒曲模式；极限省材请使用 10t。');
 if(opt.objective==='toxic')return require('./toxic-convert.cjs').convertToxic(opt,progress);
 opt={externalInputs:true,maxTracks:8,maxX:80,maxZ:80,maxY:48,maxSpatialAspect:2,maxListeningRadius:40,...opt};
 if(!['volume','materials'].includes(opt.objective||'volume'))throw Error('未知优化目标');
 if(opt.objective==='materials'){opt={...opt,maxX:512,maxY:384,maxZ:512,maxAspect:0,maxSpatialAspect:0,maxListeningRadius:0,backend:'cpu'};}
 const modern=require('./versions.cjs').supports(opt.target,'compression');
 opt.separateSnare=modern&&opt.externalInputs&&Number(opt.maxTracks)>=2;opt.sandPacking=modern&&opt.externalInputs;opt.stagedSearch=true;
 if(opt.autoStartWiring&&!opt.externalInputs)throw Error('自动外部启动线需要启用外部同步入口。');
 if(opt.heavyCore&&(!require('./versions.cjs').supports(opt.target,'heavyCore')||!opt.externalInputs))throw Error('沉重核心模板需要 Java 1.21 或更新版本，以及外部同步入口。');

 if(!require('./versions.cjs').get(opt.target))throw Error('不支持的游戏版本');
 if(!require('./support-materials.cjs').materials[opt.support||'cobblestone'])throw Error('不支持的结构材料');
 if(opt.sandPacking&&(!require('./versions.cjs').supports(opt.target,'compression')))throw Error('沙子层间压缩实验目前需要 Java 26.1.2。');
 if(opt.separateSnare&&(!require('./versions.cjs').supports(opt.target,'compression')||!opt.externalInputs||Number(opt.maxTracks)<2))throw Error('沙子独立音轨需要 Java 26.1.2 和至少两个同步外部入口。');
 if(opt.backend==='gpu'&&(opt.heavyCore||opt.experimentalPhraseReuse||opt.sandPacking||opt.separateSnare))opt.stagedSearch=true;
 const source=fs.readFileSync(opt.input),raw=parse(source),song=normalize(raw,opt);progress({phase:'parsed',notes:song.notes.length,events:song.events.length,warnings:song.warnings});
 if(song.denseChordCount){const needed=Math.max(2,Math.ceil(Math.max(...song.events.map(e=>e.notes.length))/17));if(!opt.externalInputs||Number(opt.maxTracks)<needed)throw Error(`当前密集和弦模板需要至少 ${needed} 条同步线路，请提高“并行线路上限”并使用外部同步入口。`);}
 progress({phase:'log',message:Number(opt.timeResolution??10)===20?'20t 模式跳过乐句复用检查，准备奇偶分轨搜索。':'正在一次性分析歌曲重复度；随后共同搜索可用模板。'});
 const reuse=Number(opt.timeResolution??10)===20?{summary:{enabled:false,reason:'20t 首版隔离奇偶相位，暂不使用乐句复用'},analysis:null}:require('./reuse-policy.cjs').inspectReuse(song,opt);opt.experimentalPhraseReuse=reuse.summary.enabled;
 progress({phase:'reuse-analysis',...reuse.summary});
 const sourceHash=crypto.createHash('sha256').update(source).digest('hex');
 const musicKey=crypto.createHash('sha256').update(source).update(JSON.stringify([opt.target||'26.1.2',opt.support||'cobblestone',opt.speed??1,opt.transpose??0,opt.timing||'strict',opt.pitch||'strict',opt.soundEngine||'vanilla',Number(opt.timeResolution??10),'optimizer-v3-midi-envelope',opt.midiTimingMode,opt.midiSpeedTolerance,opt.midiFadeInMs,opt.midiFadeOutMs,opt.midiEnvelope,opt.objective||'volume'])).digest('hex');
 const cacheKey=crypto.createHash('sha256').update(musicKey).update(JSON.stringify([opt.maxX??128,opt.maxY??19,opt.maxZ??128,opt.maxAspect??1.5,opt.externalInputs,opt.maxTracks,opt.maxSpatialAspect,opt.maxListeningRadius])).digest('hex'),cacheDir=path.join(path.resolve(opt.output),'.search-cache'),archiveFile=path.join(cacheDir,musicKey+'.archive.json');
 let archive=[];try{archive=JSON.parse(fs.readFileSync(archiveFile)).candidates||[]}catch{}
 let known=[];try{known=JSON.parse(fs.readFileSync(path.join(__dirname,'known-layouts.json')))[sourceHash]||[]}catch{}
 const searchOptions={...opt,reuseDecision:reuse.summary,motifAnalysis:reuse.analysis,seedParams:[...(opt.seedParams||[]),...archive.map(a=>a.params),...known],checkpoint:opt.checkpoint||path.join(cacheDir,cacheKey+'.json')};
 let pipeline=Number(opt.timeResolution??10)===20?require('./phase20-search.cjs').search20(song,searchOptions,progress):opt.objective==='materials'?require('./material-search.cjs').searchMaterials(song,searchOptions,progress):opt.stagedSearch?require('./portfolio-search.cjs').searchPortfolio(song,searchOptions,progress):null;let m=pipeline?pipeline.manifest:search(song,searchOptions,progress);if(opt.sandPacking&&!pipeline)m=require('./sand-layer-packing.cjs').compactSandLayers(song,m,opt,progress);const name=(opt.name||raw.name||path.basename(opt.input,'.nbs')).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,90)||'红石音乐';
 if(opt.heavyCore&&!pipeline){const previous=m.search,result=require('./heavy-core-search.cjs').searchHeavyCore(song,m,opt,progress);m=result.manifest;m.search={...previous,tracks:m.inputs.length,bestVolume:m.volume,actualAspect:require('./objective.cjs').aspect(m.dimensions),attempts:previous.attempts+(result.stats.builds||0),seconds:previous.seconds+(result.stats.seconds||0),heavyCore:result.stats};}
 if(m.search.workerErrors.length)song.warnings.push(`有 ${m.search.workerErrors.length} 个搜索线程报错；保留其他线程找到并通过检查的最优方案，详情见报告。`);
 if(opt.separateSnare&&!pipeline){
  const previous=m.search,result=require('./snare-split-search.cjs').searchSnareSplit(song,m,opt,progress);m=result.manifest;
  m.search={...previous,tracks:m.inputs.length,actualAspect:require('./objective.cjs').aspect(m.dimensions),bestVolume:m.volume,improvementPercent:100*(1-m.volume/previous.baselineVolume),attempts:previous.attempts+result.stats.builds+result.stats.poses,improvements:previous.improvements+result.stats.improvements,seconds:previous.seconds+result.stats.seconds,snareSplit:result.stats,optimality:'有限 CPU 搜索，沙子独立音轨计入全部内部延时；未证明全局最小，新导出需实机验证。'};
 }
 if(!m.hybridNetwork&&!m.phase20)archive.push({volume:m.volume,dimensions:m.dimensions,params:m.searchParams||m.parallelParams||{cap:m.cap,rows:m.rows,counts:m.rowInfo.map(r=>r.count),rowShifts:m.rowShifts,spacing:m.spacing,branchMode:m.branchMode,buttonMode:m.buttonMode}});archive.sort((a,b)=>{const f=require('./objective.cjs').shapePenalty;return a.volume*f(a.dimensions,opt)-b.volume*f(b.dimensions,opt)});archive=[...new Map(archive.map(a=>[JSON.stringify(a.params),a])).values()].slice(0,24);fs.mkdirSync(cacheDir,{recursive:true});fs.writeFileSync(archiveFile+'.tmp',JSON.stringify({version:2,candidates:archive}));fs.renameSync(archiveFile+'.tmp',archiveFile);
 let reuseResult=pipeline?.reuseResult||null;
 if(opt.experimentalPhraseReuse&&!pipeline){
  reuseResult=require('./phrase-hybrid-search.cjs').searchPhraseHybrids(song,m,opt,progress);
  if(reuseResult.recipe){
   const oldSearch=m.search;m=reuseResult.manifest;
   m.search={...oldSearch,tracks:m.inputs.length,actualAspect:require('./objective.cjs').aspect(m.dimensions),bestVolume:m.volume,improvementPercent:100*(1-m.volume/oldSearch.baselineVolume),attempts:oldSearch.attempts+reuseResult.stats.residualBuilds+reuseResult.stats.corePlacements+reuseResult.stats.attemptedRecipes,improvements:oldSearch.improvements+reuseResult.stats.improvements,seconds:oldSearch.seconds+reuseResult.stats.seconds,reuse:reuseResult.stats,optimality:'有限 CPU 搜索，含全部复用控制器和内部连线；仅分部静态检查，未证明整机复播或全局最小。'};
   m.audit={pass:false,status:'component-checks-only',scope:m.compositionChecks.scope};
   song.warnings.push('此布局使用实验乐句复用：当前新导出未自动进行整曲原版实机演奏；分部检查不代表完整漏斗复位通过。');
  }
 }
 require('./support-materials.cjs').replaceCanonicalSupports(m,opt.support||'cobblestone');
 let exported=pipeline?.exported||m;
 if(pipeline?.exported)require('./support-materials.cjs').replaceCanonicalSupports(exported,opt.support||'cobblestone');
 if(opt.autoStartWiring&&!pipeline?.exported){progress({phase:'log',message:'正在连接外部同步启动线、补齐延迟并检查；不参与主体包围盒计算。'});exported=m.phase20?require('./phase-start.cjs').connectPhaseStart(m):require('./external-start.cjs').connectExternalStart(m,opt)}
 const quinnAdapter=require('./quinn.cjs'),extendedAdapter=require('./extended-noteblock.cjs');
 m=extendedAdapter.attach(quinnAdapter.attach(m,opt),opt);exported=extendedAdapter.attach(quinnAdapter.attach(exported,opt),opt);
 if(m.quinn){
  if(opt.objective!=='materials'&&!require('./objective.cjs').fits(m.dimensions,opt))throw Error('Quinn 幽匿脉络计入后超过主体尺寸或比例限制；请适当放宽限制重新搜索。');
  m.search={...m.search,bestVolume:m.volume,actualAspect:require('./objective.cjs').aspect(m.dimensions)};
 }
 const out=path.resolve(opt.output);fs.mkdirSync(out,{recursive:true});const stamp=new Date().toISOString().replace(/[:.]/g,'-'),dir=path.join(out,name+'_'+stamp);fs.mkdirSync(dir);
 const file=path.join(dir,name+'.litematic'),format=write(file,exported,{name,target:opt.target||'26.1.2'}),min=exported.bounds.map(b=>b[0]),local=p=>p.map((v,i)=>v-min[i]);
 const material={};for(const b of exported.blocks){const id=b.block.split('[')[0];material[id]=(material[id]||0)+1}
 Object.assign(cn,require('./support-materials.cjs').materials);
 Object.assign(cn,{scaffolding:'脚手架',iron_trapdoor:'铁活板门',observer:'侦测器',hopper:'漏斗',comparator:'红石比较器',redstone_wall_torch:'红石火把',waxed_copper_bulb:'涂蜡铜灯',heavy_core:'沉重核心',sculk_vein:'幽匿脉络','extendednoteblock:extended_note_block':'扩展音符盒'});
 const materials=Object.entries(material).sort((a,b)=>b[1]-a[1]).map(([id,count])=>({id,name:cn[id]||id,count,stacks:Math.floor(count/64),remainder:count%64}));
 const report={programVersion:'2.11.0',listening:require('./objective.cjs').listeningGeometry(m),template:m.parallelParams?.template||m.branchMode||'delayed',name,sourceType:raw.sourceType||'nbs',midi:song.midiConversion||null,input:path.resolve(opt.input),sourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),nbsVersion:raw.version,sourceTempo:raw.sourceType==='midi'?null:raw.tempo,target:opt.target||'26.1.2',options:opt,dimensions:{x:m.dimensions[0],z:m.dimensions[2],y:m.dimensions[1]},volume:m.volume,blocks:m.blocks.length,notes:m.notes.length,onsets:new Set(song.notes.map(n=>n.tick)).size,timingCells:song.events.length,durationSeconds:song.midiConversion?.durationSeconds??song.notes.at(-1).tick/10,firstNoteSeconds:song.notes[0].tick/10,button:m.button?local(m.button):null,inputs:(m.inputs||[]).map(i=>({...i,marker:local(i.marker),repeater:local(i.repeater),wire:local(i.wire)})),externalStartWiresIncluded:false,search:m.search,audit:m.audit,format,warnings:song.warnings,materials,schematic:file,folder:dir};
 report.timeResolution=Number(opt.timeResolution??10);if(m.phase20)report.phase20={...m.phase20,startupOutsideBody:true,externalWiringIncluded:!!opt.autoStartWiring};
 report.reuseDecision=reuse.summary;report.quinn=quinnAdapter.details(exported,dir);report.extendedNoteblock=extendedAdapter.details(exported,dir);
 if(report.extendedNoteblock){report.runtimeVerified=false;report.physicalNotes=report.extendedNoteblock.physicalNotes;}
 if(report.quinn){report.runtimeVerified=false;report.physicalNotes=report.quinn.physicalNotes;}
 if(opt.objective==='materials')report.materialOptimization={metric:'placed-blocks-plus-container-fill',units:require('./material-search.cjs').materialCost(exported),bodyUnits:require('./material-search.cjs').materialCost(m),externalWiringIncluded:Boolean(opt.autoStartWiring),forcedReuse:true,phraseModules:reuseResult.recipe.phrases.length,baselineUnits:m.search.baselineMaterialUnits,difference:m.search.materialDifference,globalMinimumProven:false};
 report.nbsLayers={declared:raw.declaredLayerCount,referenced:raw.referencedLayerCount,effective:raw.layerCount,metadata:raw.metadataLayerCount};
 if(exported.externalStart){
  const info=exported.externalStart,point=i=>({...i,marker:local(i.marker),repeater:local(i.repeater),wire:local(i.wire)});
  report.externalStartWiresIncluded=true;
  report.externalStart={...info,commonInput:point(info.commonInput),originalInputs:info.originalInputs.map(point),bodyOrigin:local(m.bounds.map(b=>b[0]))};
  report.schematicDimensions={x:exported.dimensions[0],z:exported.dimensions[2],y:exported.dimensions[1]};
  report.schematicVolume=exported.volume;report.totalBlocks=exported.blocks.length;
  report.listening.center=report.listening.center.map((v,i)=>v+report.externalStart.bodyOrigin[i]);
  report.runtimeVerified=false;
 }
 if(m.denseChord){report.denseChord=m.denseChord;report.runtimeVerified=false;song.warnings.push(`密集和弦已拆成 ${m.inputs.length} 条同步线路；保留全部音符和原时序，绿色入口必须同刻启动。新布局未经实机演奏。`);}
 if(m.sandPacking)report.sandPacking=m.sandPacking;
 const coreCount=m.blocks.filter(b=>b.block.split('[')[0]==='heavy_core').length;
 if(coreCount){report.heavyCore={enabled:true,coreCount,runtimeVerified:false};report.runtimeVerified=false;report.programVersion='2.8.5-experimental';song.warnings.push(`此方案使用 ${coreCount} 个沉重核心替换小鼓沙子底座，不需要沙子承托。新布局仍需实机验证。`);}
 if(m.snareSplit){report.programVersion='2.8.5-experimental';report.snareSplit=m.snareSplit;report.runtimeVerified=false;fs.writeFileSync(path.join(dir,'沙子拆轨参数.json'),JSON.stringify(m.snareSplit.recipe,null,2));}
 if(reuseResult)report.reuseSearch=reuseResult.stats;
 if(pipeline)report.pipeline=pipeline.stats;
 if(reuseResult?.recipe){
  report.programVersion='2.8.5-experimental';report.physicalNotes=m.extendedNoteblock?.physicalNotes??m.blocks.filter(b=>b.block.startsWith('note_block[')).length;report.compositionChecks=m.compositionChecks;report.runtimeVerified=false;
  report.containers=(m.containers||[]).map(c=>({...c,position:local(c.position)}));report.safeRestartAfterTicks=m.safeRestartAfterTicks+(exported.externalStart?.addedStartupRedstoneTicks||0);
  const fill=new Map();for(const c of report.containers)for(const item of c.inventory)fill.set(item.id,(fill.get(item.id)||0)+item.count);report.containerFill=[...fill].map(([id,count])=>({id,count,stacks:Math.floor(count/64),remainder:count%64}));
  fs.writeFileSync(path.join(dir,'复用布局参数.json'),JSON.stringify(reuseResult.recipe,null,2));
 }
 fs.writeFileSync(path.join(dir,'转换报告.json'),JSON.stringify(report,null,2));
 fs.writeFileSync(path.join(dir,'材料清单.csv'),'\ufeff材料,方块ID,数量,整组数,余数\r\n'+materials.map(r=>[r.name,r.id.includes(':')?r.id:'minecraft:'+r.id,r.count,r.stacks,r.remainder].join(',')).join('\r\n')+(report.containerFill||[]).map(r=>'\r\n'+['漏斗填充物（不含在建筑方块数中）',r.id,r.count,r.stacks,r.remainder].join(',')).join(''));
 const startInstructions=report.externalStart?`4. 已自动连接 ${report.inputs.length} 个原入口，补齐各路延迟。只需给总入口提供一次 1 红石刻（2 游戏刻）的红石脉冲；不要把普通按钮的长脉冲直接接入。\r\n   总入口：绿色玻璃 ${report.externalStart.commonInput.marker.join(', ')}；中继器 ${report.externalStart.commonInput.repeater.join(', ')}；接入点 ${report.externalStart.commonInput.wire.join(', ')}；信号方向 ${report.externalStart.commonInput.direction.join(', ')}。接入红石粉及其玻璃支撑已包含在投影中。\r\n   外部线路增加共同启动延迟 ${(report.externalStart.addedStartupRedstoneTicks/10).toFixed(1)} 秒，歌曲内部时序不变。等待曲末信号完全消退再重播。`:report.inputs.length?`4. 共有 ${report.inputs.length} 个绿色玻璃标记的输入中继器，全部需在同一游戏刻收到红石上升沿。外部线路由用户自行连接；不包含在投影或本体尺寸中。\r\n${report.inputs.map((i,n)=>`   输入 ${n+1}：玻璃 ${i.marker.join(', ')}；中继器 ${i.repeater.join(', ')}；接入红石粉 ${i.wire.join(', ')}；信号方向 ${i.direction.join(', ')}；起始时刻 0。`).join('\r\n')}\r\n   接入坐标允许位于投影边界外。输入红石粉下需自行加支撑，外部各路须等延迟同步。测试使用 1 红石刻脉冲；等待曲末信号完全消退再重播。`:`4. 绿色底座上的石按钮启动，投影相对坐标 ${report.button?.join(', ')}。等上一遍结束再按。`;
 const text=`${name} — 红石投影\r\n\r\n尺寸：${m.dimensions[0]} × ${m.dimensions[2]} × ${m.dimensions[1]}（X × Z × 高度）\r\n水平长短边比：${m.search.actualAspect.toFixed(3)}（上限 ${m.search.maxAspect||'不限'}）\r\n三维最大/最小边：${report.listening.spatialAspect.toFixed(3)}（上限 ${opt.maxSpatialAspect||'不限'}）；中心到最远角点 ${report.listening.boxRadius.toFixed(2)} 格（上限 ${opt.maxListeningRadius||'不限'}）。\r\n中心参考耳位：${report.listening.center.join(', ')}（相对投影原点，含小数）；最远音符 ${report.listening.maxNoteDistance.toFixed(2)} 格。未预留实体站位，未建造试听台；不应在电路中随意增减方块。音量随距离衰减，不保证各音等响。\r\n包围盒体积：${m.volume} 格；实际方块：${m.blocks.length}；音符：${m.notes.length}\r\n${song.midiConversion?.envelope.preserved?"曲中最后音符结束（按设定时长）":"曲中最后起音"}：${report.durationSeconds.toFixed(2)} 秒；输入中继器 / 分支有共同启动延迟。\r\n目标版本：Java ${report.target}\r\n\r\n使用：\r\n1. 将 .litematic 放进当前游戏目录的 schematics 文件夹，在 Litematica 中加载并放置。\r\n2. 在空旷区域按投影从下往上搭建，保留内部空气；音符盒上方必须为空气。\r\n3. 音符盒音高与中继器档位都在投影方块状态内；生存施工需要逐个调准。\r\n${startInstructions}\r\n5. 演奏期间保持整个结构处于模拟距离内。音符声音有传播范围，启用试听距离限制时，以报告中的中心参考耳位测算；偏离该点或站在地面会改变距离。\r\n6. 输出不含外部同步启动线、按钮控制台、顶部试听台、命令方块或外部播放器。\r\n\r\n压缩：${m.search.optimality}\r\n搜索 ${m.search.attempts} 个候选，${m.search.improvements} 次有效改进。\r\n检查：${m.audit.scope}\r\n模板来自此前实机演奏过的折叠结构；本次新布局仅完成静态检查，未经逐曲实机演奏验证。\r\n\r\n音乐处理：\r\n${song.warnings.join('\r\n')}\r\n\r\n材料清单按最终方块统计，包含保持乐器所需的底座；并非全部拆解后的合成原料。\r\n`;
 const guide=report.containers?text.replace('等待曲末信号完全消退再重播。',`从启动起至少等待 ${Math.ceil(report.safeRestartAfterTicks/10)} 秒，供漏斗回流后再重播。`).replace('模板来自此前实机演奏过的折叠结构；本次新布局仅完成静态检查，未经逐曲实机演奏验证。','本次为实验乐句复用布局，已重建源音符和实际控制电路并完成分部检查；本次新导出未经完整原版首次播放、回流和复播验证。')+`\r\n复用电路施工：\r\n${report.externalStart?'只向总入口接入 1 红石刻脉冲；原绿色入口已自动同步。':'所有绿色入口必须在同一游戏刻收到 1 红石刻脉冲。'}铜灯初始关闭。\r\n${report.containers.map(c=>`漏斗 ${c.position.join(', ')}：`+c.inventory.map(i=>`槽 ${i.slot}，${cn[i.id.replace('minecraft:','')]||i.id} ${i.count} 个`).join('；')).join('\r\n')}\r\n未列出的漏斗初始为空。投影包含库存 NBT，手工施工需按上述数量装填。填充物另列材料清单，未计入建筑方块数量。\r\n每次从启动起至少等待 ${Math.ceil(report.safeRestartAfterTicks/10)} 秒再启动，不能仅以音乐结束判断计时器复位。\r\n`:text;
 let finalGuide=report.externalStart?guide.replace('尺寸：','主体尺寸（不含外部启动线）：').replace(`包围盒体积：${m.volume} 格；实际方块：${m.blocks.length}`,`主体包围盒体积：${m.volume} 格；主体方块：${m.blocks.length}；含外部线共 ${exported.blocks.length} 个方块`).replace('6. 输出不含外部同步启动线、按钮控制台、顶部试听台、命令方块或外部播放器。',`6. 输出包含外部同步启动线，共 ${report.externalStart.externalBlockCount} 个额外方块；全部材料已计入清单。主体优化不计外部线；Litematica 整体包围盒必须容纳所有方块，实际为 ${exported.dimensions[0]} × ${exported.dimensions[2]} × ${exported.dimensions[1]}（X × Z × 高度）。本投影不包含按钮脉冲发生器或试听台。`)+`\r\n主体原点（相对完整投影）：${report.externalStart.bodyOrigin.join(', ')}。各入口坐标与预览均相对完整投影原点。\r\n外部连线检查：${report.externalStart.audit.scope} 本次导出未经逐曲实机验证。\r\n`:guide;
 if(m.phase20){
  const explanation=report.externalStart?'错拍延时器已放在外部启动区，不计主体包围盒。只向总入口提供一次 2 游戏刻脉冲；普通按钮长脉冲不可直接接入。脚手架初始 distance=0、活板门关闭，必须保留投影状态。':'外部线路未导出。偶数相位入口需在同一刻启动，奇数相位入口整体晚 1 游戏刻；两相位各自使用 2 游戏刻脉冲，不能全部同刻启动。';
  finalGuide='20t / 每秒20个发声时刻（正常20 TPS）\r\n'+explanation+'\r\n音乐主体与外部启动器分别统计，完整投影包围盒仍覆盖所有方块。此模式首版暂不使用乐句复用。\r\n\r\n'+finalGuide;
  if(!report.externalStart){finalGuide=finalGuide.replace('全部需在同一游戏刻收到红石上升沿。','需按奇偶相位错开 1 游戏刻启动。').replaceAll('起始时刻 0。','相位见下表。').replace('外部各路须等延迟同步。','相位内部等延迟，奇数相位比偶数相位晚 1 游戏刻。');finalGuide+='\r\n相位表（游戏刻）\r\n'+report.inputs.map((i,n)=>'输入 '+(n+1)+'：相对偏移 '+(i.phaseGameTicks||0)+' 游戏刻').join('\r\n');}
 }
 fs.writeFileSync(path.join(dir,'使用说明.txt'),'\ufeff'+extendedAdapter.guide(quinnAdapter.guide(finalGuide,exported),exported));
 fs.writeFileSync(path.join(dir,'层预览.json'),JSON.stringify({size:exported.dimensions,bodyOrigin:report.externalStart?.bodyOrigin,button:report.button,blocks:exported.blocks.map(b=>[...local(b.position),b.block.split('[')[0]])}));
 if(opt.debug)fs.writeFileSync(path.join(dir,'layout.json'),JSON.stringify(exported));
 progress({phase:'done',report});return report;
}
if(require.main===module){try{const args=process.argv.slice(2);if(args.length!==1)throw Error('用法：node engine/cli.cjs config.json');convert(JSON.parse(fs.readFileSync(args[0],'utf8').replace(/^\uFEFF/,'')))}catch(e){send({phase:'error',message:e.message});process.exitCode=1}}
module.exports={convert};
