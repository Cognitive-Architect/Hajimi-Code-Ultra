// DEBT-B05-001: 依赖系统 CLI：zstd/xdelta3/git；缺失时将对对应工具标记 skipped（不视为脚本失败）
// DEBT-B05-002: full 模式数据体量大；默认 quick 模式为离线小样本，指标仅用于框架验证
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const out = {
    manifest: 'bench/manifest.json',
    schema: 'bench/schema/metrics.schema.json',
    outFile: 'bench/results/baseline.json',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest') out.manifest = String(argv[++i] || '');
    else if (a === '--schema') out.schema = String(argv[++i] || '');
    else if (a === '--out') out.outFile = String(argv[++i] || '');
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function usage() {
  console.log('Usage: node scripts/run-benchmark.js [--manifest bench/manifest.json] [--schema bench/schema/metrics.schema.json] [--out bench/results/baseline.json]');
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function haveCmd(cmd) {
  const r = spawnSync('which', [cmd], { stdio: 'ignore' });
  return r.status === 0;
}

function cmdVersion(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status === 0) return (r.stdout || r.stderr || '').trim() || null;
  return null;
}

function nowMs() {
  const [s, ns] = process.hrtime();
  return (s * 1000) + (ns / 1e6);
}

function writeJson(filePath, obj) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}

function rel(repoRoot, absPath) {
  return path.relative(repoRoot, absPath).replace(/\\/g, '/');
}

function tmpFile(prefix) {
  const rnd = Math.random().toString(16).slice(2);
  return path.join(os.tmpdir(), `${prefix}-${process.pid}-${rnd}`);
}

function statBytes(p) {
  return fs.statSync(p).size;
}

function runZstd(targetPath) {
  if (!haveCmd('zstd')) {
    return { status: 'skipped', reason: 'missing_cli:zstd' };
  }
  const outPath = tmpFile('bench-zstd') + '.zst';
  const outFd = fs.openSync(outPath, 'w');
  const t0 = nowMs();
  const r = spawnSync('zstd', ['-q', '-19', '-c', targetPath], { stdio: ['ignore', outFd, 'pipe'] });
  fs.closeSync(outFd);
  const ms = nowMs() - t0;
  if (r.status !== 0) {
    return { status: 'error', reason: `zstd_exit:${r.status}`, ms, stderr: String(r.stderr || '') };
  }
  const compressedBytes = statBytes(outPath);
  return { status: 'ok', compressed_bytes: compressedBytes, ms };
}

function runXdelta3(basePath, targetPath) {
  if (!haveCmd('xdelta3')) {
    return { status: 'skipped', reason: 'missing_cli:xdelta3' };
  }
  const deltaPath = tmpFile('bench-xdelta3') + '.xdelta';
  const t0 = nowMs();
  const r = spawnSync('xdelta3', ['-e', '-f', '-s', basePath, targetPath, deltaPath], { encoding: 'utf8' });
  const ms = nowMs() - t0;
  if (r.status !== 0) {
    return { status: 'error', reason: `xdelta3_exit:${r.status}`, ms, stderr: String(r.stderr || '') };
  }
  const deltaBytes = statBytes(deltaPath);
  return { status: 'ok', delta_bytes: deltaBytes, ms };
}

function runGitDiff(basePath, targetPath) {
  if (!haveCmd('git')) {
    return { status: 'skipped', reason: 'missing_cli:git' };
  }
  const patchPath = tmpFile('bench-git') + '.patch';
  const outFd = fs.openSync(patchPath, 'w');
  const t0 = nowMs();
  const r = spawnSync('git', ['diff', '--no-index', '--binary', '--', basePath, targetPath], { stdio: ['ignore', outFd, 'pipe'] });
  fs.closeSync(outFd);
  const ms = nowMs() - t0;

  // git diff returns 1 when differences exist. Treat 0/1 as ok.
  if (r.status !== 0 && r.status !== 1) {
    return { status: 'error', reason: `git_exit:${r.status}`, ms, stderr: String(r.stderr || '') };
  }
  const deltaBytes = statBytes(patchPath);
  return { status: 'ok', delta_bytes: deltaBytes, ms };
}

