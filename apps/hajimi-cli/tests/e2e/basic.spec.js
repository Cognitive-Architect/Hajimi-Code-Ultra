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

// Test 100MB file auto-routes to diff-stream (DEBT-CLI-003 HARDENED)
test('CLI-OOM-001: large files auto-route to diff-stream', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hajimi-cli-test-'));
  const bigFile = path.join(tmpDir, 'big.bin');
  
  // Create a file slightly larger than 100MB (100MB + 1 byte)
  const fd = fs.openSync(bigFile, 'w');
  fs.writeSync(fd, Buffer.alloc(1), 0, 1, 100 * 1024 * 1024);
  fs.closeSync(fd);
  
  // Try to diff the big file (should auto-route to diff-stream)
  const r = runCli(['diff', bigFile, bigFile, '-o', path.join(tmpDir, 'test.hdiff'), '--max-memory', '500']);
  
  console.log(`[TEST] large file auto-route: exit code ${r.status}`);
  
  // Should succeed with auto-routing message
  assert.strictEqual(r.status, 0, 'should succeed with auto-routing to diff-stream');
  assert.ok(r.stdout.includes('diff-stream') || r.stderr.includes('diff-stream'), 
    'should mention diff-stream in output');
  
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ============ HARDENED TESTS: diff-dir (FIX-06) ============

// HARD-TEST-001: diff-dir 真实目录测试
test('HARD-TEST-001: diff-dir with real directory structure', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hajimi-diff-dir-test-'));
  const sourceDir = path.join(tmpDir, 'source');
  const targetDir = path.join(tmpDir, 'target');
  
  // 创建真实目录结构
  fs.mkdirSync(path.join(sourceDir, 'src', 'core'), { recursive: true });
  fs.mkdirSync(path.join(sourceDir, 'src', 'cli'), { recursive: true });
  fs.mkdirSync(path.join(targetDir, 'src', 'core'), { recursive: true });
  fs.mkdirSync(path.join(targetDir, 'src', 'cli'), { recursive: true });
  
  // 创建真实文件
  fs.writeFileSync(path.join(sourceDir, 'src', 'core', 'index.ts'), 'export const v1 = 1;');
  fs.writeFileSync(path.join(sourceDir, 'src', 'cli', 'main.ts'), 'console.log("v1");');
  fs.writeFileSync(path.join(targetDir, 'src', 'core', 'index.ts'), 'export const v2 = 2;');
  fs.writeFileSync(path.join(targetDir, 'src', 'cli', 'main.ts'), 'console.log("v2");');
  
  // 执行 diff-dir
  const outputFile = path.join(tmpDir, 'diff.json');
  const r = runCli(['diff-dir', sourceDir, targetDir, '-o', outputFile]);
  
  console.log(`[TEST] diff-dir: exit code ${r.status}`);
  
  assert.strictEqual(r.status, 0, `diff-dir should succeed, got: ${r.stderr}`);
  assert.ok(fs.existsSync(outputFile), 'output file should exist');
  
  // 验证 JSON 结构
  const result = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  assert.ok(result.source, 'should have source info');
  assert.ok(result.target, 'should have target info');
  assert.ok(result.changes, 'should have changes array');
  assert.ok(result.hardened, 'should have hardened marker');
  assert.strictEqual(result.hardened.circularDetection, true, 'should enable circular detection');
  
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// HARD-TEST-002: diff-dir 循环检测测试（自引用）
test('HARD-TEST-002: diff-dir detects circular symlink (self-reference)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hajimi-circular-test-'));
  const testDir = path.join(tmpDir, 'test');
  
  fs.mkdirSync(testDir, { recursive: true });
  fs.writeFileSync(path.join(testDir, 'file.txt'), 'content');
  
  // 创建自引用符号链接（Windows/Linux 兼容）
  try {
    fs.symlinkSync('.', path.join(testDir, 'loop'), 'junction');
  } catch {
    // Windows 可能需要管理员权限，跳过此测试
    console.log('[TEST] diff-dir circular: skipped (symlink creation failed)');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return;
  }
  
  // 执行 diff-dir，预期报错
  const r = runCli(['diff-dir', testDir, testDir, '-o', path.join(tmpDir, 'out.json')]);
  
  console.log(`[TEST] diff-dir circular: exit code ${r.status}, stderr: ${r.stderr.substring(0, 100)}`);
  
  // 必须检测到循环并报错（非超时）
  assert.ok(
    r.stderr.includes('[CIRCULAR]') || r.status !== 0,
    'should detect circular reference or exit with error'
  );
  
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ============ HARDENED TESTS: diff-stream (FIX-06) ============

// HARD-TEST-003: diff-stream 真实大文件测试
test('HARD-TEST-003: diff-stream with real 100MB file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hajimi-diff-stream-test-'));
  const file1 = path.join(tmpDir, 'file1.bin');
  const file2 = path.join(tmpDir, 'file2.bin');
  
  // 创建 100MB 测试文件（使用稀疏文件）
  const fd1 = fs.openSync(file1, 'w');
  const fd2 = fs.openSync(file2, 'w');
  
  // 写入 100MB 数据（每 1MB 写入一次，最后一块不同）
  for (let i = 0; i < 100; i++) {
    const data = Buffer.alloc(1024 * 1024, i);
    fs.writeSync(fd1, data);
    
    // file2 最后一块不同
    if (i === 99) {
      const data2 = Buffer.alloc(1024 * 1024, 255);
      fs.writeSync(fd2, data2);
    } else {
      fs.writeSync(fd2, data);
    }
  }
  
  fs.closeSync(fd1);
  fs.closeSync(fd2);
  
  // 执行 diff-stream（使用 500MB 内存限制确保通过）
  const outputFile = path.join(tmpDir, 'diff.hdiff');
  const r = runCli(['diff-stream', file1, file2, '-o', outputFile, '--progress', '--max-memory', '500']);
  
  console.log(`[TEST] diff-stream: exit code ${r.status}`);
  
  assert.strictEqual(r.status, 0, `diff-stream should succeed, got: ${r.stderr}`);
  assert.ok(fs.existsSync(outputFile), 'output file should exist');
  
  // 验证输出格式
  const result = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  assert.strictEqual(result.format, 'hdiff-stream-v1.1-HARDENED', 'should use HARDENED format');
  assert.ok(result.metadata.maxMemoryMB, 'should have memory limit info');
  assert.ok(result.changes.length > 0, 'should detect changes');
  
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// HARD-TEST-004: diff-stream 内存硬限制测试（必须报错）
test('HARD-TEST-004: diff-stream memory hard limit enforcement', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hajimi-mem-limit-test-'));
  const file1 = path.join(tmpDir, 'file1.bin');
  const file2 = path.join(tmpDir, 'file2.bin');
  
  // 创建 100MB 文件
  const fd1 = fs.openSync(file1, 'w');
  const fd2 = fs.openSync(file2, 'w');
  fs.writeSync(fd1, Buffer.alloc(100 * 1024 * 1024, 1));
  fs.writeSync(fd2, Buffer.alloc(100 * 1024 * 1024, 2));
  fs.closeSync(fd1);
  fs.closeSync(fd2);
  
  // 使用 50MB 内存限制（必须失败）
  const outputFile = path.join(tmpDir, 'diff.hdiff');
  const r = runCli(['diff-stream', file1, file2, '-o', outputFile, '--max-memory', '50']);
  
  console.log(`[TEST] diff-stream memory limit: exit code ${r.status}, stderr: ${r.stderr.substring(0, 100)}`);
  
  // 必须报错（因为 100MB 文件无法用 50MB 内存处理）
  assert.notStrictEqual(r.status, 0, 'should fail with insufficient memory');
  assert.ok(
    r.stderr.includes('Memory limit exceeded') || r.stderr.includes('error'),
    'should report memory error'
  );
  
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

console.log('[INFO] CLI E2E Tests loaded (HARDENED). Run with: node --test tests/e2e/basic.spec.js');
console.log('[INFO] New tests: HARD-TEST-001/002 (diff-dir), HARD-TEST-003/004 (diff-stream)');
