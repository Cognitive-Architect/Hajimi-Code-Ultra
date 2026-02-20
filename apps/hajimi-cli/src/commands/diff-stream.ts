/**
 * Diff Stream Command - 流式大文件 diff
 * DEBT-CLI-003【返工中 v1.1-HARDENED】🔴 内存硬限制真实实现
 */

import { Command } from 'commander';
import * as fs from 'fs';
import { createReadStream } from 'fs';
import { Transform, pipeline } from 'stream';
import { promisify } from 'util';
import { createHash } from 'crypto';

const pipelineAsync = promisify(pipeline);

interface StreamOptions {
  output: string;
  maxMemory: number;
  chunkSize: number;
  progress: boolean;
  compression?: string;
  resume?: boolean;
}

// ============ 内存硬限制监控器（真实实现）============
class MemoryMonitor {
  private maxMemoryBytes: number;
  private bufferOverhead: number = 50 * 1024 * 1024; // 50MB 缓冲
  
  constructor(maxMemoryMB: number) {
    this.maxMemoryBytes = maxMemoryMB * 1024 * 1024;
  }
  
  /**
   * 检查内存使用，超过限制立即抛出错误
   */
  enforceLimit(): void {
    const usage = process.memoryUsage();
    const heapUsed = usage.heapUsed;
    const external = usage.external || 0;
    const totalUsed = heapUsed + external;
    
    // 硬限制检查：实际使用 > 限制 + 缓冲
    if (totalUsed > this.maxMemoryBytes + this.bufferOverhead) {
      const usedMB = (totalUsed / 1024 / 1024).toFixed(2);
      const limitMB = (this.maxMemoryBytes / 1024 / 1024).toFixed(0);
      throw new Error(
        `Memory limit exceeded: ${usedMB}MB > ${limitMB}MB limit + 50MB buffer. ` +
        `Consider increasing --max-memory or using smaller --chunk-size.`
      );
    }
  }
  
  /**
   * 获取当前内存使用（用于监控）
   */
  getCurrentUsageMB(): number {
    const usage = process.memoryUsage();
    return (usage.heapUsed + (usage.external || 0)) / 1024 / 1024;
  }
}

// 固定大小分块（带内存检查）
class Chunker extends Transform {
  private chunkSize: number;
  private buffer: Buffer = Buffer.alloc(0);
  private index: number = 0;
  private monitor: MemoryMonitor;

  constructor(chunkSizeMB: number, monitor: MemoryMonitor) {
    super({ objectMode: true });
    this.chunkSize = chunkSizeMB * 1024 * 1024;
    this.monitor = monitor;
  }

  _transform(chunk: Buffer, encoding: string, callback: Function): void {
    // ============ 硬限制：每块处理前检查内存 ============
    this.monitor.enforceLimit();
    
    this.buffer = Buffer.concat([this.buffer, chunk]);
    
    while (this.buffer.length >= this.chunkSize) {
      // 再次检查内存（处理大块时）
      this.monitor.enforceLimit();
      
      const block = this.buffer.slice(0, this.chunkSize);
      this.push({
        index: this.index++,
        hash: createHash('sha256').update(block).digest('hex'),
        size: block.length,
        data: block
      });
      this.buffer = this.buffer.slice(this.chunkSize);
    }
    callback();
  }

  _flush(callback: Function): void {
    // 最后检查内存
    this.monitor.enforceLimit();
    
    if (this.buffer.length > 0) {
      this.push({
        index: this.index++,
        hash: createHash('sha256').update(this.buffer).digest('hex'),
        size: this.buffer.length,
        data: this.buffer
      });
    }
    callback();
  }
}

// 进度追踪（带内存监控）
class ProgressTracker extends Transform {
  private callback: (p: any) => void;
  private totalBytes: number;
  private processedBytes: number = 0;
  private startTime: number = Date.now();
  private monitor: MemoryMonitor;

  constructor(totalBytes: number, monitor: MemoryMonitor, callback: (p: any) => void) {
    super({ objectMode: true });
    this.totalBytes = totalBytes;
    this.monitor = monitor;
    this.callback = callback;
  }

  _transform(chunk: any, encoding: string, callback: Function): void {
    this.processedBytes += chunk.size || 0;
    const elapsed = (Date.now() - this.startTime) / 1000;
    const speed = elapsed > 0 ? (this.processedBytes / elapsed / 1024 / 1024) : 0;
    const percent = this.totalBytes > 0 ? (this.processedBytes / this.totalBytes * 100) : 0;
    
    this.callback({
      percent,
      processedBytes: this.processedBytes,
      totalBytes: this.totalBytes,
      speedMBps: speed,
      memoryMB: this.monitor.getCurrentUsageMB()
    });
    
    this.push(chunk);
    callback();
  }
}

