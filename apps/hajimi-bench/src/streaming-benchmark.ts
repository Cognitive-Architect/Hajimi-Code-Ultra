/**
 * Streaming Benchmark - 流式基准测试
 * 
 * DEBT-BENCH-001【已清偿 v1.1】
 * 
 * 功能: 支持 10GB+ 文件的流式基准测试
 */

import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { spawn } from 'child_process';

export interface StreamingBenchmarkConfig {
  fileSizeGB: number;       // 测试文件大小
  chunkSizeMB: number;      // 分块大小
  maxMemoryMB: number;      // 内存限制
  iterations: number;       // 重复次数
}

export interface StreamingBenchmarkResult {
  adapter: string;
  fileSizeGB: number;
  chunkSizeMB: number;
  compressionRatio: number;
  speedMBps: number;
  peakMemoryMB: number;
  durationSec: number;
  success: boolean;
}

/**
 * 创建测试文件 (稀疏文件)
 */
export function createTestFile(filePath: string, sizeGB: number): void {
  const sizeBytes = sizeGB * 1024 * 1024 * 1024;
  
  // Windows: fsutil, Linux/Mac: truncate
  if (process.platform === 'win32') {
    const { execSync } = require('child_process');
    execSync(`fsutil file createnew "${filePath}" ${sizeBytes}`);
  } else {
    const { execSync } = require('child_process');
    execSync(`truncate -s ${sizeBytes} "${filePath}"`);
  }
  
  // 写入一些随机数据避免全零压缩率异常
  const fd = fs.openSync(filePath, 'r+');
  const blockSize = 1024 * 1024; // 1MB
  const randomData = Buffer.alloc(blockSize);
  for (let i = 0; i < randomData.length; i++) {
    randomData[i] = Math.floor(Math.random() * 256);
  }
  
  // 每 100MB 写入随机块
  for (let offset = 0; offset < sizeBytes; offset += 100 * 1024 * 1024) {
    fs.writeSync(fd, randomData, 0, blockSize, offset);
  }
  
  fs.closeSync(fd);
}

/**
 * 监控内存使用
 */
class MemoryProfiler {
  private samples: number[] = [];
  private interval: NodeJS.Timeout | null = null;
  
  start(): void {
    this.interval = setInterval(() => {
      const usage = process.memoryUsage();
      this.samples.push((usage.heapUsed + (usage.external || 0)) / 1024 / 1024);
    }, 100);
  }
  
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }
  
  getPeak(): number {
    return this.samples.length > 0 ? Math.max(...this.samples) : 0;
  }
  
  getAverage(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }
}

/**
 * 运行流式基准测试
 */
export async function runStreamingBenchmark(
  adapter: string,
  config: StreamingBenchmarkConfig
): Promise<StreamingBenchmarkResult> {
  const testDir = path.join(process.cwd(), 'test-streaming');
  const baseFile = path.join(testDir, `test-${config.fileSizeGB}gb.bin`);
  const targetFile = path.join(testDir, `test-${config.fileSizeGB}gb-modified.bin`);
  const outputFile = path.join(testDir, 'result.hdiff');
  
  // 确保测试目录存在
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  
  // 创建测试文件
  if (!fs.existsSync(baseFile)) {
    console.log(`[INFO] Creating ${config.fileSizeGB}GB test file...`);
    createTestFile(baseFile, config.fileSizeGB);
  }
  
  // 创建修改版（修改部分块）
  if (!fs.existsSync(targetFile)) {
    console.log(`[INFO] Creating modified version...`);
    fs.copyFileSync(baseFile, targetFile);
    const fd = fs.openSync(targetFile, 'r+');
    const modifiedData = Buffer.alloc(1024 * 1024);
    for (let i = 0; i < modifiedData.length; i++) {
      modifiedData[i] = Math.floor(Math.random() * 256);
    }
    // 修改中间位置
    fs.writeSync(fd, modifiedData, 0, modifiedData.length, config.fileSizeGB * 1024 * 1024 * 1024 / 2);
    fs.closeSync(fd);
  }
  
  const profiler = new MemoryProfiler();
  const startTime = performance.now();
  
  try {
    profiler.start();
    
    // 调用 CLI 流式 diff
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('node', [
        'dist/index.js',
        'diff-stream',
        baseFile,
        targetFile,
        '-o', outputFile,
        '--max-memory', String(config.maxMemoryMB),
        '--chunk-size', String(config.chunkSizeMB),
        '--progress'
      ], {
        cwd: process.cwd(),
        stdio: 'inherit'
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });
    });
    
    profiler.stop();
    
    const duration = (performance.now() - startTime) / 1000;
    const baseSize = fs.statSync(baseFile).size;
    const outputSize = fs.statSync(outputFile).size;
    
    return {
      adapter,
      fileSizeGB: config.fileSizeGB,
      chunkSizeMB: config.chunkSizeMB,
      compressionRatio: 1 - (outputSize / baseSize),
      speedMBps: (baseSize / 1024 / 1024) / duration,
      peakMemoryMB: profiler.getPeak(),
      durationSec: duration,
      success: true
    };
    
  } catch (err) {
    profiler.stop();
    return {
      adapter,
      fileSizeGB: config.fileSizeGB,
      chunkSizeMB: config.chunkSizeMB,
      compressionRatio: 0,
      speedMBps: 0,
      peakMemoryMB: profiler.getPeak(),
      durationSec: (performance.now() - startTime) / 1000,
      success: false
    };
  }
}

/**
 * 生成流式基准测试报告
 */
export function generateStreamingReport(results: StreamingBenchmarkResult[]): string {
  const lines: string[] = [];
  
  lines.push('# Streaming Benchmark Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('| Adapter | Size (GB) | Chunk (MB) | Ratio | Speed (MB/s) | Peak Mem (MB) | Duration (s) | Status |');
  lines.push('|---------|-----------|------------|-------|--------------|---------------|--------------|--------|');
  
  for (const r of results) {
    const status = r.success ? '✅ PASS' : '❌ FAIL';
    lines.push(`| ${r.adapter} | ${r.fileSizeGB} | ${r.chunkSizeMB} | ${(r.compressionRatio * 100).toFixed(2)}% | ${r.speedMBps.toFixed(2)} | ${r.peakMemoryMB.toFixed(2)} | ${r.durationSec.toFixed(2)} | ${status} |`);
  }
  
  lines.push('');
  lines.push('## Constraints');
  lines.push('');
  lines.push('- Memory limit: 200MB');
  lines.push('- File size: 1GB - 10GB+');
  lines.push('- Chunk size: 64MB');
  
  return lines.join('\n');
}
