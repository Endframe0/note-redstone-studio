'use strict';
// Each lane reports counters local to its current finite catalog. Convert
// those snapshots into one monotonic total without counting final stats twice.
function countWork(lane,event){
 if(lane==='ordinary')return Number(event.attempts||0);
 if(lane==='sand-packing')return Number(event.trials??event.builds??0);
 if(lane==='reuse')return ['motifs','residualBuilds','residualSplitBuilds','residualSplitPoses','corePlacements','attemptedRecipes'].reduce((n,k)=>n+Number(event[k]||0),0);
 return Number(event.builds||0)+Number(event.poses||0);
}
class ProgressTotals{
 constructor(){this.lanes=new Map();}
 observe(lane,cycle,event){
  const old=this.lanes.get(lane)||{cycle:0,completed:0,current:0};
  if(cycle<old.cycle)return;
  if(cycle>old.cycle){old.completed+=old.current;old.current=0;old.cycle=cycle;}
  const value=countWork(lane,event);if(Number.isFinite(value)&&value>=0)old.current=Math.max(old.current,value);
  this.lanes.set(lane,old);
 }
 get total(){return [...this.lanes.values()].reduce((n,s)=>n+s.completed+s.current,0);}
 laneTotal(lane){const s=this.lanes.get(lane);return s?s.completed+s.current:0;}
}
module.exports={ProgressTotals,countWork};
