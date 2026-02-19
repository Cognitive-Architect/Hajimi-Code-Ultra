/**
 * CLI E2E Tests
 * 
 * Self-Tests:
 * - CLI-FUNC-001: hajimi diff --help 显示用法
 * - CLI-FUNC-002: hajimi diff a.txt b.txt -o patch.hdiff 生成有效补丁
 * - CLI-FUNC-003: hajimi apply patch.hdiff a.txt -o c.txt 后 SHA256 一致
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI_PATH = path.join(__dirname, '..', '..', 'dist', 'index.js');

function runCli(args) {
  const r = spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf8',
    cwd: path.dirname(CLI_PATH),
  });
  return r;
}

function sha256(data) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(data).digest('hex');
}

// CLI-FUNC-001: hajimi diff --help 显示用法
test('CLI-FUNC-001: hajimi diff --help shows usage', () => {
  const r = runCli(['diff', '--help']);
  assert.strictEqual(r.status, 0, `exit code should be 0, got ${r.status}`);
  assert.ok(r.stdout.includes('Usage:'), 'should show Usage');
  assert.ok(r.stdout.includes('diff'), 'should mention diff command');
  assert.ok(r.stdout.includes('<oldFile>'), 'should show oldFile argument');
  assert.ok(r.stdout.includes('<newFile>'), 'should show newFile argument');
});

// CLI-FUNC-001: hajimi apply --help 显示用法
test('CLI-FUNC-001: hajimi apply --help shows usage', () => {
  const r = runCli(['apply', '--help']);
  assert.strictEqual(r.status, 0, `exit code should be 0, got ${r.status}`);
  assert.ok(r.stdout.includes('Usage:'), 'should show Usage');
  assert.ok(r.stdout.includes('apply'), 'should mention apply command');
});

// CLI-FUNC-002: hajimi diff 生成有效补丁
test('CLI-FUNC-002: hajimi diff generates valid patch', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hajimi-cli-test-'));
  const oldFile = path.join(tmpDir, 'a.txt');
  const newFile = path.join(tmpDir, 'b.txt');
  const patchFile = path.join(tmpDir, 'patch.hdiff');

  // Create test files
  fs.writeFileSync(oldFile, 'Hello World - Base Content');
  fs.writeFileSync(newFile, 'Hello World - Modified Content');

  // Run diff
  const r = runCli(['diff', oldFile, newFile, '-o', patchFile]);
  assert.strictEqual(r.status, 0, `diff should succeed: ${r.stderr}`);

  // Verify patch file exists and has content
  assert.ok(fs.existsSync(patchFile), 'patch file should exist');
  const patchStat = fs.statSync(patchFile);
  assert.ok(patchStat.size > 0, 'patch file should have content');

  // Verify patch is valid JSON
  const patchContent = fs.readFileSync(patchFile, 'utf8');
  const patch = JSON.parse(patchContent);
  assert.strictEqual(patch.magic, 'HAJI', 'patch should have correct magic');
  assert.ok(patch.oldHash, 'patch should have oldHash');
  assert.ok(patch.newHash, 'patch should have newHash');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// CLI-FUNC-003: diff -> apply -> SHA256 一致
test('CLI-FUNC-003: diff then apply produces identical file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hajimi-cli-test-'));
  const oldFile = path.join(tmpDir, 'a.txt');
  const newFile = path.join(tmpDir, 'b.txt');
  const patchFile = path.join(tmpDir, 'patch.hdiff');
  const outputFile = path.join(tmpDir, 'c.txt');

  // Create test files with binary-like content
  const baseContent = Buffer.from('Base content with some binary\x00\x01\x02');
  const targetContent = Buffer.from('Modified content with different binary\x03\x04\x05');
  fs.writeFileSync(oldFile, baseContent);
  fs.writeFileSync(newFile, targetContent);

  // Compute target SHA256
  const targetSha256 = sha256(targetContent);

  // Run diff
  const diffResult = runCli(['diff', oldFile, newFile, '-o', patchFile]);
  assert.strictEqual(diffResult.status, 0, `diff should succeed: ${diffResult.stderr}`);

  // Run apply
  const applyResult = runCli(['apply', patchFile, oldFile, '-o', outputFile]);
  assert.strictEqual(applyResult.status, 0, `apply should succeed: ${applyResult.stderr}`);

  // Verify output exists
  assert.ok(fs.existsSync(outputFile), 'output file should exist');

  // Verify SHA256 matches
  const outputContent = fs.readFileSync(outputFile);
  const outputSha256 = sha256(outputContent);
  assert.strictEqual(outputSha256, targetSha256, 'SHA256 should match original target file');

  // Verify content matches
  assert.deepStrictEqual(outputContent, targetContent, 'content should match original target file');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Test error handling: missing file
test('CLI-ERR-001: diff with missing file returns error', () => {
  const r = runCli(['diff', '/nonexistent/file1.txt', '/nonexistent/file2.txt']);
  assert.notStrictEqual(r.status, 0, 'should return non-zero exit code');
  assert.ok(r.stderr.includes('ERROR') || r.stdout.includes('ERROR'), 'should show error message');
});

// Test hash command
test('CLI-FUNC-004: hash command computes BLAKE3 hash', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hajimi-cli-test-'));
  const testFile = path.join(tmpDir, 'test.txt');
  const content = 'Test content for hashing';
  fs.writeFileSync(testFile, content);

  const r = runCli(['hash', testFile]);
  assert.strictEqual(r.status, 0, `hash should succeed: ${r.stderr}`);
  
  // Output should contain hash (64 hex chars) and filename
  const hashMatch = r.stdout.match(/[a-f0-9]{64}/);
  assert.ok(hashMatch, 'should output 64-char hex hash');
  assert.ok(r.stdout.includes('test.txt'), 'should include filename');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

console.log('[INFO] CLI E2E Tests loaded. Run with: node --test tests/e2e/basic.spec.js');
