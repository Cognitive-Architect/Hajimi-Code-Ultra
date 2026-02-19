// DEBT-DETERMINISM: 仅验证10次确定性，未做长时间稳定性和跨环境测试，P2级别
'use strict';
const crypto = require('crypto');
const { buildMinimalHdiff } = require('./generate-golden-vector');
function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
function main() {
  const hashes = new Set();
  for (let i = 0; i < 10; i++) {
    const { fullFile } = buildMinimalHdiff();
    hashes.add(sha256(fullFile));
  }
  if (hashes.size !== 1) throw new Error('NON_DETERMINISTIC_OUTPUT');
  console.log('DETERMINISTIC_OK');
}
if (require.main === module) main();