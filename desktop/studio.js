'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const number=n=>Number(n||0).toLocaleString('zh-CN');
const icon=id=>`<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
const modes=['体积优先','极限省材（强制乐句复用）','毒曲（宽高 ≤100，自动跟随）'];
const fields={
 primary:[['target','Java 版本'],['sound_engine','音域方案'],['support','结构支撑','不改变乐器底座'],['speed','播放速度']],
 shape:[['aspect','地面长宽差距','短边 40 格、允许长 50%，则长边最多 60 格。'],['spatial_aspect','整体长宽高比例','倍数越小，整体越接近方块。'],['listening_radius','中心听音半径','中心到最远角落的距离，不保证音量一致。']],
 music:[['timing','音乐时序'],['pitch','音高处理'],['transpose','移调','半音 · −48 至 48'],['max_tracks','并行线路上限']],
 compute:[['budget','搜索时间'],['backend','计算设备'],['threads','CPU 并行线程','1–128 个线程']]
};
const numeric={transpose:[-48,48],threads:[1,128],limit_0:[4,512],limit_1:[4,512],limit_2:[4,384]};
let api=null,values={},paths={},choices={},profiles=[],selected=0,appearance={theme:'glass',motion:true,font_size:100};
let versionCatalog=[];
const versionGroup=id=>id.startsWith('26.')?'26.1–26.3':id.startsWith('1.21')?'1.21–1.21.11':'1.20–1.20.6';
function renderVersions(){
 const group=versionGroup(values.target),range=$('#quickRange'),target=$('#quickTarget');
 range.replaceChildren(...[...new Set(choices.target.map(versionGroup))].map(g=>new Option(g,g)));range.value=group;
 target.replaceChildren(...choices.target.filter(v=>versionGroup(v)===group).map(v=>new Option(v,v)));target.value=values.target;
 const v=versionCatalog.find(v=>v.id===values.target);
 $('#versionHint').textContent=v?`Java ${v.java} · ${v.enb==='port'?'配套 ENB 移植版':v.enb==='upstream+compat'?'官方 ENB ＋ NBS 兼容补丁':'暂无配套 ENB'} · ${v.id==='26.1.2'?'已有短段实机验证':'新版本先用短曲验收'}`:'按所选版本导出投影数据。';
}
$('#quickRange').addEventListener('change',e=>{values.target=choices.target.find(v=>versionGroup(v)===e.target.value);$('#target').value=values.target;renderVersions();scheduleAnalysis();applyDependencies();saveSoon();});
let state={running:false,phase:'idle'},cursor=0,saveTimer,pollTimer,toastTimer,lastPhase='',previewData=null,previewRequest=0,previewReport='',initialized=false;
let saveChain=Promise.resolve(),revision=0,unsaved=false;
const bootRose=new RoseFour($('#bootRose')),rose=new RoseFour($('#rose')),analysisRose=new RoseFour($('#analysisRose'));bootRose.start();

let analysisTimer,analysisVersion=0,analysisBusy=false,analysisResult=null;
function renderAnalysis(){
 $("#analysisRose").hidden=!analysisBusy;if(analysisBusy)analysisRose.start();else analysisRose.stop();
 const r=analysisResult,s=r?.summary;
 $('#analysisTitle').textContent=analysisBusy?'正在识别这首音乐…':s?'已识别 · '+(s.objective==='toxic'?'密集音符布局':'紧凑红石布局'):r?.error?'需要调整后再转换':'等待选择 NBS 文件';
 $('#songAnalysis').classList.toggle('analysis-error',!!r?.error&&!analysisBusy);
 $('#analysisFacts').textContent=analysisBusy?'读取真实速度、音域和同时发声音符数，不进行布局搜索。':s?`${s.tempo} tick/s · ${number(s.notes)} 个音符 · 最多 ${s.peak} 音同时发声 · 约 ${Math.ceil(s.durationSeconds)} 秒`:r?.error||'自动识别速度、音域和密度，不修改源文件。';
 $('#analysisDecisions').replaceChildren();
 if(s&&!analysisBusy&&values.adaptive!==false)$('#footerSub').textContent=(s.soundEngine==='extended'?'需要 ENB 模组 · ':'原版音符盒 · ')+s.timeResolution+'t 严格时序 · 原速播放';
 if(s&&!analysisBusy)for(const message of s.messages){const li=document.createElement('li');li.textContent=message;$('#analysisDecisions').append(li);}
}
function scheduleAnalysis(){
 clearTimeout(analysisTimer);const id=++analysisVersion;analysisResult=null;
 analysisBusy=!!paths.input?.trim();renderAnalysis();applyDependencies();
 if(!analysisBusy)return;
 analysisTimer=setTimeout(async()=>{
  try{const r=await api.inspect_song({...values},{...paths});if(id!==analysisVersion)return;analysisResult=r;}
  catch(e){if(id!==analysisVersion)return;analysisResult={ok:false,error:'分析失败：'+(e.message||e)};}
  if(id!==analysisVersion)return;analysisBusy=false;renderAnalysis();applyDependencies();
 },350);
}
for(const [id,automatic]of [['autoSetup',true],['manualSetup',false]])$('#'+id).addEventListener('click',()=>{values.adaptive=automatic;scheduleAnalysis();applyDependencies();saveSoon();});
$('#quickTarget').addEventListener('change',e=>{values.target=e.target.value;$('#target').value=values.target;scheduleAnalysis();applyDependencies();saveSoon();});

function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3600);}
async function call(name,...args){try{const result=await api[name](...args);if(result?.ok===false)throw Error(result.error);return result;}catch(e){toast(e.message||String(e));throw e;}}
function field(key,label,hint){
 const box=document.createElement('div');box.className='field';const l=document.createElement('label');l.htmlFor=key;l.textContent=label;box.append(l);
 const control=document.createElement(choices[key]?'select':'input');control.id=key;control.dataset.setting=key;
 if(choices[key]){let group;for(const value of choices[key]){const o=new Option(value,value);if(key==='target'){const label=versionGroup(value);if(!group||group.label!==label){group=document.createElement('optgroup');group.label=label;control.append(group);}group.append(o);}else control.add(o);}}
 else{control.type='number';control.min=numeric[key][0];control.max=numeric[key][1];control.step='1';}
 box.append(control);if(hint){const p=document.createElement('small');p.textContent=hint;box.append(p);}return box;
}
function buildFields(){
 for(const [group,specs] of Object.entries(fields)){for(const spec of specs)$(`#${group}Fields`).append(field(...spec));}
 ['X · 长度上限','Z · 宽度上限','Y · 高度上限'].forEach((label,i)=>$('#boundsFields').append(field('limit_'+i,label)));
 for(const [key,title,desc] of [['auto_start_wiring','自动连接外部启动线','外部线路不计入主体体积；入口需 1 红石刻脉冲。'],['heavy_core','允许沉重核心','可替代小鼓沙子底座，需要 Java 1.21 或更新版本。']]){
  const row=document.createElement('label');row.className='switch-row';row.htmlFor=key;
  const copy=document.createElement('span');copy.className='switch-copy';copy.textContent=title;const small=document.createElement('small');small.textContent=desc;copy.append(small);
  const input=document.createElement('input');input.type='checkbox';input.className='switch';input.id=key;input.dataset.setting=key;input.setAttribute('role','switch');row.append(copy,input);$('#switchFields').append(row);
 }
 $$('[data-setting]').forEach(el=>el.addEventListener('change',()=>{values[el.dataset.setting]=el.type==='checkbox'?el.checked:el.value;applyDependencies();saveSoon();scheduleAnalysis();}));
}
function fill(){
 $$('[data-setting]').forEach(el=>{if(el.type==='checkbox')el.checked=values[el.dataset.setting];else el.value=values[el.dataset.setting];});
 $('#inputPath').value=paths.input||'';$('#outputPath').value=paths.output||'';fileChanged();applyDependencies();renderProfiles();scheduleAnalysis();
}
function applyDependencies(){
 const automatic=values.adaptive!==false;
 document.body.classList.toggle('auto-setup',automatic);
 $('#autoSetup').setAttribute('aria-pressed',String(automatic));$('#manualSetup').setAttribute('aria-pressed',String(!automatic));
 $('#autoSetup').disabled=$('#manualSetup').disabled=$('#quickTarget').disabled=$('#quickRange').disabled=state.running;
 renderVersions();

 const mode=Math.max(0,modes.indexOf(values.objective)),volume=mode===0,toxic=mode===2;
 $$('.mode').forEach((b,i)=>{b.classList.toggle('active',i===mode);b.setAttribute('aria-pressed',String(i===mode));b.disabled=state.running;});
 $('.mode-indicator').style.transform=`translateX(${mode*100}%)`;
 $('#modeHint').textContent=[
  '普通布线与压缩模板一起寻找更小体积。自动检查重复度，有收益时再考虑乐句复用。',
  '强制复用乐句，比较完整材料数量。忽略尺寸限制；重复少的歌曲，材料可能反而更多。',
  '适合每刻数百音符的黑乐谱。宽、高不超过 100 格，长度不限；自带启动与每游戏刻跟随。'][mode];
 const shape=['limit_0','limit_1','limit_2','aspect','spatial_aspect','listening_radius'];
 $$('[data-setting]').forEach(el=>{
  const k=el.dataset.setting;el.disabled=state.running||(!volume&&(shape.includes(k)||['backend','heavy_core'].includes(k)))||(toxic&&k==='auto_start_wiring');
 });
 if(toxic){values.auto_start_wiring=true;$('#auto_start_wiring').checked=true;}
 $('#shapeSummary').textContent=volume?`主体上限 ${values.limit_0} × ${values.limit_1} × ${values.limit_2} 格 · 听音半径 ${values.listening_radius}`:toxic?'毒曲固定宽高 ≤100 格 · 长度不限':'省材模式不限制主体尺寸';
 $('#shapeHelp').textContent=volume?'仅限制主体尺寸，外部启动线不计入；X × Z × Y 分别为长、宽、高。':toxic?'以下参数仅用于体积模式；毒曲使用固定的 100 格宽高上限。':'以下参数仅用于体积模式；省材模式以材料数量为目标。';
 $('#soundHint').textContent=values.sound_engine.startsWith('自动')?'按音域和力度选择原版或 ENB，需要模组时会提前提示。':values.sound_engine.startsWith('ENB')?'保留音符力度 × 音轨音量。需 ENB 配套模组，粘贴时保留方块实体 NBT。':values.sound_engine.startsWith('Quinn')?'需 Java 26.1.2、Quinn v1.3 数据包与资源包，投影粘贴须包含实体。':'原版两八度，无需额外模组；不能独立还原每个音符的力度与声像。';
 $('#computeNote').textContent=!volume?'此模式由 CPU 计算。搜索缓存会自动保存；转换中仍可取消。':values.backend.includes('GPU')?'GPU 加速普通几何搜索，其余模板继续使用 CPU。需要兼容 CUDA 的 NVIDIA 显卡。':'普通布线与压缩模板同时运行，自动保存当前最优。持续优化时，可随时点击“导出当前最优”。';
 $('#startBtn').disabled=state.running||!paths.input?.trim()||(values.adaptive!==false&&(analysisBusy||!analysisResult?.ok));
 for(const id of ['inputPath','outputPath','pickInput','pickOutput','profileSelect'])$('#'+id).disabled=state.running;
 $('#saveProfile').disabled=state.running||!selected;$('#renameProfile').disabled=state.running||!selected;
}
function fileChanged(){const file=(paths.input||'').split(/[\\/]/).pop();$('#fileName').textContent=file||'选择你的旋律';$('#fileName').title=file||'';$('#fileSub').textContent=file?'NBS 音乐文件 · 准备转换':'支持新旧版 Note Block Studio 文件';$('#footerSub').textContent=file||'选择音乐，设置将自动保存';}
function saveSoon(){unsaved=true;revision++;clearTimeout(saveTimer);saveTimer=setTimeout(()=>persist(),220);}
function persist(){
 clearTimeout(saveTimer);if(!initialized||!api)return Promise.resolve();
 const rev=revision,v={...values},p={...paths},a={...appearance};
 saveChain=saveChain.catch(()=>{}).then(()=>call('save_settings',v,p,a)).then(()=>{if(rev===revision)unsaved=false;}).catch(()=>{});return saveChain;
}
function renderProfiles(){const select=$('#profileSelect');select.replaceChildren(new Option('默认配置',0));profiles.forEach((p,i)=>select.add(new Option(`${i+1} · ${p.name}${p.settings?'':'（未保存）'}`,i+1)));select.value=selected;$('#saveProfile').disabled=!selected||state.running;$('#renameProfile').disabled=!selected||state.running;}
function applyFont(){
 const size=[90,100,110,120,130].includes(appearance.font_size)?appearance.font_size:100;
 appearance.font_size=size;document.documentElement.style.fontSize=(13*size/100)+'px';
 $('#fontSummary').textContent=({90:'较小',100:'标准',110:'稍大',120:'大',130:'特大'}[size])+' · '+size+'%';
 $$('[data-font-size]').forEach(b=>b.setAttribute('aria-checked',String(Number(b.dataset.fontSize)===size)));
}
function theme(animate=false){
 const apply=()=>{document.documentElement.dataset.theme=appearance.theme;document.documentElement.dataset.motion=appearance.motion?'on':'off';
  const t=appearance.theme;$('#themeLabel').textContent={light:'纸间',dark:'夜航',glass:'浮光'}[t];$('#themeIcon use').setAttribute('href','#i-'+{light:'sun',dark:'moon',glass:'glass'}[t]);$$('[data-theme-choice]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.themeChoice===t)));if(api?.set_theme)api.set_theme(t).then(r=>document.documentElement.dataset.acrylic=r.acrylic?'on':'off').catch(()=>{});
  applyFont();drawPreview();};
 if(animate&&appearance.motion&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&document.startViewTransition&&document.documentElement.dataset.keyboard!=='true')document.startViewTransition(apply);else apply();
}
function timeLabel(seconds){const s=Math.floor(seconds||0);return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function updateState(next){
 const wasRunning=state.running;state=next;document.body.classList.toggle('running',state.running);document.body.classList.toggle('done',state.phase==='done');document.body.classList.toggle('error',state.phase==='error');
 const labels={idle:'待开始',reading:'读取中',searching:'搜索中',exporting:'导出中',done:'已完成',error:'出错了',cancelled:'已取消',cancelling:'取消中'};
 $('#phasePill').textContent=labels[state.phase]||'处理中';$('#statusMessage').textContent=state.message;
 $('#noteMetric').textContent=state.notes?number(state.notes):'—';$('#attemptMetric').textContent=state.attempts?number(state.attempts):'—';
 $('#timeMetric').textContent=timeLabel(state.wallElapsed||state.elapsed);
 $('#bestMetric').textContent=state.best?state.best.dimensions.join(' × '):'—';$('#bestMetric').title=state.best?`${number(state.best.score)} ${state.best.unit}`:'';
 const laneKey=(state.lanes||[]).join('|');if($('#lanes').dataset.key!==laneKey){$('#lanes').dataset.key=laneKey;$('#lanes').replaceChildren();(state.lanes||[]).forEach(label=>{const el=document.createElement('span');el.className='lane';el.textContent=label;$('#lanes').append(el);});}
 $('#cancelBtn').hidden=!state.running;$('#finishBtn').hidden=!state.running;$('#startBtn').hidden=state.running;
 $('#cancelBtn').disabled=state.phase==='cancelling';$('#finishBtn').disabled=!state.best||['cancelling','exporting','error','done'].includes(state.phase);$('#finishBtn').title=state.best?'结束搜索，导出当前最优方案':'等待首个有效方案后可导出';
 $('#footerTitle').textContent=state.running?`${labels[state.phase]||'正在转换'} · ${timeLabel(state.wallElapsed||state.elapsed)}`:state.phase==='done'?'作品已生成':state.phase==='error'?'转换未完成':state.phase==='cancelled'?'已取消':'准备就绪';
 $('#openOutput').hidden=!state.report;
 if(state.phase!==lastPhase||wasRunning!==state.running){
  lastPhase=state.phase;applyDependencies();
  $('#rose').hidden=!state.running;$('#idleArt').hidden=state.running;
  if(state.running)rose.start();else rose.stop();
  $('#stageOverline').textContent=state.running?'ROSE FOUR · SEARCH IN MOTION':state.phase==='done'?'MUSIC, NOW IN BLOCKS':'一首音乐，无限种排列。';
  $('#stageTitle').textContent={reading:'先听懂，再折叠。',searching:'正在寻找更好的形状',exporting:'把这一刻的最优留下',done:'旋律，已经有了形状。',error:'这次需要调整一下',cancelled:'暂停探索，灵感还在。',cancelling:'正在收好这次探索'}[state.phase]||'下一件作品，从这里开始';
  $('#stageSub').textContent=state.running?'随时取消 · 有方案后可手动导出':state.phase==='done'?'投影与使用说明已保存到输出目录。':state.phase==='error'?'详细原因请查看下方转换记录。':'导入 NBS，开始探索它的空间。';
 }
 if(state.report&&state.report.folder!==previewReport){previewReport=state.report.folder;loadLayer(2);toast('转换完成，投影已导出。');}
 if(!state.report&&previewReport){previewReport='';previewData=null;$('.preview-empty').hidden=false;$('#previewCanvas').hidden=true;$('#layerTools').hidden=true;}
}
function addEvents(events){
 const panel=$('#logPanel');const follow=panel.scrollHeight-panel.clientHeight-panel.scrollTop<45;
 if(events.length)panel.querySelector('.empty-log')?.remove();
 for(const e of events){const row=document.createElement('div');row.className='log-entry '+e.phase;const time=document.createElement('time');time.textContent=e.time;const text=document.createElement('span');text.textContent=e.message;row.append(time,text);panel.append(row);}
 while(panel.children.length>600)panel.firstElementChild.remove();
 if(follow)panel.scrollTop=panel.scrollHeight;$('#logCount').textContent=panel.querySelectorAll('.log-entry').length;
}
async function poll(){if(!initialized)return;try{const r=await api.poll(cursor);cursor=r.cursor;updateState(r.state);addEvents(r.events);}catch(e){$('#statusMessage').textContent='正在重新连接本地转换进程…';}finally{pollTimer=setTimeout(poll,250);}}
function showTab(preview){$('#logPanel').hidden=preview;$('#previewPanel').hidden=!preview;['logTab','previewTab'].forEach((id,i)=>{$('#'+id).classList.toggle('active',i===Number(preview));$('#'+id).setAttribute('aria-selected',String(i===Number(preview)));$('#'+id).tabIndex=i===Number(preview)?0:-1;});if(preview)drawPreview();}
async function loadLayer(y){const id=++previewRequest;try{const data=await call('preview_layer',Number(y));if(id!==previewRequest||!data)return;previewData=data;$('.preview-empty').hidden=true;$('#previewCanvas').hidden=false;$('#layerTools').hidden=false;$('#layer').max=data.size[1]-1;$('#layer').value=data.layer;$('#layerValue').textContent=data.layer;$('#previewHint').textContent=(data.previewClipped?'仅预览起点前 256 格，完整投影见文件。 ':'')+`X 向右 · Z 向下 · 共 ${data.size[1]} 层`;drawPreview();}catch(e){toast('分层预览读取失败：'+e.message);}}
function drawPreview(){if(!previewData||$('#previewPanel').hidden)return;const canvas=$('#previewCanvas'),rect=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;canvas.width=rect.width*dpr;canvas.height=210*dpr;const c=canvas.getContext('2d');c.scale(dpr,dpr);const [sx,,sz]=previewData.size,cell=Math.min((rect.width-18)/sx,192/sz),ox=(rect.width-sx*cell)/2,oz=(210-sz*cell)/2;const colors={note_block:'#c58b52',redstone_wire:'#df5f60',repeater:'#6aafc7',glass:'#63867d',lime_stained_glass:'#87bd64',green_stained_glass:'#87bd64'};
 for(const [x,,z,b] of previewData.blocks){c.fillStyle=colors[b.replace('minecraft:','')]||'#939b94';c.fillRect(ox+x*cell,oz+z*cell,Math.max(.3,cell-.3),Math.max(.3,cell-.3));}}

$$('.mode').forEach(b=>b.addEventListener('click',()=>{values.objective=modes[Number(b.dataset.mode)];scheduleAnalysis();applyDependencies();saveSoon();}));
$$('[data-scroll]').forEach(b=>b.addEventListener('click',()=>{(b.dataset.scroll==='compute'&&values.adaptive!==false?$('#manualSetup').click():null);$('#'+b.dataset.scroll).scrollIntoView({behavior:appearance.motion&&document.documentElement.dataset.keyboard!=='true'?'smooth':'instant',block:'start'});}));
const observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting)$$('[data-scroll]').forEach(b=>b.classList.toggle('active',b.dataset.scroll===e.target.id));},{root:$('#editor'),rootMargin:'-5% 0px -65% 0px',threshold:0});['music','setup','compute'].forEach(id=>observer.observe($('#'+id)));
$('#inputPath').addEventListener('input',e=>{paths.input=e.target.value;fileChanged();scheduleAnalysis();applyDependencies();saveSoon();});$('#outputPath').addEventListener('input',e=>{paths.output=e.target.value;saveSoon();});
for(const kind of ['Input','Output'])$('#pick'+kind).addEventListener('click',async()=>{try{const path=await call('pick',kind.toLowerCase());if(path){paths[kind.toLowerCase()]=path;fill();saveSoon();}}catch{}});
function closeTheme(){ $('#fontOptions').hidden=true;$('#themeOptions').hidden=false;$('#fontMenuBtn').setAttribute('aria-expanded','false');$('#themeMenu').hidden=true;$('#themeBtn').setAttribute('aria-expanded','false'); }
$('#themeBtn').addEventListener('click',()=>{const open=$('#themeMenu').hidden;$('#themeMenu').hidden=!open;$('#themeBtn').setAttribute('aria-expanded',String(open));if(open){const r=$('#themeBtn').getBoundingClientRect();$('#themeMenu').style.right=(innerWidth-r.right)+'px';$('#themeMenu').style.top=(r.bottom+10)+'px';$('#themeMenu [aria-checked="true"]').focus({preventScroll:true});}});
$$('[data-theme-choice]').forEach(b=>b.addEventListener('click',()=>{appearance.theme=b.dataset.themeChoice;closeTheme();theme(true);saveSoon();$('#themeBtn').focus({preventScroll:true});}));
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#themeMenu')&&!e.target.closest('#themeBtn'))closeTheme();});
$('#themeMenu').addEventListener('keydown',e=>{if(e.key==='Escape'){closeTheme();$('#themeBtn').focus();}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=$$('#themeMenu [role^=menuitem]').filter(b=>b.getClientRects().length),i=items.indexOf(document.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:items.length-1))%items.length].focus();}});
window.setMaximized=max=>{document.body.classList.toggle('maximized',max);$('#maximizeWindow').setAttribute('aria-label',max?'还原窗口':'最大化');$('#maximizeWindow').title=max?'还原窗口':'最大化';$('#maximizeWindow use').setAttribute('href',max?'#i-restore':'#i-maximize');};
for(const [id,action] of [['minimizeWindow','minimize'],['maximizeWindow','maximize'],['closeWindow','close']])$('#'+id).addEventListener('click',async()=>{try{await call('window_action',action);}catch{}});
let titlePress={time:0,x:0,y:0};
$('#windowTitlebar').addEventListener('mousedown',e=>{
 if(e.button!==0||e.target.closest('button,a,input,select'))return;
 e.preventDefault();const now=performance.now(),double=titlePress.time>0&&now-titlePress.time<450&&Math.hypot(e.screenX-titlePress.x,e.screenY-titlePress.y)<5;
 titlePress={time:double?0:now,x:e.screenX,y:e.screenY};
 if(double)call('window_action','maximize').catch(()=>{});else call('drag_window').catch(()=>{});
});
$('#fontMenuBtn').addEventListener('click',()=>{$('#themeOptions').hidden=true;$('#fontOptions').hidden=false;$('#fontMenuBtn').setAttribute('aria-expanded','true');$('#fontOptions [aria-checked=true]').focus();});
$('#fontMenuBack').addEventListener('click',()=>{$('#fontOptions').hidden=true;$('#themeOptions').hidden=false;$('#fontMenuBtn').setAttribute('aria-expanded','false');$('#fontMenuBtn').focus();});
$$('[data-font-size]').forEach(b=>b.addEventListener('click',()=>{appearance.font_size=Number(b.dataset.fontSize);applyFont();saveSoon();}));
$('#themeMenu').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'&&!$('#fontOptions').hidden){e.preventDefault();$('#fontMenuBack').click();}if(e.key==='ArrowRight'&&document.activeElement===$('#fontMenuBtn')){e.preventDefault();$('#fontMenuBtn').click();}});
$$('[data-edge]').forEach(el=>el.addEventListener('mousedown',e=>{if(e.button===0){e.preventDefault();api?.resize_window?.(el.dataset.edge);}}));
$('#profileSelect').addEventListener('change',async e=>{try{await persist();const r=await call('profile','load',Number(e.target.value));values=r.values;profiles=r.profiles;selected=r.selected;fill();toast(selected&&!profiles[selected-1].settings?'这是空配置槽，调整后点击保存。':'配置已载入');}catch{}});
$('#saveProfile').addEventListener('click',async()=>{try{await persist();const r=await call('profile','save',selected,values);profiles=r.profiles;renderProfiles();toast('配置已保存，下次可直接载入。');}catch{}});
$('#renameProfile').addEventListener('click',()=>{$('#profileName').value=profiles[selected-1].name;$('#renameDialog').showModal();$('#profileName').focus();});
$('#renameDialog').addEventListener('close',async()=>{if($('#renameDialog').returnValue!=='save')return;try{await persist();const r=await call('profile','rename',selected,null,$('#profileName').value);profiles=r.profiles;renderProfiles();toast('配置名称已更新');}catch{}});
$('#aboutBtn').addEventListener('click',()=>$('#aboutDialog').showModal());$('#closeAbout').addEventListener('click',()=>$('#aboutDialog').close());
$('#startBtn').addEventListener('click',async()=>{try{if(values.adaptive!==false&&(analysisBusy||!analysisResult?.ok))return;if(values.adaptive===false)for(const el of $$('[data-setting]'))if(!el.disabled&&!el.reportValidity())return;$('#startBtn').disabled=true;await persist();await call('start',values,paths);$('#logPanel').replaceChildren();previewReport='';previewData=null;$('.preview-empty').hidden=false;$('#previewCanvas').hidden=true;$('#layerTools').hidden=true;showTab(false);const r=await api.poll(cursor);cursor=r.cursor;updateState(r.state);addEvents(r.events);}catch{applyDependencies();}});
$('#cancelBtn').addEventListener('click',async()=>{try{await call('cancel');}catch{}});$('#finishBtn').addEventListener('click',async()=>{try{await call('finish');}catch{}});$('#openOutput').addEventListener('click',async()=>{try{await call('open_output');}catch{}});
$('#logTab').addEventListener('click',()=>showTab(false));$('#previewTab').addEventListener('click',()=>showTab(true));$('#showLog').addEventListener('click',()=>{showTab(false);$('#logPanel').scrollIntoView({block:'nearest'});});
$('.monitor-tabs').addEventListener('keydown',e=>{if(['ArrowRight','ArrowLeft'].includes(e.key)){e.preventDefault();const next=$('#previewPanel').hidden;showTab(next);$(next?'#previewTab':'#logTab').focus();}});
let layerTimer;$('#layer').addEventListener('input',e=>{clearTimeout(layerTimer);const y=e.target.value;$('#layerValue').textContent=y;layerTimer=setTimeout(()=>loadLayer(y),80);});new ResizeObserver(drawPreview).observe($('#previewPanel'));
document.addEventListener('keydown',e=>{document.documentElement.dataset.keyboard='true';if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!state.running){e.preventDefault();$('#startBtn').click();}});document.addEventListener('pointerdown',()=>document.documentElement.dataset.keyboard='false');
document.addEventListener('visibilitychange',()=>{if(document.hidden&&unsaved)persist();});
window.addEventListener('beforeunload',()=>{if(unsaved)persist();});
async function init(){if(initialized)return;api=window.pywebview?.api;if(!api)return;try{const r=await api.bootstrap();values=r.values;paths=r.paths;choices=r.choices;versionCatalog=r.versions||[];profiles=r.profiles;selected=r.selected;appearance={theme:'glass',font_size:100,...r.appearance,motion:true};$('#version').textContent=r.version;$('#aboutVersion').textContent='音符工坊 · Note Redstone Studio · '+r.version;buildFields();theme();fill();initialized=true;$('#boot').hidden=true;bootRose.stop();updateState(r.state);showTab(false);poll();}catch(e){$('#bootMessage').textContent='加载失败：'+(e.message||e);}}
window.addEventListener('pywebviewready',init);init();setTimeout(()=>{if(!initialized)$('#bootMessage').textContent='等待本地桌面服务。如果长时间没有响应，请关闭窗口后重试。';},10000);
