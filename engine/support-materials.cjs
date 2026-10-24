'use strict';
const colors={white:'白色',orange:'橙色',magenta:'品红色',light_blue:'淡蓝色',yellow:'黄色',lime:'黄绿色',pink:'粉红色',gray:'灰色',light_gray:'淡灰色',cyan:'青色',purple:'紫色',blue:'蓝色',brown:'棕色',green:'绿色',red:'红色',black:'黑色'};
const materials={cobblestone:'圆石',stone:'石头',light_gray_wool:'淡灰色羊毛',quartz_block:'石英块',iron_block:'铁块',gold_block:'金块',...Object.fromEntries(Object.entries(colors).map(([id,name])=>[id+'_concrete',name+'混凝土']))};
// Reuse controllers are built in canonical cobblestone. Only their structural
// full cubes change; instrument bases and hopper contents must keep their role.
function replaceCanonicalSupports(m,support='cobblestone'){
 if(!materials[support])throw Error('不支持的结构支撑材料');
 const bases=new Set(m.notes.map(n=>[n.position[0],n.position[1]-1,n.position[2]].join()));
 if(support!=='cobblestone')m.blocks=m.blocks.map(b=>b.block==='cobblestone'&&!bases.has(b.position.join())?{...b,block:support}:b);
 return m;
}
module.exports={materials,replaceCanonicalSupports};
