'use strict';
function envelope(n,startRedstoneTick,plan,opt,source){
 // Sand-base snare uses its original one-shot sample, including in manual mode.
 // Keep onset velocity/CC gain from the parser; never synthesize a held drum.
 if(n.instrument===3)return {enbNaturalPercussion:true};
 if(opt.midiEnvelope==='adaptive')return require('./midi-adaptive-envelope.cjs').adaptive(n,startRedstoneTick,plan,source);
 const endGameTick=Math.round(require('./midi-timing.cjs').mapExact(n.midiEndTick,plan)*20/plan.resolution);
 const sustain=Math.max(1,endGameTick-startRedstoneTick*2),mode=opt.midiEnvelope||'custom';
 const ms=[Number(opt.midiFadeInMs??0),Number(opt.midiFadeOutMs??50)];
 if(!['custom','none'].includes(mode)||ms.some(v=>!Number.isFinite(v)||v<0||v>20000))throw Error('MIDI 淡入淡出设置无效（0–20000 毫秒）。');
 let [fadeIn,fadeOut]=ms.map(v=>mode==='none'?0:Math.round(v/50));
 // Both ramps live within the note, never extend it or overlap each other.
 const budget=Math.max(0,sustain-1);if(fadeIn+fadeOut>budget){const scale=budget/(fadeIn+fadeOut);fadeIn=Math.floor(fadeIn*scale);fadeOut=budget-fadeIn}
 return {enbSustainTime:sustain,enbFadeInTime:fadeIn,enbFadeOutTime:fadeOut};
}
module.exports={envelope};
