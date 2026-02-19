// DEBT-B06-001: 重建仅做结构层修复（header/offsets/footer/hash）与简单 index 对齐；不保证语义正确
// DEBT-B06-002: hole 策略简单，且 index 解析只做弱启发式，复杂损坏可能被“修复成自洽但不等价”的文件
// DEBT-B06-003: 大文件重建未做流式处理，可能占用较多内存
'use strict';

const fs = require('fs');
const path = require('path');

const { xxh64 } = require('../../src/hash/xxh64');
const { blake3_256 } = require('../../src/hash/blake3_256');
const { scanBuffer, E1001 } = require('./scanner');

const MAGIC = Buffer.from('HAJI', 'ascii');
const HEADER_LEN = 64;
const FOOTER_LEN = 48;
const ENTRY_LEN = 26;

const CANON_VER = Buffer.from([0x00, 0x09, 0x00, 0x01]); // v0.9.1 (see generate-golden-vector.js)

function parseArgs(argv) {
  const out = { inFile: null, outFile: 'recovered.hdiff', reportFile: 'report.json' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in' || a === '-i') out.inFile = String(argv[++i] || '');
    else if (a === '--out' || a === '-o') out.outFile = String(argv[++i] || '');
    else if (a === '--report') out.reportFile = String(argv[++i] || '');
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function usage() {
  console.log('Usage: node tools/recover/rebuilder.js --in <bad.hdiff> [--out recovered.hdiff] [--report report.json]');
}

function safeReadU64LE(buf, off) {
  if (off < 0 || off + 8 > buf.length) return null;
  const v = buf.readBigUInt64LE(off);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(v);
}

function headerFieldsIfPlausible(buf, preFooterLen) {
  const idxOff = safeReadU64LE(buf, 0x0B);
  const idxLen = safeReadU64LE(buf, 0x13);
  const dataOff = safeReadU64LE(buf, 0x1B);
  const dataLen = safeReadU64LE(buf, 0x23);
  if ([idxOff, idxLen, dataOff, dataLen].some(v => v === null)) return null;

  if (idxOff < HEADER_LEN) return null;
  if (idxLen < 0 || (idxLen % ENTRY_LEN) !== 0) return null;
  if (dataOff < idxOff) return null;
  if (dataOff !== idxOff + idxLen) return null;
  if (idxOff + idxLen > preFooterLen) return null;
  if (dataOff + dataLen > preFooterLen) return null;
  return { idxOff, idxLen, dataOff, dataLen };
}

function inferIndexLengthByHeuristic(bodyBuf) {
  const maxEntries = Math.floor(bodyBuf.length / ENTRY_LEN);
  let good = 0;
  for (let i = 0; i < maxEntries; i++) {
    const off = i * ENTRY_LEN;
    const chunkLen = bodyBuf.readUInt32LE(off + 10);
    const reserved = bodyBuf.readUInt32LE(off + 22);
    // Very weak plausibility: reserved is usually 0; chunkLen non-zero and not insane.
    if (reserved !== 0) break;
    if (chunkLen === 0) break;
    if (chunkLen > 1024 * 1024 * 128) break; // 128MB sanity cap
    good++;
  }
  if (good > 0) return good * ENTRY_LEN;
  // fallback: keep at most one entry if possible
  return bodyBuf.length >= ENTRY_LEN ? ENTRY_LEN : 0;
}

function rebuild(buf) {
  const originalScan = scanBuffer(buf);
  if (!originalScan.magic_ok) {
    // Magic mismatch is defined as unrecoverable.
    return {
      ok: false,
      reason: E1001,
      original_scan: originalScan,
      recovered: null,
      recovered_scan: null,
      actions: { refused: true, why: 'magic mismatch' },
    };
  }

  // Split preFooter and footer candidate.
  const footerPresent = buf.length >= HEADER_LEN + FOOTER_LEN;
  const footerStart = footerPresent ? (buf.length - FOOTER_LEN) : buf.length;
  let preFooter = buf.slice(0, footerStart);

  // Ensure header exists.
  if (preFooter.length < HEADER_LEN) {
    const pad = Buffer.alloc(HEADER_LEN - preFooter.length, 0);
    preFooter = Buffer.concat([preFooter, pad]);
  }

  // Body (index+data) bytes available.
  const body = preFooter.slice(HEADER_LEN);

  const plausible = headerFieldsIfPlausible(preFooter, preFooter.length);

  let idxOff = HEADER_LEN;
  let idxLen;
  let dataOff;
  let dataLen;
  let inferred = false;

  if (plausible) {
    idxOff = plausible.idxOff;
    idxLen = plausible.idxLen;
    dataOff = plausible.dataOff;
    dataLen = plausible.dataLen;
  } else {
    inferred = true;
    // We assume canonical layout: index immediately after header.
    idxLen = inferIndexLengthByHeuristic(body);
    dataOff = HEADER_LEN + idxLen;
    dataLen = Math.max(0, preFooter.length - dataOff);
  }

  // Build new header (copy original then patch)
  const headerNew = Buffer.alloc(HEADER_LEN, 0);
  preFooter.copy(headerNew, 0, 0, HEADER_LEN);

  MAGIC.copy(headerNew, 0);
  CANON_VER.copy(headerNew, 4);

  headerNew.writeBigUInt64LE(BigInt(idxOff), 0x0B);
  headerNew.writeBigUInt64LE(BigInt(idxLen), 0x13);
  headerNew.writeBigUInt64LE(BigInt(dataOff), 0x1B);
  headerNew.writeBigUInt64LE(BigInt(dataLen), 0x23);

  // Extract index/data bytes based on chosen lengths.
  const indexBytes = body.slice(0, idxLen);
  const dataBytes = body.slice(idxLen);

  const indexXBuf = xxh64(indexBytes, 0n); // Buffer(8)

  const preFooterRebuilt = Buffer.concat([headerNew, indexBytes, dataBytes]);
  const strong = blake3_256(preFooterRebuilt);

  const footerNew = Buffer.alloc(FOOTER_LEN, 0);
  strong.copy(footerNew, 0);
  indexXBuf.copy(footerNew, 32);

  const recovered = Buffer.concat([preFooterRebuilt, footerNew]);
  const recoveredScan = scanBuffer(recovered);

  return {
    ok: true,
    original_scan: originalScan,
    recovered,
    recovered_scan: recoveredScan,
    actions: {
      footer_present_in_input: footerPresent,
      header_inferred: inferred,
      index_len: idxLen,
      data_len: dataLen,
      wrote_footer: true,
      restored_version: true,
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.inFile) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const inPath = path.resolve(process.cwd(), args.inFile);
  const outPath = path.resolve(process.cwd(), args.outFile || 'recovered.hdiff');
  const reportPath = path.resolve(process.cwd(), args.reportFile || 'report.json');

  if (!fs.existsSync(inPath)) {
    console.error(`[FAIL] input not found: ${args.inFile}`);
    process.exit(1);
  }

  const buf = fs.readFileSync(inPath);
  const r = rebuild(buf);

  const report = {
    ts_utc: new Date().toISOString(),
    in: args.inFile,
    out: args.outFile,
    ok: r.ok,
    actions: r.actions,
    original_scan: r.original_scan,
    recovered_scan: r.recovered_scan,
  };

  if (!r.ok) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.error(`[FAIL] unrecoverable: ${r.reason}; report=${args.reportFile}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, r.recovered);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`[OK] wrote ${path.relative(process.cwd(), outPath).replace(/\\/g,'/')} report=${path.relative(process.cwd(), reportPath).replace(/\\/g,'/')}`);
  process.exit(0);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('FATAL', err && err.stack ? err.stack : String(err));
    process.exit(1);
  }
}

module.exports = { rebuild };
