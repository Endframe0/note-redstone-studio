'use strict';
// A finite enumeration horizon is needed by template loops. It grows with the
// actual song, and is not an acceptance constraint on completed candidates.
function domain(song,opt={}){
 const cost=song.notes.length*32+song.events.length*192;
 const ratio=Math.max(1,Number(opt.maxSpatialAspect)||2,Number(opt.maxAspect)||1.5);
 const extent=Math.max(128,4*Math.ceil(Math.cbrt(Math.max(1,cost)*ratio*ratio)));
 return {unboundedSize:true,maxX:extent,maxY:extent,maxZ:extent,maxListeningRadius:0,searchDomain:{kind:'song-scaled-enumeration',extent}};
}
module.exports={domain};
