// DEBT-B05-001: 依赖系统 CLI（zstd/xdelta3/git）做对照跑分；环境缺失会在跑分阶段标记 skip
// DEBT-B05-002: full 模式数据体量大；默认 quick 模式使用离线小样本（框架可复现，但不代表真实世界分布）
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function parseArgs(argv) {
  const out = {
    preset: 'quick',
    corpusDir: 'bench/corpus',
    outFile: 'bench/manifest.json',
    seed: 1337,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preset') out.preset = String(argv[++i] || '');
    else if (a === '--corpus') out.corpusDir = String(argv[++i] || '');
    else if (a === '--out') out.outFile = String(argv[++i] || '');
    else if (a === '--seed') out.seed = Number(argv[++i] || 0);
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function usage() {
  console.log('Usage: node scripts/build-pairs.js [--preset quick|full] [--corpus bench/corpus] [--out bench/manifest.json] [--seed 1337]');
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function sha256FileSync(filePath) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(1024 * 1024);
  try {
    while (true) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (n <= 0) break;
      h.update(buf.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
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

function xorWithKeystream(buf, rng) {
  const out = Buffer.from(buf);
  for (let i = 0; i < out.length; i++) out[i] ^= (rng() & 0xFF);
  return out;
}

function ensureDerivedFile(basePath, derivedPath, mutatorFn) {
  if (fs.existsSync(derivedPath)) return;
  const base = fs.readFileSync(basePath);
  const derived = mutatorFn(base);
  mkdirp(path.dirname(derivedPath));
  fs.writeFileSync(derivedPath, derived);
}

function fileInfo(repoRoot, absPath) {
  const st = fs.statSync(absPath);
  return {
    path: path.relative(repoRoot, absPath).replace(/\\/g, '/'),
    bytes: st.size,
    sha256: sha256FileSync(absPath),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const repoRoot = path.join(__dirname, '..');
  const corpusAbs = path.join(repoRoot, args.corpusDir);
  const outAbs = path.join(repoRoot, args.outFile);

  if (!fs.existsSync(corpusAbs)) {
    console.error(`[FAIL] corpus dir not found: ${args.corpusDir}. Run fetch first.`);
    process.exit(1);
  }

  const rng = makeRng(args.seed);

  // Resolve expected corpus files (quick vs full).
  const codeDir = path.join(corpusAbs, 'code');
  const tsDir = path.join(corpusAbs, 'timeseries');
  const imgDir = path.join(corpusAbs, 'image_encrypted');
  const synthDir = path.join(corpusAbs, 'synthetic');

  // --- CODE ---
  let codeBase = path.join(codeDir, 'code_base.txt');
  let codeTarget = path.join(codeDir, 'code_target.txt');
  if (!fs.existsSync(codeBase)) {
    // full preset kernel tarball -> generate a deterministic mutated target
    const candidates = fs.readdirSync(codeDir).filter(f => /^linux-.*\.tar\.(xz|gz|bz2)$/.test(f));
    if (candidates.length === 0) {
      console.error('[FAIL] code corpus missing.');
      process.exit(1);
    }
    candidates.sort();
    codeBase = path.join(codeDir, candidates[0]);
    codeTarget = path.join(codeDir, candidates[0].replace(/\.tar\./, '.mutated.tar.'));
    ensureDerivedFile(codeBase, codeTarget, (buf) => {
      const out = Buffer.from(buf);
      for (let i = 0; i < out.length; i += 1024 * 1024) out[i] ^= 0x01;
      const marker = Buffer.from(`\nMUTATED-SEED:${args.seed}\n`, 'utf8');
      return Buffer.concat([out, marker]);
    });
  }

  // --- TIMESERIES ---
  let tsBase = path.join(tsDir, 'ts_base.jsonl');
  let tsTarget = path.join(tsDir, 'ts_target.jsonl');
  if (!fs.existsSync(tsBase)) {
    // full preset GH Archive uses gz files
    const gh0 = path.join(tsDir, '2015-01-01-0.json.gz');
    const gh1 = path.join(tsDir, '2015-01-01-1.json.gz');
    if (!fs.existsSync(gh0) || !fs.existsSync(gh1)) {
      console.error('[FAIL] timeseries corpus missing.');
      process.exit(1);
    }
    tsBase = gh0;
    tsTarget = gh1;
  }

  // --- IMAGE ENCRYPTED ---
  let imgBase = path.join(imgDir, 'kodim01.png');
  let imgTarget = path.join(imgDir, 'kodim01.enc.bin');
  if (!fs.existsSync(imgBase)) {
    console.error('[FAIL] image corpus missing.');
    process.exit(1);
  }
  ensureDerivedFile(imgBase, imgTarget, (buf) => {
    const encRng = makeRng(args.seed ^ 0xBADC0FFE);
    return xorWithKeystream(buf, encRng);
  });

  // --- SYNTHETIC ---
  const synthBase = path.join(synthDir, 'synth_base.bin');
  const synthTarget = path.join(synthDir, 'synth_target.bin');
  if (!fs.existsSync(synthBase) || !fs.existsSync(synthTarget)) {
    console.error('[FAIL] synthetic corpus missing.');
    process.exit(1);
  }

  const datasets = [
    {
      id: 'code',
      kind: 'code',
      source: {
        preset: args.preset,
        note: (args.preset === 'full')
          ? 'linux kernel tarball (downloaded) + deterministic mutation'
          : 'repo snapshot (offline quick)',
      },
      pairs: [
        { id: 'code-01', base: codeBase, target: codeTarget },
      ],
    },
    {
      id: 'timeseries',
      kind: 'timeseries',
      source: {
        preset: args.preset,
        note: (args.preset === 'full')
          ? 'GH Archive hour 0/1 (downloaded)'
          : 'synthetic JSONL events (offline quick)',
      },
      pairs: [
        { id: 'ts-01', base: tsBase, target: tsTarget },
      ],
    },
    {
      id: 'image_encrypted',
      kind: 'image_encrypted',
      source: {
        preset: args.preset,
        note: (args.preset === 'full')
          ? 'Kodak (kodim01.png downloaded) + XOR encryption'
          : 'PNG-ish synthetic + XOR encryption (offline quick)',
      },
      pairs: [
        { id: 'img-01', base: imgBase, target: imgTarget },
      ],
    },
    {
      id: 'synthetic',
      kind: 'synthetic',
      source: {
        preset: args.preset,
        note: 'deterministic generator',
      },
      pairs: [
        { id: 'syn-01', base: synthBase, target: synthTarget },
      ],
    },
  ];

  // Build manifest with per-file metadata.
  const manifest = {
    _debt: [
      'DEBT-B05-001: depends on system CLIs (zstd/xdelta3/git) for benchmarks; missing tools are skipped.',
      'DEBT-B05-002: full corpora are large; quick preset is offline sample only.',
    ],
    version: 'v0.9.1',
    preset: args.preset,
    generated_at_utc: new Date().toISOString(),
    seed: args.seed,
    datasets: datasets.map(ds => {
      const pairs = ds.pairs.map(p => {
        const baseAbs = path.join(repoRoot, path.relative(repoRoot, p.base));
        const targetAbs = path.join(repoRoot, path.relative(repoRoot, p.target));
        return {
          id: p.id,
          base: fileInfo(repoRoot, baseAbs),
          target: fileInfo(repoRoot, targetAbs),
        };
      });
      return {
        id: ds.id,
        kind: ds.kind,
        source: ds.source,
        pairs,
      };
    }),
  };

  mkdirp(path.dirname(outAbs));
  fs.writeFileSync(outAbs, JSON.stringify(manifest, null, 2));
  console.log(`[OK] wrote ${path.relative(repoRoot, outAbs).replace(/\\/g,'/')}`);
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
