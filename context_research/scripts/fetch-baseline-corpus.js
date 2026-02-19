// DEBT-B05-001: 依赖系统 CLI（full 模式可用 curl），缺失时将无法拉取真实数据集；quick 模式仅生成离线样本
// DEBT-B05-002: Linux kernel full 模式体量大；默认 quick 模式走小样本（可复现实验框架，但不代表真实世界分布）
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const out = { preset: 'quick', outDir: 'bench/corpus', seed: 1337 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preset') out.preset = String(argv[++i] || '');
    else if (a === '--out') out.outDir = String(argv[++i] || '');
    else if (a === '--seed') out.seed = Number(argv[++i] || 0);
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function usage() {
  console.log(`Usage: node scripts/fetch-baseline-corpus.js [--preset quick|full] [--out bench/corpus] [--seed 1337]\n`);
  console.log(`Presets:`);
  console.log(`  quick  Offline-safe deterministic corpus (default).`);
  console.log(`  full   Attempts to download real-world corpora via curl (kernel/GH Archive/Kodak).`);
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFile(filePath, buf) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, buf);
}

// Simple deterministic PRNG (xorshift32)
function makeRng(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= (x << 13) >>> 0;
    x ^= (x >>> 17) >>> 0;
    x ^= (x << 5) >>> 0;
    return x >>> 0;
  };
}

function fillBytes(len, rng) {
  const b = Buffer.alloc(len);
  for (let i = 0; i < len; i++) b[i] = rng() & 0xFF;
  return b;
}

function xorWithKeystream(buf, rng) {
  const out = Buffer.from(buf);
  for (let i = 0; i < out.length; i++) out[i] ^= (rng() & 0xFF);
  return out;
}

function collectRepoSnapshot(repoRoot) {
  // Deterministic file list (small, stable) for quick preset.
  const files = [
    'delivery/v0.9.1/Hajimi-Diff-Format-Spec-v0.9.1.md',
    'scripts/generate-golden-vector.js',
    'scripts/verify-golden-vector.js',
    'src/hash/blake3_256.js',
    'src/hash/xxh64.js',
  ];
  const parts = [];
  for (const rel of files) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const txt = fs.readFileSync(abs, 'utf8');
    parts.push(`/* FILE: ${rel} */\n` + txt + '\n');
  }
  return parts.join('\n');
}

