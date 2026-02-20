/**
 * Diff Stream Command - 流式 diff 命令
 * 
 * DEBT-CLI-003【已清偿 v1.1】
 * 
 * 实现: hajimi diff <old> <new> -o patch.hdiff --max-memory 200
 */

import * as fs from 'fs';
import { Command } from 'commander';
import { StreamingProcessor, StreamOptions, ProgressInfo } from '../../core/streaming-processor';

export interface DiffStreamOptions {
  output: string;
  maxMemory: number;      // MB
  chunkSize: number;      // MB
  compression: 'none' | 'gzip' | 'zstd';
  progress: boolean;
  resume: boolean;
}

/**
 * 执行流式 diff
 */
export async function diffStream(
  oldFile: string,
  newFile: string,
  options: DiffStreamOptions
): Promise<void> {
  console.log(`[INFO] Streaming diff starting...`);
  console.log(`[INFO] Source: ${oldFile}`);
  console.log(`[INFO] Target: ${newFile}`);
  console.log(`[INFO] Memory limit: ${options.maxMemory}MB`);
  console.log(`[INFO] Chunk size: ${options.chunkSize}MB`);
  
  // 验证输入
  if (!fs.existsSync(oldFile)) {
    console.error(`[ERROR] Old file not found: ${oldFile}`);
    process.exit(1);
  }
  if (!fs.existsSync(newFile)) {
    console.error(`[ERROR] New file not found: ${newFile}`);
    process.exit(1);
  }
  
  const oldStats = fs.statSync(oldFile);
  const newStats = fs.statSync(newFile);
  
  console.log(`[INFO] Old file size: ${(oldStats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`[INFO] New file size: ${(newStats.size / 1024 / 1024).toFixed(2)} MB`);
  
  // 进度条显示
  const showProgress = options.progress;
  let lastProgress: ProgressInfo | null = null;
  
  const onProgress = showProgress ? (p: ProgressInfo) => {
    lastProgress = p;
    if (p.phase === 'complete') {
      console.log(`\n[OK] Diff complete!`);
      console.log(`[INFO] Processed: ${(p.processedBytes / 1024 / 1024).toFixed(2)} MB`);
      console.log(`[INFO] Chunks: ${p.processedChunks}`);
      console.log(`[INFO] Memory usage: ${p.memoryUsageMB.toFixed(2)} MB`);
    } else {
      const percent = p.totalBytes > 0 ? (p.processedBytes / p.totalBytes * 100).toFixed(1) : '0.0';
      const bar = '█'.repeat(Math.floor(Number(percent) / 5)) + '░'.repeat(20 - Math.floor(Number(percent) / 5));
      process.stdout.write(`\r[${bar}] ${percent}% | ${p.speedMBps.toFixed(2)} MB/s | Mem: ${p.memoryUsageMB.toFixed(0)}MB`);
    }
  } : undefined;
  
  const streamOptions: StreamOptions = {
    maxMemoryMB: options.maxMemory,
    chunkSizeMB: options.chunkSize,
    compression: options.compression,
    onProgress
  };
  
  const processor = new StreamingProcessor(streamOptions);
  
  try {
    await processor.diffStream(oldFile, newFile, options.output);
    
    if (!showProgress) {
      console.log(`[OK] Diff written: ${options.output}`);
    }
    
    // 验证输出
    const outputStats = fs.statSync(options.output);
    console.log(`[INFO] Output size: ${(outputStats.size / 1024).toFixed(2)} KB`);
    
    // 内存使用验证
    if (lastProgress && lastProgress.memoryUsageMB > options.maxMemory) {
      console.warn(`[WARN] Memory usage (${lastProgress.memoryUsageMB.toFixed(2)}MB) exceeded limit (${options.maxMemory}MB)`);
    }
    
  } catch (err) {
    console.error(`\n[ERROR]`, err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

/**
 * 注册流式 diff 命令
 */
export function registerDiffStreamCommand(program: Command): void {
  program
    .command('diff-stream')
    .description('Compare large files using streaming (supports >1GB)')
    .argument('<old>', 'Old file path')
    .argument('<new>', 'New file path')
    .option('-o, --output <file>', 'Output file', 'patch.hdiff')
    .option('--max-memory <MB>', 'Memory limit in MB', '200')
    .option('--chunk-size <MB>', 'Chunk size in MB', '64')
    .option('--compression <algo>', 'Compression (none|gzip|zstd)', 'none')
    .option('--progress', 'Show progress bar', false)
    .option('--resume', 'Enable resume support', false)
    .action(async (oldFile: string, newFile: string, options: any) => {
      await diffStream(oldFile, newFile, {
        output: options.output,
        maxMemory: parseInt(options.maxMemory, 10),
        chunkSize: parseInt(options.chunkSize, 10),
        compression: options.compression,
        progress: options.progress,
        resume: options.resume
      });
    });
}
