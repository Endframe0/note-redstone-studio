'use strict';
const fs=require('node:fs');
function isMidi(file){const b=Buffer.isBuffer(file)?file:fs.readFileSync(file);return b.toString('ascii',0,4)==='MThd'}
function parse(file,opt){const b=Buffer.isBuffer(file)?file:fs.readFileSync(file);return isMidi(b)?require('./midi.cjs').parse(b,opt):require('./nbs.cjs').parse(b,opt)}
module.exports={parse,isMidi};
