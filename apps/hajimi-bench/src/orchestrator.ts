/**
 * Hajimi Benchmark Orchestrator
 * 
 * ID-129: 角斗场平台原型
 * 
 * DEBT-BENCH-001: 仅支持内存测试，流式 >1GB 未实现（P1）
 * DEBT-BENCH-002: 当前仅支持单线程，多线程优化待实现（P2）
 * DEBT-BENCH-003: 文件大小限制100MB，v1.1改用stream（P0）
 *   - 防止大文件导致OOM
 *   - 当前限制：100MB
 *   - 未来：改用streaming支持>1GB
 */

import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { blake3_256 } from '@hajimi/diff';

// OOM Guard: 文件大小限制 (100MB)
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

function checkFileSize(filePath: string): void {
  const stats = fs.statSync(filePath);
  if (stats.size > MAX_FILE_SIZE) {
    console.error(`[ERROR] File >100MB not supported in v1.0-alpha (DEBT-BENCH-003). Use streaming in v1.1.`);
    console.error(`[ERROR] File: ${filePath}`);
    console.error(`[ERROR] Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    throw new Error(`File too large: ${filePath}`);
  }
}

export interface Adapter {
  name: string;
  version: string;
  compress: (input: Buffer) => Promise<Buffer>;
  decompress: (patch: Buffer, base: Buffer) => Promise<Buffer>;
}

export interface BenchmarkResult {
  adapter: string;
  dataset: string;
  testCase: string;
  compressionRatio: number;  // 0-1, higher is better
  speedMbps: number;         // MB/s
  peakMemoryMb: number;      // Peak memory usage in MB
  correctness: boolean;      // BLAKE3-256 must match
  durationMs: number;        // Total duration
}

export interface LeaderboardEntry {
  rank: number;
  adapter: string;
  avgCompressionRatio: number;
  avgSpeedMbps: number;
  totalScore: number;  // Weighted composite score
}

export class BenchmarkOrchestrator {
  private adapters: Map<string, Adapter> = new Map();
  private fixturesDir: string;

  constructor(fixturesDir: string) {
    this.fixturesDir = fixturesDir;
  }

  registerAdapter(adapter: Adapter): void {
    this.adapters.set(adapter.name, adapter);
    console.log(`[Orchestrator] Registered adapter: ${adapter.name} v${adapter.version}`);
  }

  async loadDataset(datasetName: string): Promise<Array<{ name: string; base: Buffer; target: Buffer }>> {
    const datasetDir = path.join(this.fixturesDir, datasetName);
    
    if (!fs.existsSync(datasetDir)) {
      throw new Error(`Dataset not found: ${datasetDir}`);
    }

    const cases: Array<{ name: string; base: Buffer; target: Buffer }> = [];
    
    // Load all pairs from dataset directory
    // Expected structure: fixtures/ai-chat/case1/base.txt, fixtures/ai-chat/case1/target.txt
    const entries = fs.readdirSync(datasetDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const caseDir = path.join(datasetDir, entry.name);
        const baseFile = path.join(caseDir, 'base.txt');
        const targetFile = path.join(caseDir, 'target.txt');
        
        if (fs.existsSync(baseFile) && fs.existsSync(targetFile)) {
          // OOM Guard: 检查文件大小
          checkFileSize(baseFile);
          checkFileSize(targetFile);
          cases.push({
            name: entry.name,
            base: fs.readFileSync(baseFile),
            target: fs.readFileSync(targetFile),
          });
        }
      }
    }

    // Fallback: if no subdirectories, look for base/target files directly
    if (cases.length === 0) {
      const baseFile = path.join(datasetDir, 'base.txt');
      const targetFile = path.join(datasetDir, 'target.txt');
      if (fs.existsSync(baseFile) && fs.existsSync(targetFile)) {
        // OOM Guard: 检查文件大小
        checkFileSize(baseFile);
        checkFileSize(targetFile);
        cases.push({
          name: 'default',
          base: fs.readFileSync(baseFile),
          target: fs.readFileSync(targetFile),
        });
      }
    }

    console.log(`[Orchestrator] Loaded ${cases.length} test cases from dataset: ${datasetName}`);
    return cases;
  }

  async runBenchmark(
    adapterName: string,
    datasetName: string
  ): Promise<BenchmarkResult[]> {
    const adapter = this.adapters.get(adapterName);
    if (!adapter) {
      throw new Error(`Adapter not found: ${adapterName}`);
    }

    const cases = await this.loadDataset(datasetName);
    const results: BenchmarkResult[] = [];

    for (const testCase of cases) {
      console.log(`[Benchmark] ${adapterName} / ${datasetName} / ${testCase.name}`);

      // Measure memory before
      const memBefore = process.memoryUsage();
      const startTime = performance.now();

      // Compress
      let patch: Buffer;
      try {
        patch = await adapter.compress(testCase.target);
      } catch (err) {
        console.error(`[ERROR] Compression failed: ${err}`);
        continue;
      }

      // Decompress
      let output: Buffer;
      try {
        output = await adapter.decompress(patch, testCase.base);
      } catch (err) {
        console.error(`[ERROR] Decompression failed: ${err}`);
        continue;
      }

      const durationMs = performance.now() - startTime;
      const memAfter = process.memoryUsage();
      const peakMemoryMb = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;

      // Verify correctness (SHA256 must match)
      const targetHash = Buffer.from(blake3_256(testCase.target)).toString('hex');
      const outputHash = Buffer.from(blake3_256(output)).toString('hex');
      const correctness = targetHash === outputHash;

      if (!correctness) {
        console.error(`[ERROR] Hash mismatch! Expected: ${targetHash}, Got: ${outputHash}`);
      }

      // Calculate metrics
      const compressionRatio = 1 - (patch.length / testCase.target.length);
      const speedMbps = (testCase.target.length / 1024 / 1024) / (durationMs / 1000);

      results.push({
        adapter: adapterName,
        dataset: datasetName,
        testCase: testCase.name,
        compressionRatio,
        speedMbps,
        peakMemoryMb,
        correctness,
        durationMs,
      });

      console.log(`[Result] Ratio: ${(compressionRatio * 100).toFixed(2)}%, Speed: ${speedMbps.toFixed(2)} MB/s, Correct: ${correctness}`);
    }

    return results;
  }

  generateLeaderboard(results: BenchmarkResult[]): LeaderboardEntry[] {
    const byAdapter = new Map<string, BenchmarkResult[]>();
    
    for (const r of results) {
      const arr = byAdapter.get(r.adapter) || [];
      arr.push(r);
      byAdapter.set(r.adapter, arr);
    }

    const entries: LeaderboardEntry[] = [];
    
    for (const [adapterName, adapterResults] of byAdapter) {
      const avgRatio = adapterResults.reduce((a, b) => a + b.compressionRatio, 0) / adapterResults.length;
      const avgSpeed = adapterResults.reduce((a, b) => a + b.speedMbps, 0) / adapterResults.length;
      
      // Composite score: 60% compression ratio, 40% speed (normalized)
      const totalScore = avgRatio * 0.6 + Math.min(avgSpeed / 100, 1) * 0.4;
      
      entries.push({
        rank: 0, // Will be assigned after sorting
        adapter: adapterName,
        avgCompressionRatio: avgRatio,
        avgSpeedMbps: avgSpeed,
        totalScore,
      });
    }

    // Sort by total score descending
    entries.sort((a, b) => b.totalScore - a.totalScore);
    
    // Assign ranks
    entries.forEach((e, i) => e.rank = i + 1);

    return entries;
  }

  generateReport(results: BenchmarkResult[]): string {
    const lines: string[] = [];
    
    lines.push('# Hajimi Benchmark Report');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Total Tests: ${results.length}`);
    lines.push('');
    
    // Detailed results table
    lines.push('## Detailed Results');
    lines.push('');
    lines.push('| Adapter | Dataset | Test Case | Ratio | Speed (MB/s) | Memory (MB) | Correct |');
    lines.push('|---------|---------|-----------|-------|--------------|-------------|---------|');
    
    for (const r of results) {
      lines.push(`| ${r.adapter} | ${r.dataset} | ${r.testCase} | ${(r.compressionRatio * 100).toFixed(1)}% | ${r.speedMbps.toFixed(2)} | ${r.peakMemoryMb.toFixed(2)} | ${r.correctness ? '✅' : '❌'} |`);
    }
    
    lines.push('');
    
    // Leaderboard
    const leaderboard = this.generateLeaderboard(results);
    lines.push('## Leaderboard');
    lines.push('');
    lines.push('| Rank | Adapter | Avg Ratio | Avg Speed (MB/s) | Score |');
    lines.push('|------|---------|-----------|------------------|-------|');
    
    for (const e of leaderboard) {
      lines.push(`| ${e.rank} | ${e.adapter} | ${(e.avgCompressionRatio * 100).toFixed(1)}% | ${e.avgSpeedMbps.toFixed(2)} | ${(e.totalScore * 100).toFixed(1)} |`);
    }
    
    lines.push('');
    lines.push('## JSON Output');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify({ results, leaderboard }, null, 2));
    lines.push('```');
    
    return lines.join('\n');
  }
}
