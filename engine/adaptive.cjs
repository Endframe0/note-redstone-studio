'use strict';
const {parse}=require('./music-source.cjs');
// Inspect source timestamps, never infer tempo or pitch from a filename.
function plan(raw,options={}){
 raw=require('./midi-mapping.cjs').apply(raw,options);
 const opt={...options},automatic=opt.adaptive===true,messages=[];
 if(automatic)Object.assign(opt,{speed:1,transpose:0,pitch:opt.pitch||'strict',timing:'auto',soundEngine:opt.soundEngine||'vanilla',backend:'cpu',heavyCore:false,externalInputs:true,autoStartWiring:true,workers:Math.max(1,Math.min(16,require('node:os').availableParallelism())),maxTracks:8,unboundedSize:true,maxAspect:Number(options.maxAspect??1.5),maxSpatialAspect:Number(options.maxSpatialAspect??2),maxListeningRadius:0});
 if(opt.soundEngine==='auto')throw Error('请明确选择纯原版音符盒或 ENB 模组版；程序不再自动切换。');
 const notes=raw.notes.filter(n=>n.velocity!==0&&raw.layers[n.layer]?.volume!==0);
 if(!notes.length)throw Error('文件没有可发声的音符。');
 const speed=Number(opt.speed??1),transpose=Number(opt.transpose??0),counts=new Map();
 let exact10=true,exact20=true,low=Infinity,high=-Infinity,velocity=false;
 for(const n of notes){
  const seconds=n.tick/raw.tempo/speed,key=n.key+n.pitch/100+transpose;
  exact10&&=Math.abs(seconds*10-Math.round(seconds*10))<1e-7;
  exact20&&=Math.abs(seconds*20-Math.round(seconds*20))<1e-7;
  low=Math.min(low,key);high=Math.max(high,key);
  velocity||=(n.velocity??100)!==100||(raw.layers[n.layer]?.volume??100)!==100;
  counts.set(n.tick,(counts.get(n.tick)||0)+1);
 }
 let peak=0;for(const count of counts.values())peak=Math.max(peak,count);
 const duration=notes.at(-1).tick/raw.tempo/speed;
 if(automatic){
  opt.objective=notes.length>20000||peak>136?'toxic':'volume';
  opt.seconds=notes.length<2000?30:notes.length<10000?60:180;
  messages.push(opt.objective==='toxic'?`密度较高（最多 ${peak} 音同时发声），自动使用毒曲：宽高 ≤100，长度不限，含命令方块跟随。`:`自动体积优先：CPU ${opt.workers} 线程，搜索预算 ${opt.seconds} 秒，有可用方案后自动导出。`);
  require('./versions.cjs').get(opt.target);
 }
 if(raw.sourceType==='midi'){
  opt.midiPlan=require('./midi-timing.cjs').plan(raw,{...opt,midiAutoResolution:true});opt.timeResolution=opt.midiPlan.resolution;opt.timing=opt.midiPlan.exact?'strict':'quantize';
  if(opt.soundEngine==='extended'&&require('./versions.cjs').get(opt.target).enb!=='port')throw Error('MIDI 时长与淡入淡出需要配套 26.x ENB 移植版；也可以选择纯原版音符盒，不保留独立时长与渐变。');
  messages.push(...require('./midi-timing.cjs').messages(opt.midiPlan));
 }else if(opt.timing==='auto'){
  opt.timeResolution=Math.abs(raw.tempo*speed-20)<1e-7||!exact10?20:10;
  if(!exact20)throw Error('此曲不能精确落在游戏刻上。自动模式不会改变节奏；请切到手动配置，在音乐时序中选择“20t 最近游戏刻（±25 ms）”。');
  opt.timing='strict';
  messages.push(`文件速度 ${raw.tempo} tick/s → ${opt.timeResolution===20?'20t 严格档（0.05 秒）':'普通严格档（0.1 秒）'}；保持原曲速度${speed===1?'':` × ${speed}`}。`);
 }
 if(Number(opt.timeResolution)===20&&(opt.objective==='materials'))throw Error('精确播放此曲需要 20t；请选择体积优先或毒曲模式。极限省材暂不支持 20t。');
 if(opt.soundEngine==='extended')require('./versions.cjs').requireEnb(opt.target);
 messages.push(opt.soundEngine==='extended'?'按你的选择使用 ENB 模组音符盒，保留音符力度；游戏必须安装配套 ENB，粘贴保留方块实体 NBT。':opt.soundEngine==='quinn'?'按你的选择使用 Quinn 数据包。':'按你的选择使用纯原版音符盒，不会自动切换模组版。原版为两八度，不能独立设置音符时长、渐变与力度。');
 if(opt.pitch==='fold')messages.push('按你的选择折叠超出音域的音符；起音节奏保留，具体音高变更数记录在转换报告。');
 if(automatic){
  messages.push('普通布线、沙子独立音轨和层间压缩共同搜索；符合条件时自动检查乐句复用。自动连接外部启动线。');
  if(opt.objective==='volume')messages.push(`不限制主体长、宽、高或听音半径；水平长短边比例 ${opt.maxAspect||'不限'}，整体最长边 / 最短边 ${opt.maxSpatialAspect||'不限'}。搜索范围随歌曲规模扩展。`);
  if(velocity&&opt.soundEngine!=='extended')messages.push('当前音域方案不保留逐音符力度。');
 }
 // Normalize once for early validation (microtones/custom instruments included).
 const song=require('./normalize.cjs').normalize(raw,opt);
 if(automatic&&opt.objective==='volume')Object.assign(opt,require('./automatic-space.cjs').domain(song,opt));
 return {options:opt,summary:{sourceType:raw.sourceType||'nbs',midi:opt.midiPlan||null,tempo:raw.sourceType==='midi'?60e6/raw.midi.tempo[0].us:raw.tempo,notes:notes.length,onsets:counts.size,peak,durationSeconds:song.midiConversion?.durationSeconds??duration,keyRange:[low,high],timeResolution:Number(opt.timeResolution??10),timing:opt.timing||'strict',soundEngine:opt.soundEngine||'vanilla',objective:opt.objective||'volume',seconds:opt.seconds,messages,warnings:song.warnings}};
}
function inspect(options){return plan(parse(options.input,{maxNotes:1000000}),options);}
if(require.main===module){let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);process.stdin.on('end',()=>{try{const r=inspect(JSON.parse(input));process.stdout.write(JSON.stringify({ok:true,...r}));}catch(e){process.stdout.write(JSON.stringify({ok:false,error:e.message}));}});}
module.exports={plan,inspect};
