'use strict';
const fs=require('node:fs');
function parse(file,{maxNotes=20000}={}){
 if(!Number.isInteger(maxNotes)||maxNotes<1||maxNotes>1000000)throw Error('音符读取上限无效');
 const b=Buffer.isBuffer(file)?file:fs.readFileSync(file);let o=0;
 if(b.length>32*1024*1024)throw Error('NBS 超过 32 MB，拒绝读取。');
 const need=n=>{if(o+n>b.length)throw Error(`NBS 在字节 ${o} 处截断。`)};
 const u8=()=>{need(1);return b.readUInt8(o++)};
 const u16=()=>{need(2);const n=b.readUInt16LE(o);o+=2;return n};
 const i16=()=>{need(2);const n=b.readInt16LE(o);o+=2;return n};
 const i32=()=>{need(4);const n=b.readInt32LE(o);o+=4;return n};
 function str(){const n=i32();if(n<0||n>1048576)throw Error('NBS 字符串长度无效。');need(n);const s=b.toString('utf8',o,o+n);o+=n;return s}
 let length=u16(),version=0,instrumentCount=10;
 if(length===0){version=u8();if(version<1||version>6)throw Error(`不支持的 NBS 版本 ${version}（支持 0–6）。`);instrumentCount=u8();if(version>=3)length=u16()}
 const layerCount=u16(),name=str(),author=str(),originalAuthor=str(),description=str(),tempo=u16()/100;
 if(tempo<=0)throw Error('NBS 速度必须大于 0。');
 const autosave=u8(),autosaveMinutes=u8(),timeSignature=u8(),statistics=Array.from({length:5},i32),importFile=str();
 const loop=version>=4?{enabled:u8(),count:u8(),start:u16()}:null;
 const notes=[];let tick=-1,referencedLayerCount=0;
 for(;;){const dt=u16();if(!dt)break;tick+=dt;let layer=-1;
  for(;;){const dl=u16();if(!dl)break;layer+=dl;
   if(layer>=65535)throw Error('NBS 音符层编号超出 65535 层格式范围。');
   referencedLayerCount=Math.max(referencedLayerCount,layer+1);
   const instrument=u8(),key=u8(),velocity=version>=4?u8():100,panning=version>=4?u8():100,pitch=version>=4?i16():0;
   if(key>87||velocity>100||panning>200)throw Error('NBS 音符字段超出规范范围。');
   notes.push({tick,layer,instrument,key,velocity,panning,pitch});if(notes.length>maxNotes)throw Error(`本模式最多转换 ${maxNotes} 个音符。${maxNotes===20000?'超大文件可选择毒曲模式。':''}`);
  }
 }
 const layers=[],custom=[];
 if(o<b.length)for(let i=0;i<layerCount;i++){const name=str(),locked=version>=4?u8():0,volume=u8(),panning=version>=2?u8():100;if(volume>100||panning>200)throw Error('NBS 层参数无效。');layers.push({name,locked,volume,panning})}
 if(o<b.length){const n=u8();for(let i=0;i<n;i++)custom.push({name:str(),sound:str(),key:u8(),press:u8()})}
 if(o!==b.length)throw Error('NBS 含无法识别的尾部数据。');
 // Some legacy/exported songs understate the height. Parse the tail using
 // the DECLARED count first, so omitted layer settings never consume custom
 // instrument bytes. Only after all bytes validate, extend the in-memory
 // layer table. Notes, layer indices and the source file remain untouched.
 const metadataLayerCount=layers.length,effectiveLayerCount=Math.max(layerCount,referencedLayerCount),compatibilityWarnings=[];
 if(referencedLayerCount>layerCount)compatibilityWarnings.push(`NBS 声明 ${layerCount} 层，音符实际用到第 ${referencedLayerCount} 层；已兼容读取全部音符，未改动原文件或合并重复音符。`);
 if(metadataLayerCount<effectiveLayerCount){
  compatibilityWarnings.push(`有 ${effectiveLayerCount-metadataLayerCount} 层缺少设置，按默认音量 100%、居中声像、未锁定处理；已有层设置保持不变。`);
  while(layers.length<effectiveLayerCount)layers.push({name:'',locked:0,volume:100,panning:100});
 }
 return{version,instrumentCount,length,layerCount:effectiveLayerCount,declaredLayerCount:layerCount,referencedLayerCount,metadataLayerCount,compatibilityWarnings,name,author,originalAuthor,description,tempo,autosave,autosaveMinutes,timeSignature,statistics,importFile,loop,layers,custom,notes};
}
module.exports={parse};
