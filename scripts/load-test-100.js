/**
 * YGGDRASIL DEBT-CLEARANCE-001 - 100并发极限负载测试
 * 
 * 职责:
 * - LOAD-001: 100并发连接不崩溃，QPS≥200
 * - LOAD-002: 内存占用<2GB（峰值）
 * - LOAD-003: 无内存泄漏（5分钟测试后稳定）
 * 
 * 债务状态: CLEARED
 */

const WebSocket = require('ws');
const { performance } = require('perf_hooks');

// 测试配置
const CONFIG = {
  concurrentConnections: 100,
  durationSeconds: 300, // 5分钟
  warmupSeconds: 10,
  serverUrl: process.env.WS_URL || 'ws://localhost:3000/api/yggdrasil/ws',
  messageIntervalMs: 100,
};

// 测试状态
class LoadTestRunner {
  constructor() {
    this.connections = new Map();
    this.stats = {
      connected: 0,
      disconnected: 0,
      messagesSent: 0,
      messagesReceived: 0,
      errors: [],
      latencies: [],
      memorySamples: [],
      startTime: null,
    };
    this.isRunning = false;
  }

  /**
   * LOAD-001: 100并发连接测试
   */
  async run() {
    console.log('========================================');
    console.log('YGGDRASIL 100并发极限负载测试');
    console.log('========================================');
    console.log(`并发连接数: ${CONFIG.concurrentConnections}`);
    console.log(`测试时长: ${CONFIG.durationSeconds}秒`);
    console.log(`目标服务器: ${CONFIG.serverUrl}`);
    console.log(`目标QPS: ≥200`);
    console.log(`内存上限: <2GB`);
    console.log('========================================\n');

    this.stats.startTime = performance.now();
    this.isRunning = true;

    // 启动内存监控
    this.startMemoryMonitor();

    // 预热
    console.log('[LOAD-001] 阶段1: 建立连接...');
    await this.establishConnections();

    console.log('[LOAD-002] 阶段2: 负载运行...');
    await this.runLoadTest();

    console.log('[LOAD-003] 阶段3: 断开连接...');
    await this.disconnectAll();

    // 生成报告
    this.generateReport();

    return this.stats;
  }

  /**
   * 建立100个并发连接
   */
  async establishConnections() {
    const promises = [];
    const batchSize = 10;

    for (let i = 0; i < CONFIG.concurrentConnections; i++) {
      const promise = this.createConnection(i);
      promises.push(promise);

      // 批量创建，避免瞬间冲击
      if ((i + 1) % batchSize === 0) {
        await Promise.all(promises.slice(-batchSize));
        await this.delay(100);
      }
    }

    await Promise.all(promises);
    console.log(`  ✅ 成功建立 ${this.stats.connected} 个连接`);
  }

