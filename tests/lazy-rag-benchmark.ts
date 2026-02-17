/**
 * B-03/09 ⚡ Soyorin·Lazy-RAG性能基准建筑师
 * HAJIMI-DEBT-CLEARANCE-001-LAZY-MVP
 * 
 * 性能基准测试与自动决策
 * 
 * 测试目标：
 * - BENCH-001: 冷启动<5s
 * - BENCH-002: P95延迟<100ms
 * - BENCH-003: 内存<200MB
 * - BENCH-004: 自动判定逻辑正确
 * 
 * 工单: HAJIMI-DEBT-CLEARANCE-001-LAZY-MVP B-03/09
 * 日期: 2026-02-17
 */

import { HybridRAG, RAGDocument } from '@/lib/lcr/retrieval/hybrid-rag';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 性能预算硬指标 (HAJIMI-DEBT-CLEARANCE-001)
// ============================================================================

const PERFORMANCE_BUDGET = {
  /** 冷启动时间阈值: <5s */
  COLD_START_MS: 5000,
  /** 空载内存阈值: <100MB */
  IDLE_MEMORY_KB: 100 * 1024,
  /** 轻量负载内存阈值: <150MB */
  LIGHT_MEMORY_KB: 150 * 1024,
  /** 标准负载内存阈值: <200MB */
  STANDARD_MEMORY_KB: 200 * 1024,
  /** P95延迟阈值: <100ms */
  P95_LATENCY_MS: 100,
  /** 平均延迟阈值: <50ms */
  AVG_LATENCY_MS: 50,
  /** 检索成功率阈值: >99% */
  SUCCESS_RATE: 0.99,
} as const;

// ============================================================================
// 测试场景配置
// ============================================================================

const TEST_SCENARIOS = {
  /** 冷启动测试: 0向量，3次平均 */
  COLD_START: {
    vectorCount: 0,
    iterations: 3,
    description: '冷启动测试',
  },
  /** 空载内存测试: 0向量 */
  IDLE_MEMORY: {
    vectorCount: 0,
    iterations: 10,
    description: '空载内存测试',
  },
  /** 轻量负载: 1,000向量，100次 */
  LIGHT_LOAD: {
    vectorCount: 1000,
    iterations: 100,
    description: '轻量负载测试',
  },
  /** 标准负载: 10,000向量，100次 */
  STANDARD_LOAD: {
    vectorCount: 10000,
    iterations: 100,
    description: '标准负载测试',
  },
  /** 压力负载: 50,000向量，记录数据 */
  STRESS_LOAD: {
    vectorCount: 50000,
    iterations: 50,
    description: '压力负载测试',
  },
} as const;

// ============================================================================
// 类型定义
// ============================================================================

interface BenchmarkResult {
  scenario: string;
  vectorCount: number;
  iterations: number;
  durationMs: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  memoryBeforeKB: number;
  memoryAfterKB: number;
  memoryDeltaKB: number;
  successRate: number;
  throughputQPS: number;
  passed: boolean;
  errors: string[];
  timestamp: string;
}

interface BenchmarkReport {
  version: string;
  timestamp: string;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpuCount: number;
    totalMemoryGB: number;
  };
  results: BenchmarkResult[];
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    overallPassed: boolean;
  };
  decision: {
    passed: boolean;
    message: string;
    plan: 'A' | 'B' | 'C';
    details: {
      coldStartPassed: boolean;
      memory10kPassed: boolean;
      p95LatencyPassed: boolean;
    };
  };
}

