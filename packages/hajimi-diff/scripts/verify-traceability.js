'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256Hex(buf){ return crypto.createHash('sha256').update(buf).digest('hex'); }
function mustExist(p){ if(!fs.existsSync(p)) throw new Error('Missing: '+p); }

function main(){
  const repoRoot = path.resolve(__dirname,'..');
  const dir = path.join(repoRoot,'delivery','v0.9.1');
  const hdiff = path.join(dir,'minimal.hdiff');
  const gv = path.join(dir,'golden-vector.json');
  mustExist(hdiff); mustExist(gv);

  const fileBuf = fs.readFileSync(hdiff);
  const golden = JSON.parse(fs.readFileSync(gv,'utf8'));
  const actual = sha256Hex(fileBuf);
  if (actual !== golden.file_sha256) throw new Error('Hash mismatch: minimal.hdiff sha256');

  console.log('TRACE_OK');
}
if(require.main===module) main();