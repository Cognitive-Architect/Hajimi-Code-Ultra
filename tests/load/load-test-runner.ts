/**
 * YGGDRASIL P2 - 轻量级压力测试运行器
 * HAJIMI-YGGDRASIL-P2-LOAD-Smoke
 * 
 * 50并发冒烟测试（无需Artillery依赖）
 * 自测点: LOAD-001~003
 */

import http from 'http';

interface LoadTestConfig {
  target: string;
  port: number;
  concurrency: number;  // 并发数
  duration: number;     // 持续时间(秒)
  path: string;
  method: string;
}

interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  latencies: number[];
  p50: number;
  p99: number;
  errorRate: number;
  duration: number;
}

class LoadTestRunner {
  private results: LoadTestResult = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    latencies: [],
    p50: 0,
    p99: 0,
    errorRate: 0,
    duration: 0,
  };

  /**
   * 执行压力测试
   */
  async run(config: LoadTestConfig): Promise<LoadTestResult> {
    console.log(`[LoadTest] 启动50并发冒烟测试...`);
    console.log(`目标: ${config.target}:${config.port}${config.path}`);
    console.log(`并发: ${config.concurrency}, 持续时间: ${config.duration}s`);

    const startTime = Date.now();
    const promises: Promise<void>[] = [];

    // 启动并发请求
    for (let i = 0; i < config.concurrency; i++) {
      promises.push(this.worker(config, startTime));
    }

    // 等待指定持续时间后停止
    await new Promise(resolve => setTimeout(resolve, config.duration * 1000));
    
    const endTime = Date.now();
    this.results.duration = endTime - startTime;

    // 等待所有请求完成
    await Promise.allSettled(promises);

    // 计算指标
    this.calculateMetrics();

    return this.results;
  }

  /**
   * 工作线程
   */
  private async worker(config: LoadTestConfig, startTime: number): Promise<void> {
    const endTime = startTime + config.duration * 1000;

    while (Date.now() < endTime) {
      const reqStart = Date.now();
      
      try {
        await this.makeRequest(config);
        const latency = Date.now() - reqStart;
        this.results.latencies.push(latency);
        this.results.successfulRequests++;
      } catch (error) {
        this.results.failedRequests++;
      }
      
      this.results.totalRequests++;
    }
  }

  /**
   * 发送HTTP请求
   */
  private makeRequest(config: LoadTestConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: config.target,
        port: config.port,
        path: config.path,
        method: config.method,
        timeout: 10000, // 10秒超时
      };

      const req = http.request(options, (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Status: ${res.statusCode}`));
        }
      });

      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Timeout')));
      req.end();
    });
  }

  /**
   * 计算统计指标
   */
  private calculateMetrics(): void {
    const latencies = this.results.latencies.sort((a, b) => a - b);
    
    if (latencies.length > 0) {
      // P50
      this.results.p50 = latencies[Math.floor(latencies.length * 0.5)];
      // P99
      this.results.p99 = latencies[Math.floor(latencies.length * 0.99)];
    }

    // 错误率
    this.results.errorRate = this.results.totalRequests > 0
      ? this.results.failedRequests / this.results.totalRequests
      : 0;
  }
}

/**
 * 运行测试套件
 */
async function runSmokeTest() {
  const runner = new LoadTestRunner();
  
  // 测试配置
  const tests = [
    {
      name: 'Yggdrasil Regenerate API',
      config: {
        target: 'localhost',
        port: 3000,
        path: '/api/v1/yggdrasil/regenerate',
        method: 'POST',
        concurrency: 50,
        duration: 30,
      },
    },
    {
      name: 'Yggdrasil Remix API',
      config: {
        target: 'localhost',
        port: 3000,
        path: '/api/v1/yggdrasil/remix',
        method: 'POST',
        concurrency: 50,
        duration: 30,
      },
    },
    {
      name: 'Yggdrasil Branches API',
      config: {
        target: 'localhost',
        port: 3000,
        path: '/api/v1/yggdrasil/branches?sessionId=test',
        method: 'GET',
        concurrency: 50,
        duration: 30,
      },
    },
  ];

  console.log('========================================');
  console.log('YGGDRASIL P2 - 50并发冒烟测试');
  console.log('========================================\n');

  for (const test of tests) {
    console.log(`\n测试: ${test.name}`);
    console.log('----------------------------------------');
    
    const result = await runner.run(test.config);
    
    console.log(`总请求数: ${result.totalRequests}`);
    console.log(`成功: ${result.successfulRequests}`);
    console.log(`失败: ${result.failedRequests}`);
    console.log(`错误率: ${(result.errorRate * 100).toFixed(2)}%`);
    console.log(`P50延迟: ${result.p50}ms`);
    console.log(`P99延迟: ${result.p99}ms`);
    
    // 自测验证
    const load001Pass = result.errorRate === 0;
    const load002Pass = result.p99 < 3000;
    
    console.log(`\n[LOAD-001] 50并发无错: ${load001Pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`[LOAD-002] P99<3s: ${load002Pass ? '✅ PASS' : '❌ FAIL'}`);
  }

  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
}

// 如果直接运行
if (require.main === module) {
  runSmokeTest().catch(console.error);
}

export { LoadTestRunner, runSmokeTest };
export type { LoadTestConfig, LoadTestResult };