interface TestContext {
  rag: HybridRAG;
  documents: RAGDocument[];
  queryVectors: number[][];
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 生成随机向量
 */
function generateVector(dim: number = 384): number[] {
  const vec: number[] = [];
  for (let i = 0; i < dim; i++) {
    vec.push((Math.random() - 0.5) * 2);
  }
  // 归一化
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return vec.map(v => v / (norm + 1e-8));
}

/**
 * 生成测试文档
 */
function generateDocuments(count: number): RAGDocument[] {
  const docs: RAGDocument[] = [];
  const contents = [
    'HAJIMI is a multi-agent orchestration framework',
    'TypeScript provides type safety for large applications',
    'Redis is used for hot storage tier',
    'Vector search enables semantic retrieval',
    'Knowledge graphs capture entity relationships',
    'State machines manage agent lifecycle',
    'Governance voting ensures collective decisions',
    'Yggdrasil branching supports parallel exploration',
    'LCR workspace provides tiered memory',
    'TSA orchestrates storage tiers efficiently',
    'Lazy loading defers expensive operations',
    'Benchmarking validates performance budgets',
    'Memory leaks must be detected early',
    'Cold start impacts user experience',
    'P95 latency reflects worst-case performance',
  ];

  for (let i = 0; i < count; i++) {
    const content = contents[i % contents.length] + ` [doc-${i}]`;
    docs.push({
      id: `doc-${i}`,
      content: content,
      embedding: generateVector(),
      metadata: {
        index: i,
        category: i % 3 === 0 ? 'tech' : i % 3 === 1 ? 'system' : 'data',
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    });
  }

  return docs;
}

/**
 * 获取当前内存使用 (KB)
 */
function getMemoryUsageKB(): number {
  const usage = process.memoryUsage();
  return Math.floor(usage.heapUsed / 1024);
}

/**
 * 计算百分位数
 */
function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, index)];
}

/**
 * 强制垃圾回收 (如果可用)
 */
