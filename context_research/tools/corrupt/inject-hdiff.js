// DEBT-B06-001: 注入仅做字节级破坏（bitflip/trunc/swap/...）；不覆盖更深层语义级损坏（例如压缩帧内部语义）
// DEBT-B06-003: 大文件注入/复制可能占用较多内存
'use strict';

const fs = require('fs');
const path = require('path');

const HEADER_LEN = 64;
const FOOTER_LEN = 48;
const ENTRY_LEN = 26;

function parseArgs(argv) {
  const out = {
    inFile: null,
    outFile: null,
    mode: 'bitflip',
    seed: 1337,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in' || a === '-i') out.inFile = String(argv[++i] || '');
    else if (a === '--out' || a === '-o') out.outFile = String(argv[++i] || '');
    else if (a === '--mode' || a === '-m') out.mode = String(argv[++i] || '');
    else if (a === '--seed') out.seed = Number(argv[++i] || 0);
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function usage() {
  console.log('Usage: node tools/corrupt/inject-hdiff.js --in <file.hdiff> --out <bad.hdiff> --mode <bitflip|trunc|swap|magicflip|versionflip|indexflip|indextrunc|footerflip|zeropage> [--seed 1337]');
}

// deterministic PRNG (xorshift32)
function makeRng(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= (x << 13) >>> 0;
    x ^= (x >>> 17) >>> 0;
    x ^= (x << 5) >>> 0;
    return x >>> 0;
  };
}

function safeReadU64LE(buf, off) {
  if (off < 0 || off + 8 > buf.length) return null;
  const v = buf.readBigUInt64LE(off);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(v);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.inFile) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const inPath = path.resolve(process.cwd(), args.inFile);
  const outPath = path.resolve(process.cwd(), args.outFile || 'bad.hdiff');

  if (!fs.existsSync(inPath)) {
    console.error(`[FAIL] input not found: ${args.inFile}`);
    process.exit(1);
  }

  const file = fs.readFileSync(inPath);
  let out = Buffer.from(file);
  const rng = makeRng(args.seed);

  const idxOff = safeReadU64LE(out, 0x0B) ?? HEADER_LEN;
  const idxLen = safeReadU64LE(out, 0x13) ?? ENTRY_LEN;

  const mode = args.mode;

  function randInt(maxExclusive) {
    if (maxExclusive <= 0) return 0;
    return (rng() % maxExclusive) >>> 0;
  }

  // Helper: choose an offset range that avoids clobbering the magic by default.
  function pickSafeOffset() {
    if (out.length <= 4) return 0;
    return 4 + randInt(out.length - 4);
  }

  if (mode === 'bitflip') {
    const off = pickSafeOffset();
    const bit = 1 << (randInt(8));
    out[off] ^= bit;
  } else if (mode === 'trunc') {
    if (out.length <= HEADER_LEN) {
      console.error('[FAIL] file too small to truncate');
      process.exit(1);
    }
    // Keep at least the full header so magic remains intact.
    const minLen = Math.min(out.length, HEADER_LEN + 1);
    const newLen = minLen + randInt(out.length - minLen);
    out = out.slice(0, newLen);
  } else if (mode === 'swap') {
    const range = Math.min(64, Math.max(1, Math.floor(out.length / 8)));

    const bodyStart = HEADER_LEN;
    const bodyEnd = Math.max(bodyStart, out.length - FOOTER_LEN);
    const safeSpan = Math.max(0, bodyEnd - bodyStart - range);

    const pick = () => {
      if (safeSpan > 0) return bodyStart + randInt(safeSpan);
      // fallback: avoid first 4 bytes
      return 4 + randInt(Math.max(1, out.length - range - 4));
    };

    const a = pick();
    const b = pick();

    const tmp = Buffer.from(out.slice(a, a + range));
    out.copy(out, a, b, b + range);
    tmp.copy(out, b);
  } else if (mode === 'magicflip') {
    // Clobber magic bytes (explicit unrecoverable class).
    Buffer.from('BAD!').copy(out, 0, 0, 4);
  } else if (mode === 'versionflip') {
    // Byte 5 is "minor" in current header layout (see generate-golden-vector).
    if (out.length >= 6) out[5] ^= 0x01;
  } else if (mode === 'indexflip') {
    const start = Math.max(0, Math.min(out.length, idxOff));
    const end = Math.max(start, Math.min(out.length, idxOff + idxLen));
    if (end - start <= 0) {
      console.error('[FAIL] index region invalid');
      process.exit(1);
    }
    const off = start + randInt(end - start);
    out[off] ^= 0xFF;
  } else if (mode === 'indextrunc') {
    // Corrupt the index length field in header (shrink it).
    const cur = idxLen;
    const dec = Math.max(1, ENTRY_LEN);
    const next = Math.max(0, cur - dec);
    out.writeBigUInt64LE(BigInt(next), 0x13);
  } else if (mode === 'footerflip') {
    if (out.length < FOOTER_LEN) {
      console.error('[FAIL] footer not present');
      process.exit(1);
    }
    const start = out.length - FOOTER_LEN;
    const off = start + randInt(FOOTER_LEN);
    out[off] ^= 0xFF;
  } else if (mode === 'zeropage') {
    // Zero a "page" starting at/after the header so magic survives.
    const page = 4096;
    const start = Math.min(out.length - 1, Math.max(HEADER_LEN, randInt(out.length)));
    const pageStart = start; // keep it simple: start at >= HEADER_LEN
    const end = Math.min(out.length, pageStart + page);
    out.fill(0, pageStart, end);
  } else {
    console.error(`[FAIL] unknown mode: ${mode}`);
    process.exit(1);
  }

  // Small safety: keep output buffer a Buffer.
  if (!Buffer.isBuffer(out)) out = Buffer.from(out);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, out);

  console.log(`[OK] wrote ${path.relative(process.cwd(), outPath).replace(/\\/g,'/')} mode=${mode} seed=${args.seed}`);
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
