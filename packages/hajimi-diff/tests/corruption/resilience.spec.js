// DEBT-B06-001: 测试覆盖字节级损坏注入 + 结构修复闭环；不评估语义级等价（恢复出的 patch 是否“正确应用”）
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function runNode(repoRoot, relScript, args) {
  const scriptPath = path.join(repoRoot, relScript);
  const r = spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });
  return r;
}

function readJsonFromStdout(r) {
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

test('RECV-NEG-001: magicflip must be unrecoverable (recoverable_pct=0)', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  const minimal = path.join(repoRoot, 'delivery', 'v0.9.1', 'minimal.hdiff');
  assert.ok(fs.existsSync(minimal), 'minimal.hdiff must exist');

  const bad = path.join(os.tmpdir(), `bad-magic-${process.pid}.hdiff`);

  const inj = runNode(repoRoot, 'tools/corrupt/inject-hdiff.js', ['--in', minimal, '--out', bad, '--mode', 'magicflip', '--seed', '1']);
  assert.strictEqual(inj.status, 0, `inject exit=${inj.status} stderr=${inj.stderr}`);

  const scan = runNode(repoRoot, 'tools/recover/scanner.js', ['--in', bad]);
  assert.strictEqual(scan.status, 0, `scan exit=${scan.status} stderr=${scan.stderr}`);

  const json = readJsonFromStdout(scan);
  assert.ok(json, 'scanner should output JSON');
  assert.strictEqual(json.recoverable_pct, 0);
  assert.ok(Array.isArray(json.errors));
  assert.ok(json.errors.some(e => e.code === 'E1001'), 'must include E1001');
});

test('RECV-004: 100 random corruptions (excluding magicflip) rebuild success rate > 95%', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  const minimal = path.join(repoRoot, 'delivery', 'v0.9.1', 'minimal.hdiff');
  assert.ok(fs.existsSync(minimal), 'minimal.hdiff must exist');

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

  let ok = 0;
  const total = 100;

  for (let i = 0; i < total; i++) {
    const mode = modes[i % modes.length];
    const seed = 1000 + i;

    const bad = path.join(os.tmpdir(), `bad-${mode}-${seed}-${process.pid}.hdiff`);
    const rec = path.join(os.tmpdir(), `rec-${mode}-${seed}-${process.pid}.hdiff`);
    const rep = path.join(os.tmpdir(), `rep-${mode}-${seed}-${process.pid}.json`);

    const inj = runNode(repoRoot, 'tools/corrupt/inject-hdiff.js', ['--in', minimal, '--out', bad, '--mode', mode, '--seed', String(seed)]);
    if (inj.status !== 0) continue;

    const reb = runNode(repoRoot, 'tools/recover/rebuilder.js', ['--in', bad, '--out', rec, '--report', rep]);
    if (reb.status !== 0) continue;

    const scan = runNode(repoRoot, 'tools/recover/scanner.js', ['--in', rec]);
    if (scan.status !== 0) continue;

    const json = readJsonFromStdout(scan);
    if (!json) continue;
    if (json.magic_ok !== true) continue;
    if (Array.isArray(json.errors) && json.errors.length !== 0) continue;

    ok++;
  }

  const rate = ok / total;
  assert.ok(rate > 0.95, `success rate too low: ${ok}/${total} = ${rate}`);
});
