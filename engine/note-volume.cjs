'use strict';
// NBS effective volume is note velocity * layer volume (both percentages).
// ENB stores integer 0..127. Keep very quiet nonzero notes audible at step 1.
function toEnbVelocity(velocity=100,layerVolume=100){
 for(const v of [velocity,layerVolume])if(!Number.isFinite(v)||v<0||v>100)throw Error('NBS 音符力度或音轨音量超出 0–100');
 if(velocity===0||layerVolume===0)return 0;
 return Math.max(1,Math.round(127*velocity*layerVolume/10000));
}
function enbVelocity(n){
 const v=n.enbVelocity??toEnbVelocity(n.velocity??100,n.layerVolume??100);
 if(!Number.isInteger(v)||v<0||v>127)throw Error('ENB 力度超出 0–127');
 return v;
}
// Only normalized ENB songs include this field; vanilla reuse stays unchanged.
const toneKey=n=>[n.instrument,n.key,n.enbVelocity??'',n.enbSustainTime??'',n.enbFadeInTime??'',n.enbFadeOutTime??''].join(':');
const eventKey=n=>n.tick+'/'+toneKey(n);
module.exports={toEnbVelocity,enbVelocity,toneKey,eventKey};