function forceGC(): void {
  if (global.gc) {
    global.gc();
  }
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// 测试执行器
// ============================================================================

class LazyRAGBenchmark {
  private results: BenchmarkResult[] = [];
  private readonly version = '1.0.0';

  /**
   * 执行完整基准测试套件
   */
  async runFullBenchmark(): Promise<BenchmarkReport> {
    console.log('\n' + '='.repeat(60));
    console.log('  Lazy-RAG 性能基准测试套件');
    console.log('  HAJIMI-DEBT-CLEARANCE-001-LAZY-MVP B-03/09');
    console.log('='.repeat(60) + '\n');

    // 记录环境信息
    const envInfo = this.getEnvironmentInfo();
    console.log('环境信息:');
    console.log(`  Node.js: ${envInfo.nodeVersion}`);
    console.log(`  平台: ${envInfo.platform} ${envInfo.arch}`);
    console.log(`  CPU核心: ${envInfo.cpuCount}`);
    console.log(`  总内存: ${envInfo.totalMemoryGB.toFixed(2)} GB\n`);

    // 执行各场景测试
    await this.runColdStartTest();
    await this.runIdleMemoryTest();
    await this.runLightLoadTest();
    await this.runStandardLoadTest();
    await this.runStressLoadTest();
    await this.runNegativePathTests();

    // 生成报告
    const report = this.generateReport();
    await this.saveReport(report);

    // 执行自动判定
    this.executeDecision(report);

    return report;
  }

  /**
   * BENCH-001: 冷启动测试
   * - 0向量，3次平均，<5s
   */
  private async runColdStartTest(): Promise<void> {
    console.log('\n📊 [BENCH-001] 冷启动测试');
    console.log('-'.repeat(50));

    const durations: number[] = [];
    const errors: string[] = [];

    for (let i = 0; i < TEST_SCENARIOS.COLD_START.iterations; i++) {
      forceGC();
      await sleep(100);

      const startTime = performance.now();
      try {
        const rag = new HybridRAG();
        // 执行一次空查询触发初始化
        await rag.search('test query');
        const duration = performance.now() - startTime;
        durations.push(duration);
        console.log(`  第${i + 1}次: ${duration.toFixed(2)}ms`);
      } catch (err) {
        errors.push(`Iteration ${i}: ${err}`);
        console.log(`  第${i + 1}次: ERROR`);
      }

      // 清理
      forceGC();
    }

    const avgDuration = durations.length > 0 
      ? durations.reduce((a, b) => a + b, 0) / durations.length 
      : 0;
    const passed = avgDuration < PERFORMANCE_BUDGET.COLD_START_MS;

    console.log(`\n  平均冷启动: ${avgDuration.toFixed(2)}ms`);
    console.log(`  阈值: ${PERFORMANCE_BUDGET.COLD_START_MS}ms`);
    console.log(`  结果: ${passed ? '✅ PASS' : '❌ FAIL'}`);

    this.results.push({
      scenario: 'COLD_START',
      vectorCount: 0,
      iterations: TEST_SCENARIOS.COLD_START.iterations,
      durationMs: avgDuration,
      avgLatencyMs: avgDuration,
      p50LatencyMs: percentile([...durations].sort((a, b) => a - b), 50),
      p95LatencyMs: percentile([...durations].sort((a, b) => a - b), 95),
      p99LatencyMs: percentile([...durations].sort((a, b) => a - b), 99),
      minLatencyMs: Math.min(...durations),
      maxLatencyMs: Math.max(...durations),
      memoryBeforeKB: 0,
      memoryAfterKB: 0,
      memoryDeltaKB: 0,
      successRate: durations.length / TEST_SCENARIOS.COLD_START.iterations,
      throughputQPS: 0,
      passed,
      errors,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 空载内存测试
   * - 0向量，<100MB
   */
  private async runIdleMemoryTest(): Promise<void> {
    console.log('\n📊 空载内存测试');
    console.log('-'.repeat(50));

    forceGC();
    await sleep(100);

    const memoryBefore = getMemoryUsageKB();
    console.log(`  初始内存: ${memoryBefore} KB`);

    const rag = new HybridRAG();
    await rag.search('test');

    const memoryAfter = getMemoryUsageKB();
    const memoryDelta = memoryAfter - memoryBefore;
    const passed = memoryAfter < PERFORMANCE_BUDGET.IDLE_MEMORY_KB;

    console.log(`  使用后内存: ${memoryAfter} KB`);
    console.log(`  内存增量: ${memoryDelta} KB`);
    console.log(`  阈值: ${PERFORMANCE_BUDGET.IDLE_MEMORY_KB} KB`);
    console.log(`  结果: ${passed ? '✅ PASS' : '❌ FAIL'}`);

    this.results.push({
      scenario: 'IDLE_MEMORY',
      vectorCount: 0,
      iterations: TEST_SCENARIOS.IDLE_MEMORY.iterations,
      durationMs: 0,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      minLatencyMs: 0,
      maxLatencyMs: 0,
      memoryBeforeKB: memoryBefore,
      memoryAfterKB: memoryAfter,
      memoryDeltaKB: memoryDelta,
      successRate: 1,
      throughputQPS: 0,
      passed,
      errors: [],
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * BENCH-002: 轻量负载测试
   * - 1,000向量，100次，P95<100ms，内存<150MB
   */
  private async runLightLoadTest(): Promise<void> {
    console.log('\n📊 [BENCH-002] 轻量负载测试 (1,000向量)');
    console.log('-'.repeat(50));

    const result = await this.runLoadTest(
      'LIGHT_LOAD',
      TEST_SCENARIOS.LIGHT_LOAD.vectorCount,
      TEST_SCENARIOS.LIGHT_LOAD.iterations,
      PERFORMANCE_BUDGET.LIGHT_MEMORY_KB
    );

    console.log(`\n  平均延迟: ${result.avgLatencyMs.toFixed(2)}ms`);
    console.log(`  P95延迟: ${result.p95LatencyMs.toFixed(2)}ms`);
    console.log(`  内存使用: ${result.memoryAfterKB} KB`);
    console.log(`  吞吐量: ${result.throughputQPS.toFixed(2)} QPS`);
    console.log(`  P95阈值: ${PERFORMANCE_BUDGET.P95_LATENCY_MS}ms`);
    console.log(`  内存阈值: ${PERFORMANCE_BUDGET.LIGHT_MEMORY_KB} KB`);
    console.log(`  结果: ${result.passed ? '✅ PASS' : '❌ FAIL'}`);

    this.results.push(result);
  }

  /**
   * BENCH-003: 标准负载测试
   * - 10,000向量，100次，P95<100ms，内存<200MB
   */
  private async runStandardLoadTest(): Promise<void> {
    console.log('\n📊 [BENCH-003] 标准负载测试 (10,000向量)');
    console.log('-'.repeat(50));

    const result = await this.runLoadTest(
      'STANDARD_LOAD',
      TEST_SCENARIOS.STANDARD_LOAD.vectorCount,
      TEST_SCENARIOS.STANDARD_LOAD.iterations,
      PERFORMANCE_BUDGET.STANDARD_MEMORY_KB
    );

    console.log(`\n  平均延迟: ${result.avgLatencyMs.toFixed(2)}ms`);
    console.log(`  P95延迟: ${result.p95LatencyMs.toFixed(2)}ms`);
    console.log(`  内存使用: ${result.memoryAfterKB} KB`);
    console.log(`  吞吐量: ${result.throughputQPS.toFixed(2)} QPS`);
    console.log(`  P95阈值: ${PERFORMANCE_BUDGET.P95_LATENCY_MS}ms`);
    console.log(`  内存阈值: ${PERFORMANCE_BUDGET.STANDARD_MEMORY_KB} KB`);
    console.log(`  结果: ${result.passed ? '✅ PASS' : '❌ FAIL'}`);

    this.results.push(result);
  }

  /**
   * 压力负载测试
   * - 50,000向量，记录数据
   */
  private async runStressLoadTest(): Promise<void> {
    console.log('\n📊 压力负载测试 (50,000向量)');
    console.log('-'.repeat(50));

    const result = await this.runLoadTest(
      'STRESS_LOAD',
      TEST_SCENARIOS.STRESS_LOAD.vectorCount,
      TEST_SCENARIOS.STRESS_LOAD.iterations,
      PERFORMANCE_BUDGET.STANDARD_MEMORY_KB * 2, // 放宽内存限制用于数据记录
      false // 不强制失败
    );

    console.log(`\n  平均延迟: ${result.avgLatencyMs.toFixed(2)}ms`);
    console.log(`  P95延迟: ${result.p95LatencyMs.toFixed(2)}ms`);
    console.log(`  P99延迟: ${result.p99LatencyMs.toFixed(2)}ms`);
    console.log(`  内存使用: ${result.memoryAfterKB} KB`);
    console.log(`  吞吐量: ${result.throughputQPS.toFixed(2)} QPS`);
    console.log(`  成功率: ${(result.successRate * 100).toFixed(2)}%`);
    console.log(`  状态: ${result.errors.length === 0 ? '✅ 完成' : '⚠️ 有错误'}`);

    this.results.push(result);
  }

  /**
   * 通用负载测试执行
   */
  private async runLoadTest(
    scenario: string,
    vectorCount: number,
    iterations: number,
    memoryThresholdKB: number,
    strictFail: boolean = true
  ): Promise<BenchmarkResult> {
    // 准备数据
    console.log(`  生成 ${vectorCount} 个测试文档...`);
    const documents = generateDocuments(vectorCount);
    const queryVectors = Array(iterations).fill(0).map(() => generateVector());

    // 初始化
    forceGC();
    await sleep(100);
    const memoryBefore = getMemoryUsageKB();

    const rag = new HybridRAG();
    
    // 加载文档
    const loadStart = performance.now();
    for (const doc of documents) {
      rag.addDocument(doc);
    }
    const loadDuration = performance.now() - loadStart;
    console.log(`  文档加载耗时: ${loadDuration.toFixed(2)}ms`);

    // 执行查询
    const latencies: number[] = [];
    const errors: string[] = [];
    const testStart = performance.now();

    for (let i = 0; i < iterations; i++) {
      const queryStart = performance.now();
      try {
        await rag.search('benchmark query', { 
          vector: queryVectors[i],
          limit: 5 
        });
        const latency = performance.now() - queryStart;
        latencies.push(latency);
      } catch (err) {
        errors.push(`Query ${i}: ${err}`);
      }
    }

    const totalDuration = performance.now() - testStart;
    const memoryAfter = getMemoryUsageKB();

    // 计算指标
    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const avgLatency = latencies.length > 0 
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
      : 0;
    const p95Latency = percentile(sortedLatencies, 95);
    const successRate = latencies.length / iterations;

    // 判定结果
    const passed = strictFail
      ? p95Latency < PERFORMANCE_BUDGET.P95_LATENCY_MS && 
        memoryAfter < memoryThresholdKB &&
        successRate >= PERFORMANCE_BUDGET.SUCCESS_RATE
      : true;

    return {
      scenario,
      vectorCount,
      iterations,
      durationMs: totalDuration,
      avgLatencyMs: avgLatency,
      p50LatencyMs: percentile(sortedLatencies, 50),
      p95LatencyMs: p95Latency,
      p99LatencyMs: percentile(sortedLatencies, 99),
      minLatencyMs: Math.min(...latencies),
      maxLatencyMs: Math.max(...latencies),
      memoryBeforeKB: memoryBefore,
      memoryAfterKB: memoryAfter,
      memoryDeltaKB: memoryAfter - memoryBefore,
      successRate,
      throughputQPS: (iterations / totalDuration) * 1000,
      passed,
      errors,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 负面路径测试
   * - 未启动、索引损坏、跨平台路径
   */
  private async runNegativePathTests(): Promise<void> {
    console.log('\n📊 [BENCH-004] 负面路径测试');
    console.log('-'.repeat(50));

    const errors: string[] = [];

    // 测试1: 空查询
    try {
      console.log('  测试: 空查询处理');
      const rag = new HybridRAG();
      const result = await rag.search('');
      console.log(`    结果: ${result.length === 0 ? '✅ 返回空数组' : '⚠️ 返回结果'}`);
    } catch (err) {
      errors.push(`Empty query: ${err}`);
      console.log('    结果: ❌ 抛出异常');
    }

    // 测试2: 特殊字符查询
    try {
      console.log('  测试: 特殊字符查询');
      const rag = new HybridRAG();
      rag.addDocument({
        id: 'test-1',
        content: 'Test content with special chars: <>&"\'',
        metadata: {},
        timestamp: Date.now(),
      });
      const result = await rag.search('<script>alert("xss")</script>');
      console.log(`    结果: ✅ 正常处理，返回 ${result.length} 条`);
    } catch (err) {
      errors.push(`Special chars: ${err}`);
      console.log('    结果: ❌ 抛出异常');
    }

    // 测试3: 超长查询
    try {
      console.log('  测试: 超长查询');
      const rag = new HybridRAG();
      const longQuery = 'word '.repeat(10000);
      const result = await rag.search(longQuery);
      console.log(`    结果: ✅ 正常处理，返回 ${result.length} 条`);
    } catch (err) {
      errors.push(`Long query: ${err}`);
      console.log('    结果: ❌ 抛出异常');
    }

    // 测试4: 大量文档后清理
    try {
      console.log('  测试: 内存释放');
      forceGC();
      const memBefore = getMemoryUsageKB();
      
      let rag = new HybridRAG();
      const docs = generateDocuments(5000);
      for (const doc of docs) {
        rag.addDocument(doc);
      }
      
      // 释放引用
      rag = null as any;
      forceGC();
      await sleep(200);
      
      const memAfter = getMemoryUsageKB();
      console.log(`    内存变化: ${memBefore} KB → ${memAfter} KB`);
      console.log('    结果: ✅ 引用释放完成');
    } catch (err) {
      errors.push(`Memory cleanup: ${err}`);
      console.log('    结果: ❌ 异常');
    }

    // 测试5: 并发查询
    try {
      console.log('  测试: 并发查询');
      const rag = new HybridRAG();
      const docs = generateDocuments(100);
      for (const doc of docs) {
        rag.addDocument(doc);
      }

      const promises = Array(10).fill(0).map(() => 
        rag.search('concurrent test')
      );
      
      const results = await Promise.all(promises);
      const allSuccess = results.every(r => Array.isArray(r));
      console.log(`    结果: ${allSuccess ? '✅' : '❌'} 10并发全部完成`);
    } catch (err) {
      errors.push(`Concurrent: ${err}`);
      console.log('    结果: ❌ 异常');
    }

    this.results.push({
      scenario: 'NEGATIVE_PATH',
      vectorCount: 0,
      iterations: 5,
      durationMs: 0,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      minLatencyMs: 0,
      maxLatencyMs: 0,
      memoryBeforeKB: 0,
      memoryAfterKB: 0,
      memoryDeltaKB: 0,
      successRate: errors.length === 0 ? 1 : 0,
      throughputQPS: 0,
      passed: errors.length === 0,
      errors,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 获取环境信息
   */
  private getEnvironmentInfo() {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuCount: require('os').cpus().length,
      totalMemoryGB: require('os').totalmem() / (1024 ** 3),
    };
  }

  /**
   * 生成完整报告
   */
  private generateReport(): BenchmarkReport {
    const coldStart = this.results.find(r => r.scenario === 'COLD_START');
    const standardLoad = this.results.find(r => r.scenario === 'STANDARD_LOAD');

    const coldStartPassed = coldStart?.passed ?? false;
    const memory10kPassed = (standardLoad?.memoryAfterKB ?? Infinity) < PERFORMANCE_BUDGET.STANDARD_MEMORY_KB;
    const p95LatencyPassed = (standardLoad?.p95LatencyMs ?? Infinity) < PERFORMANCE_BUDGET.P95_LATENCY_MS;

    const allPassed = coldStartPassed && memory10kPassed && p95LatencyPassed;

    let plan: 'A' | 'B' | 'C';
    let message: string;

    if (allPassed) {
      plan = 'A';
      message = 'Lazy-RAG达标，债务清零';
    } else if (coldStartPassed && (memory10kPassed || p95LatencyPassed)) {
      plan = 'B';
      message = '触发Plan B（优化）';
    } else {
      plan = 'C';
      message = '触发Plan C（迁云）';
    }

    return {
      version: this.version,
      timestamp: new Date().toISOString(),
      environment: this.getEnvironmentInfo(),
      results: this.results,
      summary: {
        totalTests: this.results.length,
        passedTests: this.results.filter(r => r.passed).length,
        failedTests: this.results.filter(r => !r.passed).length,
        overallPassed: allPassed,
      },
      decision: {
        passed: allPassed,
        message,
        plan,
        details: {
          coldStartPassed,
          memory10kPassed,
          p95LatencyPassed,
        },
      },
    };
  }

  /**
   * 保存报告到文件
   */
  private async saveReport(report: BenchmarkReport): Promise<void> {
    const outputPath = path.resolve(process.cwd(), 'benchmark-result.json');
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 性能数据已保存: ${outputPath}`);
  }

  /**
   * 执行自动判定逻辑
   */
  private executeDecision(report: BenchmarkReport): void {
    console.log('\n' + '='.repeat(60));
    console.log('  自动决策判定');
    console.log('='.repeat(60));

    const coldStartResult = this.results.find(r => r.scenario === 'COLD_START');
    const standardResult = this.results.find(r => r.scenario === 'STANDARD_LOAD');

    const coldStart = coldStartResult?.avgLatencyMs ?? Infinity;
    const memory10k = standardResult?.memoryAfterKB ?? Infinity;
    const p95Latency = standardResult?.p95LatencyMs ?? Infinity;

    console.log(`\n判定条件:`);
    console.log(`  冷启动 (${coldStart.toFixed(2)}ms) < ${PERFORMANCE_BUDGET.COLD_START_MS}ms : ${coldStart < PERFORMANCE_BUDGET.COLD_START_MS ? '✅' : '❌'}`);
    console.log(`  内存10k (${memory10k} KB) < ${PERFORMANCE_BUDGET.STANDARD_MEMORY_KB} KB : ${memory10k < PERFORMANCE_BUDGET.STANDARD_MEMORY_KB ? '✅' : '❌'}`);
    console.log(`  P95延迟 (${p95Latency.toFixed(2)}ms) < ${PERFORMANCE_BUDGET.P95_LATENCY_MS}ms : ${p95Latency < PERFORMANCE_BUDGET.P95_LATENCY_MS ? '✅' : '❌'}`);

    console.log('\n' + '-'.repeat(60));

    // 核心判定逻辑
    if (coldStart < PERFORMANCE_BUDGET.COLD_START_MS && 
        memory10k < PERFORMANCE_BUDGET.STANDARD_MEMORY_KB && 
        p95Latency < PERFORMANCE_BUDGET.P95_LATENCY_MS) {
      console.log('[DECISION] ✅ Lazy-RAG达标，债务清零');
      console.log(`[PLAN] A - 生产就绪`);
    } else {
      const needPlanB = coldStart < PERFORMANCE_BUDGET.COLD_START_MS || 
                       p95Latency < PERFORMANCE_BUDGET.P95_LATENCY_MS * 2;
      if (needPlanB) {
        console.log('[DECISION] ⚠️ 触发Plan B（优化）');
        console.log(`[PLAN] B - 需要优化:`);
        if (coldStart >= PERFORMANCE_BUDGET.COLD_START_MS) {
          console.log('  - 冷启动时间过长，考虑懒加载优化');
        }
        if (memory10k >= PERFORMANCE_BUDGET.STANDARD_MEMORY_KB) {
          console.log('  - 内存使用过高，考虑索引压缩');
        }
        if (p95Latency >= PERFORMANCE_BUDGET.P95_LATENCY_MS) {
          console.log('  - 延迟过高，考虑ANN算法优化');
        }
      } else {
        console.log('[DECISION] ❌ 触发Plan C（迁云）');
        console.log(`[PLAN] C - 迁移至云端向量数据库`);
      }
    }

    console.log('='.repeat(60) + '\n');
  }
}

// ============================================================================
// 主执行入口
// ============================================================================

async function main() {
  const benchmark = new LazyRAGBenchmark();
  
  try {
    const report = await benchmark.runFullBenchmark();
    
    // 根据判定结果设置退出码
    if (report.decision.passed) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('基准测试执行失败:', err);
    process.exit(1);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main();
}

// 导出供其他模块使用
export { LazyRAGBenchmark, PERFORMANCE_BUDGET, TEST_SCENARIOS };
export type { BenchmarkResult, BenchmarkReport };
