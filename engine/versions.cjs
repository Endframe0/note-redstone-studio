'use strict';
const catalog=require('./versions.json');
function get(target='26.1.2') {const v=catalog.find(v=>v.id===target);if(!v)throw Error('不支持的 Java 版本：'+target);return v;}
function supports(target,feature){return !!get(target)[feature];}
function requireEnb(target){const v=get(target);if(!['port','upstream+compat'].includes(v.enb))throw Error(`Java ${v.id} 尚无对应的 ENB 组合。可选择 1.20.1、1.21.1 或 26.x；原版投影仍可使用当前版本。`);return v;}
function warnings(target,options={}){const v=get(target),result=[];if(v.id!=='26.1.2')result.push(`Java ${v.id}：按对应 DataVersion ${v.dataVersion} 导出；尚未完成此版本整曲实机演奏验收。`);if(Number(options.timeResolution)===20&&v.id!=='26.1.2')result.push(v.phaseRuntimeVerified?'20t 错拍启动器已通过此版本独立服务端连续三次测试（6/7 游戏刻）；整曲仍需验收。':'20t 使用原版奇偶错拍电路；此目标版本请先用随包短曲验证相位，再制作长曲。');return result;}
module.exports={catalog,get,supports,requireEnb,warnings};