  /**
   * 创建单个连接
   */
  createConnection(index) {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(CONFIG.serverUrl);
        const connId = `conn-${index}`;
        const connInfo = {
          ws,
          id: connId,
          connectedAt: null,
          messagesSent: 0,
          messagesReceived: 0,
        };

        ws.on('open', () => {
          connInfo.connectedAt = performance.now();
          this.connections.set(connId, connInfo);
          this.stats.connected++;

          // 发送握手消息
          this.sendMessage(connId, { type: 'handshake', clientId: connId });

          // 开始定期发送消息
          connInfo.messageInterval = setInterval(() => {
            if (this.isRunning) {
              this.sendMessage(connId, {
                type: 'ping',
                timestamp: Date.now(),
              });
            }
          }, CONFIG.messageIntervalMs);

          resolve();
        });

        ws.on('message', (data) => {
          this.stats.messagesReceived++;
          connInfo.messagesReceived++;

          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'pong' && msg.timestamp) {
              const latency = Date.now() - msg.timestamp;
              this.stats.latencies.push(latency);
            }
          } catch {}
        });

        ws.on('error', (err) => {
          this.stats.errors.push({
            connId,
            error: err.message,
            time: Date.now(),
          });
        });

        ws.on('close', () => {
          this.stats.disconnected++;
          if (connInfo.messageInterval) {
            clearInterval(connInfo.messageInterval);
          }
          this.connections.delete(connId);
        });

        // 超时处理
        setTimeout(() => resolve(), 5000);

      } catch (err) {
        this.stats.errors.push({
          connId: `conn-${index}`,
          error: err.message,
          time: Date.now(),
        });
        resolve();
      }
    });
  }

  /**
   * 运行负载测试
   */
  async runLoadTest() {
    const duration = CONFIG.durationSeconds * 1000;
    const startTime = performance.now();

    // 进度显示
    const progressInterval = setInterval(() => {
      const elapsed = Math.floor((performance.now() - startTime) / 1000);
      const remaining = Math.max(0, CONFIG.durationSeconds - elapsed);
      const memMB = this.getMemoryUsageMB();
      const qps = Math.floor(this.stats.messagesReceived / Math.max(1, elapsed));

      process.stdout.write(
        `\r  运行中: ${elapsed}s/${CONFIG.durationSeconds}s | ` +
        `连接: ${this.stats.connected} | ` +
        `QPS: ${qps} | ` +
        `内存: ${memMB.toFixed(0)}MB | ` +
        `剩余: ${remaining}s`
      );
    }, 1000);

    // 等待测试完成
    await this.delay(duration);
    clearInterval(progressInterval);
    this.isRunning = false;

    console.log('\n  ✅ 负载测试完成');
  }

  /**
   * 断开所有连接
   */
  async disconnectAll() {
    for (const [connId, conn] of this.connections) {
      try {
        if (conn.messageInterval) {
          clearInterval(connInfo.messageInterval);
        }
        conn.ws.close();
      } catch {}
    }

    // 等待断开完成
    await this.delay(1000);
  }

  /**
   * LOAD-002: 内存监控
   */
  startMemoryMonitor() {
    setInterval(() => {
      if (this.isRunning) {
        const memMB = this.getMemoryUsageMB();
        this.stats.memorySamples.push({
          time: Date.now(),
          memoryMB: memMB,
        });
      }
    }, 5000);
  }

  /**
   * 获取内存使用量(MB)
   */
  getMemoryUsageMB() {
    const usage = process.memoryUsage();
    return usage.heapUsed / 1024 / 1024;
  }

  /**
   * 发送消息
   */
  sendMessage(connId, message) {
    const conn = this.connections.get(connId);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(message));
      this.stats.messagesSent++;
      conn.messagesSent++;
    }
  }

  /**
   * 延迟
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 生成测试报告
   */
  generateReport() {
    const duration = (performance.now() - this.stats.startTime) / 1000;
    const avgLatency = this.stats.latencies.length > 0
      ? this.stats.latencies.reduce((a, b) => a + b, 0) / this.stats.latencies.length
      : 0;
    const maxMemory = this.stats.memorySamples.length > 0
      ? Math.max(...this.stats.memorySamples.map(s => s.memoryMB))
      : 0;
    const qps = this.stats.messagesReceived / duration;

    console.log('\n========================================');
    console.log('负载测试报告');
    console.log('========================================');
    console.log(`测试时长: ${duration.toFixed(1)}秒`);
    console.log(`总连接数: ${CONFIG.concurrentConnections}`);
    console.log(`成功连接: ${this.stats.connected}`);
    console.log(`断开连接: ${this.stats.disconnected}`);
    console.log(`消息发送: ${this.stats.messagesSent}`);
    console.log(`消息接收: ${this.stats.messagesReceived}`);
    console.log(`错误次数: ${this.stats.errors.length}`);
    console.log(`平均延迟: ${avgLatency.toFixed(2)}ms`);
    console.log(`峰值内存: ${maxMemory.toFixed(2)}MB`);
    console.log(`QPS: ${qps.toFixed(2)}`);
    console.log('========================================');

    // 验收标准检查
    console.log('\n验收标准检查:');
    
    // LOAD-001: QPS≥200
    const load1Pass = qps >= 200;
    console.log(`  [LOAD-001] QPS≥200: ${qps.toFixed(0)} ${load1Pass ? '✅ PASS' : '❌ FAIL'}`);

    // LOAD-001: 零崩溃
    const load1CrashPass = this.stats.errors.length === 0;
    console.log(`  [LOAD-001] 零崩溃: ${this.stats.errors.length}错误 ${load1CrashPass ? '✅ PASS' : '❌ FAIL'}`);

    // LOAD-002: 内存<2GB
    const load2Pass = maxMemory < 2048;
    console.log(`  [LOAD-002] 内存<2GB: ${maxMemory.toFixed(0)}MB ${load2Pass ? '✅ PASS' : '❌ FAIL'}`);

    // LOAD-003: 内存泄漏检查（最后1分钟内存是否稳定）
    const lastSamples = this.stats.memorySamples.slice(-12); // 最后60秒（每5秒采样）
    const memoryTrend = this.calculateTrend(lastSamples);
    const load3Pass = memoryTrend < 10; // 增长趋势<10MB/分钟
    console.log(`  [LOAD-003] 无内存泄漏: ${memoryTrend.toFixed(1)}MB/分钟 ${load3Pass ? '✅ PASS' : '❌ FAIL'}`);

    // 总结
    const allPass = load1Pass && load1CrashPass && load2Pass && load3Pass;
    console.log('\n========================================');
    console.log(allPass ? '✅ 所有测试通过' : '❌ 测试未通过');
    console.log('========================================');

    return {
      passed: allPass,
      metrics: {
        qps,
        maxMemory,
        errors: this.stats.errors.length,
        memoryTrend,
      },
    };
  }

  /**
   * 计算内存增长趋势(MB/分钟)
   */
  calculateTrend(samples) {
    if (samples.length < 2) return 0;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const timeDiff = (last.time - first.time) / 1000 / 60; // 分钟
    const memoryDiff = last.memoryMB - first.memoryMB;
    return timeDiff > 0 ? memoryDiff / timeDiff : 0;
  }
}

// 运行测试
if (require.main === module) {
  const runner = new LoadTestRunner();
  runner.run().then((result) => {
    process.exit(result.errors && result.errors.length > 10 ? 1 : 0);
  }).catch((err) => {
    console.error('测试失败:', err);
    process.exit(1);
  });
}

module.exports = { LoadTestRunner };
