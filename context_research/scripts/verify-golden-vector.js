// DEBT-VERIFY: 仅验证最小样例，未覆盖复杂场景和异常数据，P1级别
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { xxh64 } = require('../src/hash/xxh64');
const { blake3_256 } = require('../src/hash/blake3_256');
function mustRead(p) {
  if (!fs.existsSync(p)) throw new Error('Missing file: ' + p);
  return fs.readFileSync(p);
}
function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const dir = path.join(repoRoot, 'delivery', 'v0.9.1');
  const fileBuf = mustRead(path.join(dir, 'minimal.hdiff'));
  const golden = JSON.parse(mustRead(path.join(dir, 'golden-vector.json')).toString('utf8'));
  const sha256 = crypto.createHash('sha256').update(fileBuf).digest('hex');
  if (sha256 !== golden.file_sha256) throw new Error('SHA256 mismatch');
  const footer = fileBuf.slice(fileBuf.length - 48);
  const expectedBlake3 = footer.slice(0, 32);
  const expectedIndexXxh64 = footer.slice(32, 40);
  const footerOffset = fileBuf.length - 48;
  const preFooter = fileBuf.slice(0, footerOffset);
  const actualBlake3 = blake3_256(preFooter);
  if (!actualBlake3.equals(expectedBlake3)) throw new Error('File BLAKE3 field mismatch');
  // index table bytes: header 指定 indexOffset/indexLength
  const indexOffset = Number(fileBuf.readBigUInt64LE(0x0B));
  const indexLength = Number(fileBuf.readBigUInt64LE(0x13));
  const indexTable = fileBuf.slice(indexOffset, indexOffset + indexLength);
  const actualIndexXxh64 = xxh64(indexTable, 0n);
  if (!actualIndexXxh64.equals(expectedIndexXxh64)) throw new Error('Index XXH64 mismatch');
  console.log('VERIFY_OK');
}
if (require.main === module) main();