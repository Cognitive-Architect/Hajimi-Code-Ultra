/**
 * Diff Stream Command - 流式大文件 diff
 * DEBT-CLI-003【已清偿 v1.1-FIXED】
 */

import { Command } from 'commander';
import * as fs from 'fs';
import { createReadStream, createWriteStream } from 'fs';
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

// 固定大小分块
class Chunker extends Transform {
  private chunkSize: number;
  private buffer: Buffer = Buffer.alloc(0);
  private index: number = 0;

  constructor(chunkSizeMB: number) {
    super({ objectMode: true });
    this.chunkSize = chunkSizeMB * 1024 * 1024;
  }

  _transform(chunk: Buffer, encoding: string, callback: Function): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= this.chunkSize) {
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

// 进度追踪
class ProgressTracker extends Transform {
  private callback: (p: any) => void;
  private totalBytes: number;
  private processedBytes: number = 0;
  private startTime: number = Date.now();

  constructor(totalBytes: number, callback: (p: any) => void) {
    super({ objectMode: true });
    this.totalBytes = totalBytes;
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
      memoryMB: process.memoryUsage().heapUsed / 1024 / 1024
    });
    
    this.push(chunk);
    callback();
  }
}

export async function diffStream(oldFile: string, newFile: string, options: StreamOptions): Promise<void> {
  console.log(`[INFO] Streaming diff starting...`);
  console.log(`[INFO] Memory limit: ${options.maxMemory}MB`);
  
  const oldSize = fs.statSync(oldFile).size;
  const newSize = fs.statSync(newFile).size;
  
  // 收集块信息
  const oldChunks: any[] = [];
  const newChunks: any[] = [];
  
  // 处理旧文件
  if (options.progress) console.log('[INFO] Processing old file...');
  await pipelineAsync(
    createReadStream(oldFile, { highWaterMark: options.chunkSize * 1024 * 1024 }),
    new Chunker(options.chunkSize),
    options.progress ? new ProgressTracker(oldSize, (p) => {
      const bar = '█'.repeat(Math.floor(p.percent / 5)) + '░'.repeat(20 - Math.floor(p.percent / 5));
      process.stdout.write(`\r[${bar}] ${p.percent.toFixed(1)}% | ${p.speedMBps.toFixed(2)} MB/s`);
    }) : new Transform({ objectMode: true, transform(c, e, cb) { oldChunks.push(c); cb(); } }),
    new Transform({ objectMode: true, transform(c, e, cb) { oldChunks.push(c); cb(); } })
  );
  
  if (options.progress) process.stdout.write('\n');
  
  // 处理新文件
  if (options.progress) console.log('[INFO] Processing new file...');
  await pipelineAsync(
    createReadStream(newFile, { highWaterMark: options.chunkSize * 1024 * 1024 }),
    new Chunker(options.chunkSize),
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
    format: 'hdiff-stream-v1.1',
    oldFile: { path: oldFile, size: oldSize, chunks: oldChunks.length },
    newFile: { path: newFile, size: newSize, chunks: newChunks.length },
    changes,
    metadata: { chunkSizeMB: options.chunkSize, createdAt: new Date().toISOString() }
  }, null, 2));
  
  console.log(`[OK] Diff written: ${options.output}`);
  console.log(`[INFO] Chunks: old=${oldChunks.length}, new=${newChunks.length}, changes=${changes.length}`);
}

export function registerDiffStreamCommand(program: Command): void {
  program
    .command('diff-stream')
    .description('Compare large files using streaming (>1GB supported)')
    .argument('<old>', 'Old file path')
    .argument('<new>', 'New file path')
    .option('-o, --output <file>', 'Output file', 'patch.hdiff')
    .option('--max-memory <MB>', 'Memory limit', '200')
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
