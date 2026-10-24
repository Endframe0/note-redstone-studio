'use strict';
function aspect(dimensions){return Math.max(dimensions[0],dimensions[2])/Math.min(dimensions[0],dimensions[2])}
function spatialAspect(dimensions){return Math.max(...dimensions)/Math.min(...dimensions)}
// Half the complete block-volume diagonal conservatively bounds every note centre.
function centerRadius(dimensions){return Math.hypot(...dimensions)/2}
function fits(dimensions,opt={}){const [x,y,z]=dimensions,limit=Number(opt.maxAspect??1.5),spatial=Number(opt.maxSpatialAspect||0),radius=Number(opt.maxListeningRadius||0);return (opt.unboundedSize||x<=opt.maxX&&y<=opt.maxY&&z<=opt.maxZ)&&(limit===0||Math.max(x,z)<=Math.min(x,z)*limit+1e-9)&&(!spatial||spatialAspect(dimensions)<=spatial+1e-9)&&(!radius||centerRadius(dimensions)<=radius+1e-9)}
function shapePenalty(dimensions,opt={}){const limit=Number(opt.maxAspect??1.5),spatial=Number(opt.maxSpatialAspect||0),radius=Number(opt.maxListeningRadius||0);return (limit?Math.max(1,aspect(dimensions)/limit)**2:1)*(spatial?Math.max(1,spatialAspect(dimensions)/spatial)**2:1)*(radius?Math.max(1,centerRadius(dimensions)/radius)**3:1)}
function listeningGeometry(m){const center=m.dimensions.map(d=>d/2),origin=m.bounds.map(b=>b[0]);return {center,coordinateType:'ear-position relative to schematic origin',maxNoteDistance:Math.max(...m.notes.map(n=>Math.hypot(...n.position.map((v,i)=>v-origin[i]+.5-center[i])))),boxRadius:centerRadius(m.dimensions),spatialAspect:spatialAspect(m.dimensions),physicalListeningSpaceReserved:false}}
module.exports={aspect,spatialAspect,centerRadius,fits,shapePenalty,listeningGeometry};
