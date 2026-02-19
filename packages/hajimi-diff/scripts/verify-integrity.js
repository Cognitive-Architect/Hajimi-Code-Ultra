'use strict';
const fs = require('fs');
const path = require('path');

function mustExist(p){ if(!fs.existsSync(p)) throw new Error('Missing: '+p); }
function mustNotContain(p, needle){
  const t = fs.readFileSync(p,'utf8');
  if (t.includes(needle)) throw new Error('Found forbidden token: '+needle);
}

function main(){
  const repoRoot = path.resolve(__dirname,'..');
  const spec = path.join(repoRoot,'delivery','v0.9.1','Hajimi-Diff-Format-Spec-v0.9.1.md');
  mustExist(spec);
  // IC-001: 不允许出现 CRC32-C 相关字段（按冻结口径）
  mustNotContain(spec, 'CRC32');
  mustNotContain(spec, 'CRC32C');
  console.log('INTEGRITY_SPEC_OK');
}
if(require.main===module) main();