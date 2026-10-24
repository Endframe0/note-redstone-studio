'use strict';
const {analyzeMotifs}=require('./motif-analysis.cjs');
const {eligible}=require('./phrase-hybrid-search.cjs');
const {coreCompatibility}=require('./phrase-core-shapes.cjs');
// Analyze once before scheduling, then reuse the exact same immutable catalog.
// Savings count disjoint source notes; repeated overlapping windows cannot
// inflate the ratio. This is a gate, never a claim of geometric savings.
function inspectReuse(song,opt={}){
 if(!require('./versions.cjs').supports(opt.target,'reuse'))return{summary:{analyzedOnce:false,enabled:false,reason:'此版本没有铜灯，跳过乐句复用分析',sourceNotes:song.notes.length,geometrySavingsVerified:false},analysis:null};
 const analysis=analyzeMotifs(song,{maxEvents:64,minEvents:opt.objective==='materials'?1:2,minSavedNotes:opt.objective==='materials'?1:8,limit:128,candidateLimit:Infinity,includeCandidates:true,candidateDiversity:true});
 const candidates=[];let unsupportedCoreCandidates=0;
 for(const c of analysis.candidates){
  if(!coreCompatibility(c.pattern).supported){unsupportedCoreCandidates++;continue;}
  if(eligible(c)){candidates.push(c);continue;}
  // The existing physical timer handles 2–3 calls. A frequently repeated
  // phrase may use a subset; unmatched occurrences remain ordinary notes.
  for(let i=0;i<c.calls.length-1;i++){
   const calls=c.calls.slice(i,i+3),subset={...c,calls,savedNotes:c.templateNotes*(calls.length-1)};
   if(eligible(subset)){candidates.push(subset);break;}
   if(calls.length===3){subset.calls=calls.slice(0,2);subset.savedNotes=c.templateNotes;if(eligible(subset)){candidates.push(subset);break;}}
  }
 }
 const ratio=analysis.potentialPhysicalNoteSavings/Math.max(1,song.notes.length),threshold=.2;
 const supported=require('./versions.cjs').supports(opt.target,'reuse')&&opt.externalInputs!==false&&Number(opt.maxTracks??8)>=2;
 const enabled=supported&&(opt.objective==='materials'||ratio>=threshold)&&candidates.length>0;
 const summary={analyzedOnce:true,sourceNotes:song.notes.length,potentialSavedNotes:analysis.potentialPhysicalNoteSavings,ratio,threshold,eligibleSchedules:candidates.length,unsupportedCoreCandidates,enabled,reason:!supported?'当前版本或入口数量不支持复用':opt.objective!=='materials'&&ratio<threshold?'可省音符比例低于 20%':!candidates.length?'没有符合现有复用核心容量及计时范围的重复乐句':opt.objective==='materials'?'极限省材：强制复用，不受重复比例门槛限制':'重复度达标，加入体积竞争',geometrySavingsVerified:false};
 return {summary,analysis:{...analysis,candidates}};
}
module.exports={inspectReuse};
