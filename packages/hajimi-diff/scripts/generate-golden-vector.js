// DEBT-B01-001: 黄金向量payload当前为固定字符串"Hello, Hajimi!"，若需真随机性需改用crypto.randomBytes
// DEBT-GOLDEN: 仅生成最小样例，未覆盖完整压缩场景和复杂数据，P1级别
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { xxh64 } = require('../src/hash/xxh64');
const { blake3_256 } = require('../src/hash/blake3_256');
function u64leWrite(buf, off, v) {
  buf.writeBigUInt64LE(BigInt(v), off);
}
function buildZstdRawFrame(payload) {
  // zstd frame: magic(4) + frameHeaderDescriptor(1) + frameContentSize(1) + blockHeader(3) + rawPayload
  // 选型：single segment=1 + fcs=1byte + no dict + no checksum
  const magic = Buffer.from([0x28, 0xB5, 0x2F, 0xFD]);
  const fhd = Buffer.from([0x20]); // single-segment=1, fcsFlag=0, dict=0, checksum=0
  const fcs = Buffer.from([payload.length & 0xFF]);
  // block header: last=1, type=raw(0b00), size=payload.length
  const bhVal = (payload.length << 3) | 0x01;
  const bh = Buffer.from([bhVal & 0xFF, (bhVal >> 8) & 0xFF, (bhVal >> 16) & 0xFF]);
  return Buffer.concat([magic, fhd, fcs, bh, payload]);
}
function buildMinimalHdiff() {
  const raw = Buffer.from('Hello, Hajimi!', 'utf8'); // 14 bytes
  const zstdFrame = buildZstdRawFrame(raw);
  const HEADER_LEN = 64;
  const INDEX_ENTRY_LEN = 26;
  const FOOTER_LEN = 48;
  const indexCount = 1;
  const indexOffset = HEADER_LEN;
  const indexLength = INDEX_ENTRY_LEN * indexCount;
  const dataOffset = indexOffset + indexLength;
  const dataLength = zstdFrame.length;
  const footerOffset = dataOffset + dataLength;
  // Header (64B) - 按冻结规格字段布局
  const header = Buffer.alloc(HEADER_LEN, 0);
  header.write('HAJI', 0, 4, 'ascii');
  header.writeUInt8(0x00, 0x04); // major
  header.writeUInt8(0x09, 0x05); // minor
  header.writeUInt8(0x00, 0x06); // flags
  header.writeUInt32LE(indexCount, 0x07);
  u64leWrite(header, 0x0B, indexOffset);
  u64leWrite(header, 0x13, indexLength);
  u64leWrite(header, 0x1B, dataOffset);
  u64leWrite(header, 0x23, dataLength);
  u64leWrite(header, 0x2B, footerOffset);
  // 0x33..0x3F reserved+padding already zeroed
  // Index Entry (26B)
  const indexEntry = Buffer.alloc(INDEX_ENTRY_LEN, 0);
  u64leWrite(indexEntry, 0x00, dataOffset);             // absolute file offset
  indexEntry.writeUInt32LE(dataLength, 0x08);            // compressed length
  indexEntry.writeUInt32LE(raw.length, 0x0C);            // uncompressed length
  // Flags: bits[15:14]=Importance, bits[13:2]=DictID, bits[1:0]=0
  const importanceUser = 0b10;
  const dictId = 0; // minimal sample no dict
  const flags = (importanceUser << 14) | (dictId << 2);
  indexEntry.writeUInt16LE(flags & 0xFFFF, 0x10);
  const chunkXxh64 = xxh64(zstdFrame, 0n);               // 输入：压缩帧字节（文件真实内容）
  chunkXxh64.copy(indexEntry, 0x12);
  // File body (no footer)
  const preFooter = Buffer.concat([header, indexEntry, zstdFrame]);
  // Footer (48B): blake3_256(preFooter) + index_xxh64(indexTable) + reserved(8)
  const footer = Buffer.alloc(FOOTER_LEN, 0);
  const fileBlake3 = blake3_256(preFooter);
  fileBlake3.copy(footer, 0x00);
  const indexTableBytes = Buffer.concat([indexEntry]);
  const indexXxh64 = xxh64(indexTableBytes, 0n);
  indexXxh64.copy(footer, 0x20);
  const fullFile = Buffer.concat([preFooter, footer]);
  const fileSha256 = crypto.createHash('sha256').update(fullFile).digest('hex');
  const golden = {
    version: '0.9.1',
    file_size: fullFile.length,
    hash_algo: 'blake3-256', // 我们现在使用自己实现的BLAKE3-256
    file_sha256: fileSha256,
    file_blake3_256_hex: fileBlake3.toString('hex'),
    index_xxh64_hex: indexXxh64.toString('hex'),
    chunk_xxh64_hex: chunkXxh64.toString('hex'),
    layout: {
      header_len: HEADER_LEN,
      index_entry_len: INDEX_ENTRY_LEN,
      footer_len: FOOTER_LEN,
      index_count: indexCount,
      index_offset: indexOffset,
      index_length: indexLength,
      data_offset: dataOffset,
      data_length: dataLength,
      footer_offset: footerOffset
    }
  };
  return { fullFile, golden };
}
function writeArtifacts() {
  const repoRoot = path.resolve(__dirname, '..');
  const outDir = path.join(repoRoot, 'delivery', 'v0.9.1');
  fs.mkdirSync(outDir, { recursive: true });
  const { fullFile, golden } = buildMinimalHdiff();
  fs.writeFileSync(path.join(outDir, 'minimal.hdiff'), fullFile);
  fs.writeFileSync(path.join(outDir, 'golden-vector.json'), JSON.stringify(golden, null, 2));
  console.log('[OK] Wrote: delivery/v0.9.1/minimal.hdiff');
  console.log('[OK] Wrote: delivery/v0.9.1/golden-vector.json');
  console.log('[INFO] hash_algo=', golden.hash_algo);
}
if (require.main === module) {
  writeArtifacts();
}
module.exports = { buildMinimalHdiff };