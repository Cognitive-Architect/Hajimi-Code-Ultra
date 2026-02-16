#!/usr/bin/env node
/**
 * Cross-platform Redis Test Runner
 * 客服小祥·Docker编排师 - B-02/09
 * 
 * Usage:
 *   node scripts/test-runner.js          # Run with Docker Redis
 *   node scripts/test-runner.js --ci     # CI mode (no Docker)
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isWindows = os.platform() === 'win32';
const isCI = process.argv.includes('--ci');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function exec(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const isShell = isWindows && command === 'sh';
    const actualCmd = isShell ? 'powershell.exe' : command;
    const actualArgs = isShell 
      ? ['-ExecutionPolicy', 'Bypass', '-File', args[0].replace(/\//g, '\\')]
      : args;
    
    log(`执行: ${actualCmd} ${actualArgs.join(' ')}`, 'blue');
    
    const child = spawn(actualCmd, actualArgs, {
      stdio: 'inherit',
      shell: isWindows,
      ...options
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  log('========================================', 'blue');
  log('  HAJIMI Redis 测试运行器', 'blue');
  log(`  平台: ${os.platform()}`, 'blue');
  log(`  模式: ${isCI ? 'CI (无Docker)' : 'Docker Redis'}`, 'blue');
  log('========================================', 'blue');
  console.log();

  if (isCI) {
    // CI 模式：直接运行测试
    log('[CI模式] 直接运行 Jest 测试...', 'yellow');
    try {
      await exec('npx', ['jest', '--ci', '--testEnvironment=node']);
      log('========================================', 'green');
      log('  所有测试通过！', 'green');
      log('========================================', 'green');
      process.exit(0);
    } catch (err) {
      log('========================================', 'red');
      log('  测试未通过', 'red');
      log('========================================', 'red');
      process.exit(1);
    }
    return;
  }

  // Docker 模式
  const scriptDir = __dirname;
  const projectRoot = path.resolve(scriptDir, '..');
  
  try {
    // 步骤 1: 启动 Redis 容器
    log('[1/5] 正在启动 Redis 测试容器...', 'yellow');
    
    // 确保 tmp 目录存在
    const tmpDir = path.join(projectRoot, 'tmp', 'redis-test');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    await exec('docker-compose', [
      '-f', path.join(projectRoot, 'docker-compose.test.yml'),
      'up', '-d', 'redis-test'
    ]);

    // 步骤 2: 等待 Redis 就绪
    log('[2/5] 等待 Redis 就绪...', 'yellow');
    let ready = false;
    let retries = 0;
    const maxRetries = 30;

    while (!ready && retries < maxRetries) {
      try {
        const result = execSync(
          'docker exec hajimi-redis-test redis-cli ping',
          { encoding: 'utf8', timeout: 3000 }
        );
        if (result.trim() === 'PONG') {
          ready = true;
          log('✓ Redis 已就绪', 'green');
        }
      } catch (e) {
        retries++;
        process.stdout.write('.');
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (!ready) {
      throw new Error('Redis 启动超时');
    }

    // 步骤 3: 运行测试
    log('[3/5] 运行 Jest 测试...', 'yellow');
    process.env.REDIS_URL = 'redis://localhost:6379';
    
    let testPassed = false;
    try {
      await exec('npx', ['jest']);
      testPassed = true;
      log('✓ 测试通过', 'green');
    } catch (e) {
      log('✗ 测试失败', 'red');
    }

    // 步骤 4: 清理容器
    log('[4/5] 清理容器环境...', 'yellow');
    try {
      execSync('docker-compose -f docker-compose.test.yml down', {
        cwd: projectRoot,
        stdio: 'ignore'
      });
      log('✓ 容器已清理', 'green');
    } catch (e) {
      log('警告: 容器清理失败', 'yellow');
    }

    // 步骤 5: 清理数据
    log('[5/5] 清理 Redis 测试数据...', 'yellow');
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      log('✓ 已清理测试数据', 'green');
    } catch (e) {
      log('警告: 数据清理失败', 'yellow');
    }

    console.log();
    if (testPassed) {
      log('========================================', 'green');
      log('  所有测试通过！', 'green');
      log('========================================', 'green');
      process.exit(0);
    } else {
      log('========================================', 'red');
      log('  测试未通过，请检查日志', 'red');
      log('========================================', 'red');
      process.exit(1);
    }

  } catch (error) {
    log(`错误: ${error.message}`, 'red');
    
    // 紧急清理
    try {
      execSync('docker-compose -f docker-compose.test.yml down', {
        cwd: projectRoot,
        stdio: 'ignore'
      });
    } catch (e) {}
    
    process.exit(1);
  }
}

main();