function tryCurl(url, outPath) {
  const res = spawnSync('curl', ['-L', '--fail', '--retry', '2', '--connect-timeout', '10', '-o', outPath, url], {
    stdio: 'inherit',
  });
  return res.status === 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const repoRoot = path.join(__dirname, '..');
  const outDirAbs = path.join(repoRoot, args.outDir);

  const codeDir = path.join(outDirAbs, 'code');
  const tsDir = path.join(outDirAbs, 'timeseries');
  const imgDir = path.join(outDirAbs, 'image_encrypted');
  const synthDir = path.join(outDirAbs, 'synthetic');

  mkdirp(codeDir);
  mkdirp(tsDir);
  mkdirp(imgDir);
  mkdirp(synthDir);

  console.log(`[INFO] preset=${args.preset} out=${args.outDir} seed=${args.seed}`);

  if (args.preset === 'full') {
    // Real-world corpora URLs (may be large).
    const kernelUrl = 'https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-6.6.10.tar.xz';
    const gh0 = 'https://data.gharchive.org/2015-01-01-0.json.gz';
    const gh1 = 'https://data.gharchive.org/2015-01-01-1.json.gz';
    const kodakUrl = 'https://r0k.us/graphics/kodak/kodim01.png';

    console.log('[INFO] curl commands for reproducibility:');
    console.log(`  curl -L --fail -o ${path.join(codeDir, 'linux-6.6.10.tar.xz')} ${kernelUrl}`);
    console.log(`  curl -L --fail -o ${path.join(tsDir, '2015-01-01-0.json.gz')} ${gh0}`);
    console.log(`  curl -L --fail -o ${path.join(tsDir, '2015-01-01-1.json.gz')} ${gh1}`);
    console.log(`  curl -L --fail -o ${path.join(imgDir, 'kodim01.png')} ${kodakUrl}`);

    // Attempt downloads (requires network + curl).
    let ok = true;
    ok = ok && tryCurl(kernelUrl, path.join(codeDir, 'linux-6.6.10.tar.xz'));
    ok = ok && tryCurl(gh0, path.join(tsDir, '2015-01-01-0.json.gz'));
    ok = ok && tryCurl(gh1, path.join(tsDir, '2015-01-01-1.json.gz'));
    ok = ok && tryCurl(kodakUrl, path.join(imgDir, 'kodim01.png'));

    if (!ok) {
      console.error('[FAIL] full preset download failed. Hint: run --preset quick for offline sample corpus.');
      process.exit(1);
    }

    // Synthetic still generated deterministically.
    const rng = makeRng(args.seed);
    writeFile(path.join(synthDir, 'synth_base.bin'), fillBytes(2 * 1024 * 1024, rng));
    writeFile(path.join(synthDir, 'synth_target.bin'), fillBytes(2 * 1024 * 1024, rng));

    console.log('[OK] full corpora downloaded + synthetic generated');
    process.exit(0);
  }

  // --- quick preset: offline deterministic sample corpus ---
  const rng = makeRng(args.seed);

  // 1) code
  const snapshot = collectRepoSnapshot(repoRoot);
  const codeBase = Buffer.from(snapshot, 'utf8');
  // deterministic small mutation: flip a byte every 4KB, and append a marker
  const codeTarget = Buffer.from(codeBase);
  for (let i = 0; i < codeTarget.length; i += 4096) codeTarget[i] ^= 0x01;
  const marker = Buffer.from(`\n// mutated-seed:${args.seed}\n`, 'utf8');
  writeFile(path.join(codeDir, 'code_base.txt'), codeBase);
  writeFile(path.join(codeDir, 'code_target.txt'), Buffer.concat([codeTarget, marker]));

  // 2) timeseries (jsonl)
  const makeEvents = (count, startTs, drift) => {
    const lines = [];
    for (let i = 0; i < count; i++) {
      const ts = startTs + i * 60 + (rng() % 7) * drift;
      const v = {
        ts,
        id: `evt_${i}`,
        kind: (rng() % 5 === 0) ? 'push' : 'issue',
        repo: `repo_${rng() % 100}`,
        value: rng() % 100000,
      };
      lines.push(JSON.stringify(v));
    }
    return lines.join('\n') + '\n';
  };
  writeFile(path.join(tsDir, 'ts_base.jsonl'), Buffer.from(makeEvents(5000, 1700000000, 0), 'utf8'));
  writeFile(path.join(tsDir, 'ts_target.jsonl'), Buffer.from(makeEvents(5000, 1700000000, 1), 'utf8'));

  // 3) image + encrypted target
  // Minimal PNG-ish header + deterministic payload.
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pngPayload = fillBytes(64 * 1024, rng);
  const pngBase = Buffer.concat([pngSig, pngPayload]);
  const encRng = makeRng(args.seed ^ 0xBADC0FFE);
  const pngEnc = xorWithKeystream(pngBase, encRng);
  writeFile(path.join(imgDir, 'kodim01.png'), pngBase);
  writeFile(path.join(imgDir, 'kodim01.enc.bin'), pngEnc);

  // 4) synthetic
  const base = Buffer.alloc(1024 * 1024);
  // Fill with repeated patterns + a few random islands.
  for (let i = 0; i < base.length; i++) base[i] = (i % 251);
  for (let k = 0; k < 128; k++) {
    const off = (rng() % (base.length - 256)) >>> 0;
    fillBytes(256, rng).copy(base, off);
  }
  const target = Buffer.from(base);
  // deterministic swaps and bitflips
  for (let s = 0; s < 64; s++) {
    const a = (rng() % (target.length - 1024)) >>> 0;
    const b = (rng() % (target.length - 1024)) >>> 0;
    const tmp = Buffer.from(target.slice(a, a + 1024));
    target.copy(target, a, b, b + 1024);
    tmp.copy(target, b);
  }
  for (let i = 0; i < target.length; i += 8192) target[i] ^= 0xFF;

  writeFile(path.join(synthDir, 'synth_base.bin'), base);
  writeFile(path.join(synthDir, 'synth_target.bin'), target);

  console.log('[OK] quick corpus generated (offline-safe)');
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