function validateBaseline(baseline) {
  // Minimal validator to keep "exit 1" semantics without adding npm deps.
  // External CI can run full JSON Schema validation using bench/schema/metrics.schema.json.
  const reqTop = ['version', 'preset', 'generated_at_utc', 'tools', 'pairs'];
  for (const k of reqTop) {
    if (!(k in baseline)) return `missing_top_level:${k}`;
  }
  if (!Array.isArray(baseline.tools) || baseline.tools.length === 0) return 'bad_tools';
  if (!Array.isArray(baseline.pairs)) return 'bad_pairs';
  for (const p of baseline.pairs) {
    for (const k of ['id', 'kind', 'base', 'target', 'base_bytes', 'target_bytes', 'metrics']) {
      if (!(k in p)) return `missing_pair_field:${p && p.id ? p.id : '?'}:${k}`;
    }
    if (typeof p.metrics !== 'object' || p.metrics === null) return `bad_metrics:${p.id}`;
    for (const tool of baseline.tools) {
      if (!(tool in p.metrics)) return `missing_tool_metrics:${p.id}:${tool}`;
      const tm = p.metrics[tool];
      if (!tm || typeof tm !== 'object') return `bad_tool_metrics:${p.id}:${tool}`;
      if (!('status' in tm)) return `missing_status:${p.id}:${tool}`;
    }
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const repoRoot = path.join(__dirname, '..');
  const manifestPath = path.join(repoRoot, args.manifest);
  const schemaPath = path.join(repoRoot, args.schema);
  const outPath = path.join(repoRoot, args.outFile);

  if (!fs.existsSync(manifestPath)) {
    console.error(`[FAIL] manifest not found: ${args.manifest}`);
    process.exit(1);
  }
  if (!fs.existsSync(schemaPath)) {
    console.error(`[FAIL] schema not found: ${args.schema}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const tools = ['zstd', 'xdelta3', 'git', 'hajimi'];

  const env = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpus: os.cpus().length,
    tool_presence: {
      zstd: { present: haveCmd('zstd'), version: cmdVersion('zstd', ['--version']) },
      xdelta3: { present: haveCmd('xdelta3'), version: cmdVersion('xdelta3', ['-V']) || cmdVersion('xdelta3', ['--version']) },
      git: { present: haveCmd('git'), version: cmdVersion('git', ['--version']) },
    },
  };

  const pairs = [];

  for (const ds of manifest.datasets || []) {
    for (const p of ds.pairs || []) {
      const baseAbs = path.join(repoRoot, p.base.path);
      const targetAbs = path.join(repoRoot, p.target.path);

      const baseBytes = statBytes(baseAbs);
      const targetBytes = statBytes(targetAbs);

      const zstd = runZstd(targetAbs);
      const xdelta3 = runXdelta3(baseAbs, targetAbs);
      const git = runGitDiff(baseAbs, targetAbs);
      const hajimi = { status: 'not_implemented' };

      // Derived ratios (where available)
      if (zstd.status === 'ok') {
        zstd.ratio = targetBytes === 0 ? null : (zstd.compressed_bytes / targetBytes);
      }
      if (xdelta3.status === 'ok') {
        xdelta3.ratio = targetBytes === 0 ? null : (xdelta3.delta_bytes / targetBytes);
      }
      if (git.status === 'ok') {
        git.ratio = targetBytes === 0 ? null : (git.delta_bytes / targetBytes);
      }

      pairs.push({
        id: p.id,
        kind: ds.kind,
        base: p.base.path,
        target: p.target.path,
        base_bytes: baseBytes,
        target_bytes: targetBytes,
        metrics: { zstd, xdelta3, git, hajimi },
      });
    }
  }

  const baseline = {
    _debt: [
      'DEBT-B05-001: depends on system CLIs (zstd/xdelta3/git); missing tools are skipped.',
      'DEBT-B05-002: quick preset is offline sample; numbers are for framework validation only.',
    ],
    version: 'v0.9.1',
    preset: manifest.preset || 'unknown',
    generated_at_utc: new Date().toISOString(),
    tools,
    env,
    pairs,
  };

  writeJson(outPath, baseline);

  const err = validateBaseline(baseline);
  if (err) {
    console.error(`[FAIL] baseline validation failed: ${err}`);
    process.exit(1);
  }

  console.log(`[OK] wrote ${rel(repoRoot, outPath)}; pairs=${pairs.length}`);
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
