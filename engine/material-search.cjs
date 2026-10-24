'use strict';
const fs=require('node:fs');
const {toneKey,eventKey}=require('./note-volume.cjs');
const {designPhraseReuse}=require('./phrase-reuse-layout.cjs');
const {designChordBus}=require('./chord-bus-layout.cjs');
const {transform,measure,splitSong}=require('./parallel-layout.cjs');
const {auditSignals}=require('./signal-audit.cjs');
const signature=notes=>notes.map(eventKey).sort().join(';');
function materialCost(m){return m.blocks.length+(m.quinn?0:(m.quinnCoverCost||0))+(m.containers||[]).reduce((s,c)=>s+c.inventory.reduce((a,i)=>a+i.count,0),0)}
const better=(a,b)=>!b||materialCost(a)<materialCost(b)||materialCost(a)===materialCost(b)&&a.volume<b.volume;
function asSong(notes){const groups=new Map();for(const n of notes){if(!groups.has(n.tick))groups.set(n.tick,[]);groups.get(n.tick).push(n)}return{notes,events:[...groups].sort((a,b)=>a[0]-b[0]).map(([tick,notes])=>({tick,notes}))}}
// Independent modules are separated by four air cells. Volume does not rank
// candidates. Only the Minecraft height and bounded exporter allocation remain.
function compose(models,columns=1){
 const rows=[];for(let i=0;i<models.length;i+=columns)rows.push(models.slice(i,i+columns));
 let z=0;const placed=[];
 for(const row of rows){let x=0,height=0;for(const m of row){const p=transform(m,{offset:[x-m.bounds[0][0],-m.bounds[1][0],z-m.bounds[2][0]]});placed.push(p);x+=m.dimensions[0]+4;height=Math.max(height,m.dimensions[2])}z+=height+4}
 const m=measure({blocks:placed.flatMap(p=>p.blocks),notes:placed.flatMap(p=>p.notes),inputs:placed.flatMap(p=>p.inputs),containers:placed.flatMap(p=>p.containers||[]),groups:[],connections:[],clockSolids:[],rowInfo:[],hybridNetwork:true,hopperTimer:{experimental:true},template:'material-phrase-reuse',branchMode:'material-phrase-reuse',safeRestartAfterTicks:Math.max(...models.map(p=>p.safeRestartAfterTicks||0))});
 if(m.dimensions[1]>384||m.volume>16000000)throw Error('电路超过世界高度或投影内存安全上限');
 const occupied=new Set(m.blocks.map(b=>b.position.join()));if(occupied.size!==m.blocks.length)throw Error('省材模块重叠');
 for(const n of m.notes)if(occupied.has([n.position[0],n.position[1]+1,n.position[2]].join()))throw Error('省材音符上方被覆盖');
 m.compositionChecks={sourceEvents:true,isolatedComponents:true,runtimeVerified:false,scope:'独立模块间隔、音符事件重数、普通轨和复用音符轨的有限信号检查；漏斗整机演奏及复位未实机验证。'};
 m.audit={pass:false,status:'component-checks-only',scope:m.compositionChecks.scope};return m;
}
function residualModels(notes,params,maxInputs){
 if(!notes.length)return[];const song=asSong(notes),maximum=Math.max(...song.events.map(e=>e.notes.length)),count=Math.max(1,Math.ceil(maximum/17));
 if(count>maxInputs)throw Error('剩余音符所需入口超过并行线路上限');
 const lanes=count===1?[song]:splitSong(song,{count,scheme:'voices'});
 return lanes.map(lane=>{const m=designChordBus(lane,{...params,splitLongRests:true});const a=auditSignals(m);if(!a.pass)throw Error('剩余音轨信号检查失败');return m});
}
function buildMaterialRecipe(song,recipe,opt={}){
 if(recipe.kind!=='material-reuse'||!recipe.phrases?.length)throw Error('省材模式必须包含复用模块');
 const remaining=[...song.notes],models=[];
 for(const p of recipe.phrases){
  for(const t of p.calls)for(const n of p.pattern){const i=remaining.findIndex(s=>s.tick===t+n.tick&&toneKey(s)===toneKey(n));if(i<0)throw Error('复用片段重叠或不符合源曲');remaining.splice(i,1)}
  const core=designChordBus({notes:p.pattern},{...p.params,cutMode:'adaptive'});if(!auditSignals(core).pass)throw Error('复用音符轨信号检查失败');
  models.push(designPhraseReuse(p.pattern,p.calls,p.params));
 }
 models.push(...residualModels(remaining,recipe.residualParams,Number(opt.maxTracks??8)-models.length));
 const m=compose(models,recipe.columns||1);if(m.inputs.length>Number(opt.maxTracks??8))throw Error('入口过多');
 if(signature(m.notes)!==signature(song.notes))throw Error('省材方案改变了原曲事件');
 require('./support-materials.cjs').replaceCanonicalSupports(m,opt.support||'cobblestone');
 m.safeRestartAfterTicks=Math.max(m.safeRestartAfterTicks,...song.notes.map(n=>n.tick+10));
 if(require('./quinn.cjs').enabled(opt))m.quinnCoverCost=m.blocks.filter(b=>b.block.startsWith('note_block[')).length;
 return m;
}
function searchMaterials(song,opt,progress=()=>{}){
 if(!Number.isFinite(Number(opt.seconds??60))||Number(opt.seconds??60)<0)throw Error('搜索时间无效');
 if(!Number.isInteger(Number(opt.maxTracks??8))||Number(opt.maxTracks??8)<1||Number(opt.maxTracks??8)>8)throw Error('并行线路数必须为 1–8');
 const started=Date.now(),deadline=Number(opt.seconds)===0?Infinity:started+1000*Number(opt.seconds??60),stopped=()=>Date.now()>=deadline||Boolean(opt.stopFile&&fs.existsSync(opt.stopFile));
 if(!require('./versions.cjs').supports(opt.target,'reuse')||opt.externalInputs===false)throw Error('极限省材需要 Java 1.21 或更新版本，以及外部同步入口');
 const catalog=opt.motifAnalysis?.candidates||[];if(!catalog.length)throw Error('没有当前计时器支持的重复乐句，无法强制复用；请改用体积优先模式。');
 let best=null,exported=null,bestRecipe=null,attempts=0,improvements=0,lastProgress=0,baseline=null,lastError='';
 const checkpoint=opt.checkpoint+'.materials.json';
 const notify=(force=false)=>{if(!force&&Date.now()-lastProgress<500)return;lastProgress=Date.now();progress({phase:'portfolio-progress',objective:'materials',elapsed:(Date.now()-started)/1000,attempts,improvements,bestVolume:best?.volume,bestMaterialUnits:exported?materialCost(exported):null,dimensionsXZY:best?[best.dimensions[0],best.dimensions[2],best.dimensions[1]]:null,lanes:[{lane:'material-reuse',state:'running'}]})};
 function evaluate(recipe){
  if(stopped())return;attempts++;
  try{
   const m=buildMaterialRecipe(song,recipe,opt);
   if(best&&!opt.autoStartWiring&&!better(m,exported))return;
   if(exported&&materialCost(m)>materialCost(exported))return; // nonnegative external wire lower bound
   const full=opt.autoStartWiring?require('./external-start.cjs').connectExternalStart(m,opt):m;
   if(!better(full,exported))return;
   best=m;exported=full;bestRecipe=recipe;improvements++;
   fs.mkdirSync(require('node:path').dirname(checkpoint),{recursive:true});fs.writeFileSync(checkpoint,JSON.stringify({version:1,recipe}));
   progress({phase:'pipeline-best',objective:'materials',materialUnits:materialCost(full),volume:m.volume,dimensionsXZY:[m.dimensions[0],m.dimensions[2],m.dimensions[1]],phraseModules:recipe.phrases.length});notify(true);
  }catch(e){lastError=e.message}finally{notify()}
 }
 progress({phase:'portfolio-start',lane:'material-reuse'});
 progress({phase:'log',message:'极限省材：CPU 搜索，强制复用；目标为放置方块 + 漏斗填充物，自动启动线勾选时也计入。尺寸和听音范围限制已停用。'});
 try{const old=JSON.parse(fs.readFileSync(checkpoint));evaluate(old.recipe)}catch{}
 for(const recipe of opt.materialRecipes||[])evaluate(recipe);
 // Prefer net estimated saving rather than repetition percentage. Actual
 // candidates below are rebuilt and counted including all timer inventories.
 const sorted=[...catalog].sort((a,b)=>(b.savedNotes*3-b.calls.at(-1).tick/4)-(a.savedNotes*3-a.calls.at(-1).tick/4));
 const diversified=[],similar=[];for(const motif of sorted){const ids=new Set(motif.calls.flatMap(c=>c.noteIds));if(diversified.some(v=>[...ids].filter(i=>v.ids.has(i)).length>Math.min(ids.size,v.ids.size)*.8))similar.push(motif);else diversified.push({motif,ids})}const ranked=[...diversified.map(v=>v.motif),...similar];
 const modules=[],seen=new Set(),recipeSeen=new Set();
 const residualOptions=[];for(const cap of [24,40,64,96,16,128,8])for(const rows of [32,16,8,4,1])residualOptions.push({cap,rows,layerHeight:4,rowPitch:2,riseStyle:'powered',cutMode:'adaptive'});
 // A baseline is a comparison only, never an eligible forced-reuse output.
 try{const ms=residualModels(song.notes,residualOptions[0],Number(opt.maxTracks??8)),m=compose(ms);require('./support-materials.cjs').replaceCanonicalSupports(m,opt.support||'cobblestone');if(require('./quinn.cjs').enabled(opt))m.quinnCoverCost=m.blocks.filter(b=>b.block.startsWith('note_block[')).length;baseline=materialCost(opt.autoStartWiring?require('./external-start.cjs').connectExternalStart(m,opt):m)}catch{}
 function trial(selection,params,columns){const recipe={kind:'material-reuse',phrases:selection.map(v=>v.recipe),residualParams:params,columns};const k=JSON.stringify(recipe);if(recipeSeen.has(k))return;recipeSeen.add(k);evaluate(recipe)}
 let pass=0;
 while(!stopped()){
  let added=false;
  // Broaden over time; each pass refines material geometry as well as coverage.
  const budget=Math.min(ranked.length,16*(pass+1));
  for(const motif of ranked.slice(0,budget)){
   if(stopped())break;const key=motif.calls.map(c=>c.noteIds.join(',')).join(';');
   const params={cap:[24,40,64,16,96,8,128][pass%7],rows:[32,16,8,4,1][Math.floor(pass/7)%5],layerHeight:4,driverShape:Math.floor(pass/35)%2?'stack':'flat'};
   const mk=key+JSON.stringify(params);if(seen.has(mk))continue;seen.add(mk);attempts++;
   let mod;try{const model=designPhraseReuse(motif.pattern,motif.calls.map(c=>c.tick),params),recipe={pattern:motif.pattern,calls:motif.calls.map(c=>c.tick),params};if(require('./quinn.cjs').enabled(opt))model.quinnCoverCost=model.blocks.filter(b=>b.block.startsWith('note_block[')).length;mod={ids:new Set(motif.calls.flatMap(c=>c.noteIds)),cost:materialCost(model),value:motif.savedNotes*3-(materialCost(model)-motif.templateNotes*3),recipe,key}}catch(e){lastError=e.message;notify();continue}
   const prior=modules.findIndex(v=>v.key===key);if(prior>=0&&modules[prior].cost<=mod.cost)continue;if(prior>=0)modules.splice(prior,1);modules.push(mod);added=true;
   trial([mod],residualOptions[pass%residualOptions.length],1);
   // Start at each new phrase to diversify weighted nonoverlapping coverage.
   const selection=[mod],used=new Set(mod.ids);
   for(const other of [...modules].sort((a,b)=>b.value-a.value)){
    if(selection.length>=Number(opt.maxTracks??8)-1)break;
    if(other===mod||other.value<=0||[...other.ids].some(i=>used.has(i)))continue;
    selection.push(other);for(const id of other.ids)used.add(id);
   }
   if(selection.length>1)for(const columns of [1,Math.ceil(Math.sqrt(selection.length+1)),selection.length+1])trial(selection,residualOptions[pass%residualOptions.length],columns);
   notify();
  }
  if(bestRecipe)for(const params of residualOptions){if(stopped())break;for(const columns of [1,2,4])evaluate({...bestRecipe,residualParams:params,columns});}
  pass++;
  if(pass>=70&&!added)break;
 }
 if(!best)throw Error('预算内未找到通过分部检查的复用方案，没有导出普通布局。可增加搜索时间或并行线路上限。'+(lastError?' 最近原因：'+lastError:''));
 const stats={mode:'material-reuse',objective:'placed-blocks-plus-fill',attempts,improvements,seconds:(Date.now()-started)/1000,workerErrors:[],backend:'cpu',tracks:best.inputs.length,bestVolume:best.volume,actualAspect:require('./objective.cjs').aspect(best.dimensions),maxAspect:0,globalMinimumProven:false,optimality:'按方块和漏斗填充物总数量搜索，强制乐句复用；自动启动线计入材料。最小已找到材料量，未证明全局最优或实机演奏。',materialUnits:materialCost(exported),baselineMaterialUnits:baseline,materialDifference:baseline===null?null:baseline-materialCost(exported),phraseModules:bestRecipe.phrases.length,stopReason:opt.stopFile&&fs.existsSync(opt.stopFile)?'user-export':Date.now()>=deadline?'time-budget':'finite-search-complete'};
 best.search=stats;notify(true);return{manifest:best,exported,stats,reuseResult:{manifest:best,recipe:bestRecipe,stats}};
}
module.exports={materialCost,better,compose,asSong,buildMaterialRecipe,searchMaterials};