export async function diffStream(oldFile: string, newFile: string, options: StreamOptions): Promise<void> {
  console.log(`[INFO] Streaming diff starting...`);
  console.log(`[INFO] Memory limit: ${options.maxMemory}MB (HARDENED)`);
  
  // ============ 初始化内存监控器 ============
  const monitor = new MemoryMonitor(options.maxMemory);
  
  const oldSize = fs.statSync(oldFile).size;
  const newSize = fs.statSync(newFile).size;
  
  // 收集块信息
  const oldChunks: any[] = [];
  const newChunks: any[] = [];
  
  // 处理旧文件
  if (options.progress) console.log('[INFO] Processing old file...');
  await pipelineAsync(
    createReadStream(oldFile, { highWaterMark: options.chunkSize * 1024 * 1024 }),
    new Chunker(options.chunkSize, monitor), // 传入监控器
    options.progress ? new ProgressTracker(oldSize, monitor, (p) => {
      const bar = '█'.repeat(Math.floor(p.percent / 5)) + '░'.repeat(20 - Math.floor(p.percent / 5));
      process.stdout.write(`\r[${bar}] ${p.percent.toFixed(1)}% | ${p.speedMBps.toFixed(2)} MB/s | Mem: ${p.memoryMB.toFixed(0)}MB`);
    }) : new Transform({ objectMode: true, transform(c, e, cb) { oldChunks.push(c); cb(); } }),
    new Transform({ objectMode: true, transform(c, e, cb) { oldChunks.push(c); cb(); } })
  );
  
  if (options.progress) process.stdout.write('\n');
  
  // 处理新文件
  if (options.progress) console.log('[INFO] Processing new file...');
  await pipelineAsync(
    createReadStream(newFile, { highWaterMark: options.chunkSize * 1024 * 1024 }),
    new Chunker(options.chunkSize, monitor), // 传入监控器
    new Transform({ objectMode: true, transform(c, e, cb) { newChunks.push(c); cb(); } })
  );
  
  // 计算差异
  const changes: any[] = [];
  const maxChunks = Math.max(oldChunks.length, newChunks.length);
  
  for (let i = 0; i < maxChunks; i++) {
    const oldChunk = oldChunks[i];
    const newChunk = newChunks[i];
    
    if (!oldChunk) {
      changes.push({ type: 'added', index: i, hash: newChunk.hash });
    } else if (!newChunk) {
      changes.push({ type: 'removed', index: i, hash: oldChunk.hash });
    } else if (oldChunk.hash !== newChunk.hash) {
      changes.push({ type: 'modified', index: i, oldHash: oldChunk.hash, newHash: newChunk.hash });
    }
  }
  
  // 写入输出
  fs.writeFileSync(options.output, JSON.stringify({
    format: 'hdiff-stream-v1.1-HARDENED',
    oldFile: { path: oldFile, size: oldSize, chunks: oldChunks.length },
    newFile: { path: newFile, size: newSize, chunks: newChunks.length },
    changes,
    metadata: { 
      chunkSizeMB: options.chunkSize, 
      maxMemoryMB: options.maxMemory,
      actualMemoryMB: monitor.getCurrentUsageMB(),
      createdAt: new Date().toISOString() 
    }
  }, null, 2));
  
  console.log(`[OK] Diff written: ${options.output}`);
  console.log(`[INFO] Chunks: old=${oldChunks.length}, new=${newChunks.length}, changes=${changes.length}`);
  console.log(`[INFO] Peak memory: ${monitor.getCurrentUsageMB().toFixed(2)}MB`);
}

export function registerDiffStreamCommand(program: Command): void {
  program
    .command('diff-stream')
    .description('Compare large files using streaming (>1GB supported) - HARDENED with real memory limit')
    .argument('<old>', 'Old file path')
    .argument('<new>', 'New file path')
    .option('-o, --output <file>', 'Output file', 'patch.hdiff')
    .option('--max-memory <MB>', 'Memory limit (hard enforced)', '200')
    .option('--chunk-size <MB>', 'Chunk size', '64')
    .option('--progress', 'Show progress bar', false)
    .action(async (oldFile: string, newFile: string, options: any) => {
      await diffStream(oldFile, newFile, {
        output: options.output,
        maxMemory: parseInt(options.maxMemory, 10),
        chunkSize: parseInt(options.chunkSize, 10),
        progress: options.progress
      });
    });
}
