// DEBT-B06-001: 仅做字节级结构扫描（header/index/footer/hash）；不做语义级压缩帧/指令流深度校验
// DEBT-B06-003: 大文件扫描/哈希未做流式优化，可能占用较多内存
'use strict';

const fs = require('fs');
const path = require('path');

const { xxh64 } = require('../../src/hash/xxh64');
const { blake3_256 } = require('../../src/hash/blake3_256');
const { mergeHoles } = require('./hole-manager');

const MAGIC = Buffer.from('HAJI', 'ascii');
const HEADER_LEN = 64;
const FOOTER_LEN = 48;

// Error codes (Audit-defined)
const E1001 = 'E1001'; // magic mismatch -> unrecoverable
const E1002 = 'E1002'; // header/offset out-of-bounds
const E1003 = 'E1003'; // index checksum mismatch
const E1004 = 'E1004'; // strong hash mismatch

function parseArgs(argv) {
  const out = { inFile: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in' || a === '-i') out.inFile = String(argv[++i] || '');
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function usage() {
  console.log('Usage: node tools/recover/scanner.js --in <file.hdiff>');
}

function safeReadU64LE(buf, off) {
  if (off < 0 || off + 8 > buf.length) return null;
  const v = buf.readBigUInt64LE(off);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(v);
}

function sliceSafe(buf, start, end) {
  const s = Math.max(0, Math.min(buf.length, start));
  const e = Math.max(0, Math.min(buf.length, end));
  return buf.slice(s, e);
}

function scanBuffer(fileBuf) {
  const fileLen = fileBuf.length;
  const errors = [];

  const magicOk = fileLen >= 4 && fileBuf.slice(0, 4).equals(MAGIC);
  if (!magicOk) {
    errors.push({ code: E1001, message: 'magic mismatch' });
    return {
      ok: false,
      magic_ok: false,
      bytes: fileLen,
      header: null,
      footer_present: fileLen >= FOOTER_LEN,
      recoverable_pct: 0,
      lost_regions: [],
      errors,
    };
  }

  // Header fields (may be corrupted)
  const idxOff = safeReadU64LE(fileBuf, 0x0B);
  const idxLen = safeReadU64LE(fileBuf, 0x13);
  const dataOff = safeReadU64LE(fileBuf, 0x1B);
  const dataLen = safeReadU64LE(fileBuf, 0x23);

  const footerPresent = fileLen >= HEADER_LEN + FOOTER_LEN;
  const footerStart = footerPresent ? (fileLen - FOOTER_LEN) : fileLen;

  // Validate bounds
  let headerOk = true;
  if ([idxOff, idxLen, dataOff, dataLen].some(v => v === null)) {
    headerOk = false;
  } else {
    if (idxOff < HEADER_LEN) headerOk = false;
    if (idxLen < 0) headerOk = false;
    if (dataOff < 0) headerOk = false;
    if (dataLen < 0) headerOk = false;
    if (idxOff + idxLen > footerStart) headerOk = false;
    if (dataOff + dataLen > footerStart) headerOk = false;
    if (!(idxOff <= dataOff)) headerOk = false;
  }
  if (!headerOk) {
    errors.push({ code: E1002, message: 'header offsets out of bounds or unreadable' });
  }

  // Compute recoverable % (data-area bytes only)
  let recoverableBytes = 0;
  let recoverablePct = 0;
  const holes = [];

  if (headerOk && dataLen > 0) {
    const dataEndExpected = dataOff + dataLen;
    const dataEndAvailable = Math.min(footerStart, dataEndExpected);
    recoverableBytes = Math.max(0, dataEndAvailable - dataOff);
    recoverablePct = Math.round((recoverableBytes / dataLen) * 10000) / 100;

    if (recoverableBytes < dataLen) {
      holes.push({ start: dataOff + recoverableBytes, end: dataEndExpected, reason: 'missing_bytes' });
    }
  }

  // Footer checks (only if present)
  let indexOk = null;
  let strongOk = null;
  let indexXExpectedHex = null;
  let indexXActualHex = null;
  let blake3ExpectedHex = null;
  let blake3ActualHex = null;

  if (!footerPresent) {
    errors.push({ code: E1002, message: 'footer missing (file truncated)' });
  } else {
    const footer = fileBuf.slice(footerStart);
    const footerBlake3 = footer.slice(0, 32);
    const footerIndexX = footer.slice(32, 40);

    // index checksum
    if (headerOk) {
      const indexBytes = sliceSafe(fileBuf, idxOff, idxOff + idxLen);
      const indexXBuf = xxh64(indexBytes, 0n); // Buffer(8)
      indexXExpectedHex = indexXBuf.toString('hex');
      indexXActualHex = footerIndexX.toString('hex');
      indexOk = indexXBuf.equals(footerIndexX);
      if (!indexOk) errors.push({ code: E1003, message: 'index checksum mismatch' });

      // strong hash
      const preFooter = fileBuf.slice(0, footerStart);
      const b3 = blake3_256(preFooter);
      blake3ExpectedHex = b3.toString('hex');
      blake3ActualHex = footerBlake3.toString('hex');
      strongOk = b3.equals(footerBlake3);
      if (!strongOk) errors.push({ code: E1004, message: 'file BLAKE3 mismatch' });
    }
  }

  return {
    ok: errors.length === 0,
    magic_ok: true,
    bytes: fileLen,
    header: headerOk
      ? { index_offset: idxOff, index_length: idxLen, data_offset: dataOff, data_length: dataLen }
      : { index_offset: idxOff, index_length: idxLen, data_offset: dataOff, data_length: dataLen, suspect: true },
    footer_present: footerPresent,
    recoverable_pct: recoverablePct,
    recoverable_bytes: recoverableBytes,
    lost_regions: mergeHoles(holes),
    checks: {
      index_ok: indexOk,
      strong_ok: strongOk,
      index_xxh64_expected_hex: indexXExpectedHex,
      index_xxh64_actual_hex: indexXActualHex,
      blake3_expected_hex: blake3ExpectedHex,
      blake3_actual_hex: blake3ActualHex,
    },
    errors,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.inFile) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const inPath = path.resolve(process.cwd(), args.inFile);
  if (!fs.existsSync(inPath)) {
    console.error(`[FAIL] input not found: ${args.inFile}`);
    process.exit(1);
  }

  const buf = fs.readFileSync(inPath);
  const report = scanBuffer(buf);

  // include small metadata
  report.ts_utc = new Date().toISOString();
  report.file = args.inFile;

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(report.ok ? 0 : 1);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('FATAL', err && err.stack ? err.stack : String(err));
    process.exit(1);
  }
}

module.exports = { scanBuffer, E1001, E1002, E1003, E1004 };
