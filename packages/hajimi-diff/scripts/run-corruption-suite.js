// DEBT-B06-001: 本 suite 的损坏注入与恢复均为“字节级”练兵，不覆盖更深语义层破坏（如压缩帧内部语义）
// DEBT-B06-003: 对大文件恶意注入+恢复未做流式优化，可能 OOM；本 suite 默认使用 minimal.hdiff 小样本
'use strict';

const fs = require('fs');
const path = require('path');

const { rebuild } = require('../tools/recover/rebuilder');

const HEADER_LEN = 64;
const FOOTER_LEN = 48;
const ENTRY_LEN = 26;

function safeReadU64LE(buf, off) {
  if (off < 0 || off + 8 > buf.length) return null;
  const v = buf.readBigUInt64LE(off);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(v);
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

function randInt(rng, maxExclusive) {
  if (maxExclusive <= 0) return 0;
  return (rng() % maxExclusive) >>> 0;
}

function injectCorruption(buf, mode, seed) {
  const rng = makeRng(seed);
  let out = Buffer.from(buf);

  const idxOff = safeReadU64LE(out, 0x0B) ?? HEADER_LEN;
  const idxLen = safeReadU64LE(out, 0x13) ?? ENTRY_LEN;

  function pickSafeOffset() {
    if (out.length <= 4) return 0;
    return 4 + randInt(rng, out.length - 4);
  }

  if (mode === 'bitflip') {
    const off = pickSafeOffset();
    const bit = 1 << randInt(rng, 8);
    out[off] ^= bit;
    return out;
  }

  if (mode === 'trunc') {
    if (out.length <= HEADER_LEN) return out;
    const minLen = Math.min(out.length, HEADER_LEN + 1);
    const newLen = minLen + randInt(rng, out.length - minLen);
    return out.slice(0, newLen);
  }

  if (mode === 'swap') {
    const range = Math.min(64, Math.max(1, Math.floor(out.length / 8)));
    const bodyStart = HEADER_LEN;
    const bodyEnd = Math.max(bodyStart, out.length - FOOTER_LEN);
    const safeSpan = Math.max(0, bodyEnd - bodyStart - range);

    const pick = () => {
      if (safeSpan > 0) return bodyStart + randInt(rng, safeSpan);
      return 4 + randInt(rng, Math.max(1, out.length - range - 4));
    };

    const a = pick();
    const b = pick();

    const tmp = Buffer.from(out.slice(a, a + range));
    out.copy(out, a, b, b + range);
    tmp.copy(out, b);
    return out;
  }

  if (mode === 'versionflip') {
    if (out.length >= 6) out[5] ^= 0x01;
    return out;
  }

  if (mode === 'indexflip') {
    const start = Math.max(0, Math.min(out.length, idxOff));
    const end = Math.max(start, Math.min(out.length, idxOff + idxLen));
    if (end - start <= 0) return out;
    const off = start + randInt(rng, end - start);
    out[off] ^= 0xFF;
    return out;
  }

  if (mode === 'indextrunc') {
    const cur = idxLen;
    const dec = Math.max(1, ENTRY_LEN);
    const next = Math.max(0, cur - dec);
    if (out.length >= 0x13 + 8) out.writeBigUInt64LE(BigInt(next), 0x13);
    return out;
  }

  if (mode === 'footerflip') {
    if (out.length < FOOTER_LEN) return out;
    const start = out.length - FOOTER_LEN;
    const off = start + randInt(rng, FOOTER_LEN);
    out[off] ^= 0xFF;
    return out;
  }

  if (mode === 'zeropage') {
    const page = 4096;
    const start = Math.min(out.length - 1, Math.max(HEADER_LEN, randInt(rng, out.length)));
    const end = Math.min(out.length, start + page);
    out.fill(0, start, end);
    return out;
  }

  throw new Error(`unknown mode: ${mode}`);
}

function main() {
  const repoRoot = path.join(__dirname, '..');
  const basePath = path.join(repoRoot, 'delivery', 'v0.9.1', 'minimal.hdiff');
  if (!fs.existsSync(basePath)) {
    console.error('[FAIL] missing delivery/v0.9.1/minimal.hdiff');
    process.exit(1);
  }

  const base = fs.readFileSync(basePath);

  const modes = [
    'bitflip',
    'trunc',
    'swap',
    'versionflip',
    'indexflip',
    'indextrunc',
    'footerflip',
    'zeropage',
  ];

  let passed = 0;

  for (let i = 0; i < 100; i++) {
    const mode = modes[i % modes.length];
    const bad = injectCorruption(base, mode, 1000 + i);

    const r = rebuild(bad);
    if (!r.ok) {
      console.error(`[FAIL] rebuild refused i=${i} mode=${mode}`);
      process.exit(1);
    }
    if (!r.recovered_scan || r.recovered_scan.ok !== true) {
      console.error(`[FAIL] recovered scan not ok i=${i} mode=${mode}`);
      process.exit(1);
    }

    passed++;
  }

  if (passed !== 100) {
    console.error(`[FAIL] expected 100 passed, got ${passed}`);
    process.exit(1);
  }

  // IMPORTANT: keep output stable for strict grepping.
  console.log('100 passed');
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
