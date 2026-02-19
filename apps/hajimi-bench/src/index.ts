#!/usr/bin/env node
/**
 * Hajimi Benchmark CLI
 * 
 * ID-129: 角斗场平台原型
 * 
 * Usage:
 *   hajimi-bench --adapter=hajimi-diff --dataset=ai-chat
 *   hajimi-bench --list-adapters
 *   hajimi-bench --list-datasets
 */

import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { BenchmarkOrchestrator, Adapter } from './orchestrator';
import { blake3_256 } from '@hajimi/diff';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const program = new Command();

program
  .name('hajimi-bench')
  .description('Hajimi Benchmark Suite - Algorithm Arena')
  .version('1.0.0-alpha');

program
  .option('-a, --adapter <name>', 'Adapter to benchmark', 'hajimi-diff')
  .option('-d, --dataset <name>', 'Dataset to use', 'ai-chat')
  .option('--list-adapters', 'List available adapters')
  .option('--list-datasets', 'List available datasets')
  .option('-o, --output <file>', 'Output report file', 'results/benchmark-report.md')
  .option('--json <file>', 'Output JSON results', 'results/benchmark-results.json')
  .action(async (options: {
    adapter: string;
    dataset: string;
    listAdapters: boolean;
    listDatasets: boolean;
    output: string;
    json: string;
  }) => {
    const fixturesDir = path.join(__dirname, '..', 'fixtures');
    const orchestrator = new BenchmarkOrchestrator(fixturesDir);

    // Register adapters
    // 1. Hajimi-Diff (prototype)
    orchestrator.registerAdapter({
      name: 'hajimi-diff',
      version: '0.9.1-alpha',
      compress: async (input: Buffer) => {
        // DEBT-BENCH-001: 原型使用简单 JSON 格式，非优化 CDC+zstd
        const hash = Buffer.from(blake3_256(input)).toString('hex');
        const envelope = {
          magic: 'HAJI-BENCH',
          algorithm: 'prototype',
          hash,
          size: input.length,
          data: input.toString('base64'),
          timestamp: new Date().toISOString(),
        };
        return Buffer.from(JSON.stringify(envelope));
      },
      decompress: async (patch: Buffer, base: Buffer) => {
        const envelope = JSON.parse(patch.toString());
        return Buffer.from(envelope.data, 'base64');
      },
    });

    // 2. Raw (baseline - no compression)
    orchestrator.registerAdapter({
      name: 'raw',
      version: '1.0.0',
      compress: async (input: Buffer) => input,
      decompress: async (patch: Buffer, base: Buffer) => patch,
    });

    // 3. Node.js gzip
    orchestrator.registerAdapter({
      name: 'gzip',
      version: 'node-native',
      compress: async (input: Buffer) => {
        return await gzip(input);
      },
      decompress: async (patch: Buffer, base: Buffer) => {
        return await gunzip(patch);
      },
    });

    if (options.listAdapters) {
      console.log('Available adapters:');
      console.log('  - hajimi-diff: Hajimi Diff (prototype)');
      console.log('  - raw: No compression (baseline)');
      console.log('  - gzip: Node.js native gzip');
      return;
    }

    if (options.listDatasets) {
      console.log('Available datasets:');
      const entries = fs.readdirSync(fixturesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          console.log(`  - ${entry.name}`);
        }
      }
      return;
    }

    // Run benchmark
    console.log(`[Bench] Running benchmark: adapter=${options.adapter}, dataset=${options.dataset}`);
    
    try {
      const results = await orchestrator.runBenchmark(options.adapter, options.dataset);
      
      if (results.length === 0) {
        console.error('[ERROR] No benchmark results generated');
        process.exit(1);
      }

      // Generate report
      const report = orchestrator.generateReport(results);
      
      // Ensure output directory exists
      fs.mkdirSync(path.dirname(options.output), { recursive: true });
      
      // Write markdown report
      fs.writeFileSync(options.output, report);
      console.log(`[OK] Report written: ${options.output}`);
      
      // Write JSON results
      const leaderboard = orchestrator.generateLeaderboard(results);
      fs.writeFileSync(options.json, JSON.stringify({ results, leaderboard }, null, 2));
      console.log(`[OK] JSON results written: ${options.json}`);
      
      // Print summary
      console.log('');
      console.log('=== Benchmark Summary ===');
      console.log(`Tests: ${results.length}`);
      console.log(`Correct: ${results.filter(r => r.correctness).length}/${results.length}`);
      console.log(`Avg Compression Ratio: ${(results.reduce((a, b) => a + b.compressionRatio, 0) / results.length * 100).toFixed(2)}%`);
      console.log(`Avg Speed: ${(results.reduce((a, b) => a + b.speedMbps, 0) / results.length).toFixed(2)} MB/s`);
      
      // DEBT-BENCH-001 warning
      console.log('');
      console.log('[WARN] DEBT-BENCH-001: Only in-memory testing supported. Streaming >1GB not implemented.');
      
    } catch (err) {
      console.error('[ERROR]', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.parse();
