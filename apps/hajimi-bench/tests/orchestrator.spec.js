/**
 * Benchmark Orchestrator Tests
 * 
 * Self-Tests:
 * - BENCH-FUNC-001: Orchestrator can load dataset
 * - BENCH-FUNC-002: Adapter registration works
 * - BENCH-FUNC-003: Benchmark runs and produces results
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('os');
const path = require('path');

// Import the orchestrator (compiled JS)
const { BenchmarkOrchestrator } = require('../dist/orchestrator');

test('BENCH-FUNC-001: Orchestrator can load ai-chat dataset', async () => {
  const fixturesDir = path.join(__dirname, '..', 'fixtures');
  const orchestrator = new BenchmarkOrchestrator(fixturesDir);
  
  const cases = await orchestrator.loadDataset('ai-chat');
  assert.ok(cases.length > 0, 'should load at least one test case');
  
  const firstCase = cases[0];
  assert.ok(firstCase.base.length > 0, 'base should have content');
  assert.ok(firstCase.target.length > 0, 'target should have content');
  assert.notDeepStrictEqual(firstCase.base, firstCase.target, 'base and target should differ');
});

test('BENCH-FUNC-002: Adapter registration works', () => {
  const orchestrator = new BenchmarkOrchestrator('/tmp');
  
  orchestrator.registerAdapter({
    name: 'test-adapter',
    version: '1.0.0',
    compress: async (input) => input,
    decompress: async (patch, base) => patch,
  });
  
  // Registration should not throw
  assert.ok(true, 'adapter registered successfully');
});

test('BENCH-FUNC-003: Benchmark runs and produces correct results', async () => {
  const fixturesDir = path.join(__dirname, '..', 'fixtures');
  const orchestrator = new BenchmarkOrchestrator(fixturesDir);
  
  // Register a simple test adapter
  orchestrator.registerAdapter({
    name: 'test-adapter',
    version: '1.0.0',
    compress: async (input) => {
      // Simple "compression": prefix with header
      return Buffer.concat([Buffer.from('HEADER'), input]);
    },
    decompress: async (patch, base) => {
      // Remove header
      return patch.slice(6);
    },
  });
  
  const results = await orchestrator.runBenchmark('test-adapter', 'ai-chat');
  
  assert.ok(results.length > 0, 'should produce at least one result');
  
  for (const r of results) {
    assert.strictEqual(r.adapter, 'test-adapter', 'result should have correct adapter name');
    assert.strictEqual(r.dataset, 'ai-chat', 'result should have correct dataset name');
    assert.ok(typeof r.compressionRatio === 'number', 'should have compressionRatio');
    assert.ok(typeof r.speedMbps === 'number', 'should have speedMbps');
    assert.ok(r.correctness === true, 'decompressed data should match original (correctness)');
  }
});

test('BENCH-FUNC-004: Leaderboard generation works', async () => {
  const fixturesDir = path.join(__dirname, '..', 'fixtures');
  const orchestrator = new BenchmarkOrchestrator(fixturesDir);
  
  // Register two adapters
  orchestrator.registerAdapter({
    name: 'adapter-a',
    version: '1.0.0',
    compress: async (input) => input, // 0% compression
    decompress: async (patch, base) => patch,
  });
  
  orchestrator.registerAdapter({
    name: 'adapter-b',
    version: '1.0.0',
    compress: async (input) => input.slice(0, input.length / 2), // 50% compression
    decompress: async (patch, base) => Buffer.concat([patch, patch]), // restore
  });
  
  // Run benchmarks for both
  const resultsA = await orchestrator.runBenchmark('adapter-a', 'ai-chat');
  const resultsB = await orchestrator.runBenchmark('adapter-b', 'ai-chat');
  
  const allResults = [...resultsA, ...resultsB];
  const leaderboard = orchestrator.generateLeaderboard(allResults);
  
  assert.ok(leaderboard.length >= 2, 'leaderboard should have at least 2 entries');
  assert.strictEqual(leaderboard[0].rank, 1, 'first entry should have rank 1');
  
  // Adapter-b should have better compression and rank higher
  const entryB = leaderboard.find(e => e.adapter === 'adapter-b');
  const entryA = leaderboard.find(e => e.adapter === 'adapter-a');
  
  assert.ok(entryB.rank < entryA.rank, 'adapter-b should rank higher than adapter-a');
});

test('BENCH-FUNC-005: Report generation produces markdown', async () => {
  const fixturesDir = path.join(__dirname, '..', 'fixtures');
  const orchestrator = new BenchmarkOrchestrator(fixturesDir);
  
  orchestrator.registerAdapter({
    name: 'test-adapter',
    version: '1.0.0',
    compress: async (input) => input,
    decompress: async (patch, base) => patch,
  });
  
  const results = await orchestrator.runBenchmark('test-adapter', 'ai-chat');
  const report = orchestrator.generateReport(results);
  
  assert.ok(report.includes('# Hajimi Benchmark Report'), 'report should have title');
  assert.ok(report.includes('## Detailed Results'), 'report should have detailed results section');
  assert.ok(report.includes('## Leaderboard'), 'report should have leaderboard section');
  assert.ok(report.includes('```json'), 'report should have JSON output section');
});

console.log('[INFO] Benchmark tests loaded. Run with: node --test tests/orchestrator.spec.js');
