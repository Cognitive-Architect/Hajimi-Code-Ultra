/**
 * OpenRouter 遥测与可观测性
 * HAJIMI-OR-IPDIRECT
 * 
 * 统一日志格式、埋点上报、Agent调用链路追踪
 * 
 * @module lib/observability/or-telemetry
 * @author 客服小祥 (Orchestrator) - B-06/09
 */

import { EventEmitter } from 'events';

// ============================================================================
// 类型定义
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface TelemetryEvent {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  timestamp: number;
  level: LogLevel;
  component: string;
  message: string;
  metadata?: Record<string, unknown>;
  context?: {
    model?: string;
    ip?: string;
    latency?: number;
    statusCode?: number;
    error?: string;
  };
}

export interface MetricsSnapshot {
  timestamp: number;
  callsTotal: number;
  callsSuccess: number;
  callsFailed: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  errorRate: number;
  activeConnections: number;
  circuitBreakerState: string;
}

export interface TelemetryOptions {
  enabled: boolean;
  verbose: boolean;
  sampleRate: number;
  logPrefix: string;
  emitMetrics: boolean;
  metricsIntervalMs: number;
  maxQueueSize: number;
}

export interface AliceStatusSync {
  aliceMood: 'idle' | 'working' | 'alert' | 'error';
  trajectoryPattern?: string;
  activeAgent?: string;
}

// ============================================================================
// 遥测收集器
// ============================================================================

export class ORTelemetry extends EventEmitter {
  private options: Required<TelemetryOptions>;
  private eventQueue: TelemetryEvent[] = [];
  private metricsBuffer: number[] = []; // 延迟记录
  private metricsTimer?: NodeJS.Timeout;
  private traceContext: Map<string, { startTime: number; events: TelemetryEvent[] }> = new Map();

  constructor(options?: Partial<TelemetryOptions>) {
    super();
    this.options = {
      enabled: true,
      verbose: false,
      sampleRate: 1.0,
      logPrefix: '[OR-DIRECT]',
      emitMetrics: true,
      metricsIntervalMs: 60000,
      maxQueueSize: 1000,
      ...options,
    };

    if (this.options.emitMetrics) {
      this.startMetricsCollection();
    }
  }

  // ========================================================================
  // 日志记录
  // ========================================================================

  /**
   * 记录调试日志
   */
  debug(message: string, metadata?: Record<string, unknown>, context?: TelemetryEvent['context']): void {
    if (!this.options.verbose) return;
    this.log('debug', message, metadata, context);
  }

  /**
   * 记录信息日志
   */
  info(message: string, metadata?: Record<string, unknown>, context?: TelemetryEvent['context']): void {
    this.log('info', message, metadata, context);
  }

  /**
   * 记录警告日志
   */
  warn(message: string, metadata?: Record<string, unknown>, context?: TelemetryEvent['context']): void {
    this.log('warn', message, metadata, context);
  }

  /**
   * 记录错误日志
   */
  error(message: string, metadata?: Record<string, unknown>, context?: TelemetryEvent['context']): void {
    this.log('error', message, metadata, context);
  }

  /**
   * 记录致命错误
   */
  fatal(message: string, metadata?: Record<string, unknown>, context?: TelemetryEvent['context']): void {
    this.log('fatal', message, metadata, context);
  }

  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
    context?: TelemetryEvent['context']
  ): void {
    if (!this.options.enabled) return;
    if (Math.random() > this.options.sampleRate) return;

    const event: TelemetryEvent = {
      traceId: this.generateTraceId(),
      spanId: this.generateSpanId(),
      timestamp: Date.now(),
      level,
      component: 'OR-DIRECT',
      message,
      metadata,
      context,
    };

    // 添加到队列
    this.eventQueue.push(event);
    if (this.eventQueue.length > this.options.maxQueueSize) {
      this.eventQueue.shift();
    }

    // 控制台输出（统一格式）
    this.outputToConsole(event);

    // 发出事件
    this.emit('log', event);

    // 如果延迟 < 100ms，记录性能指标
    if (context?.latency && context.latency < 100) {
      this.metricsBuffer.push(context.latency);
      if (this.metricsBuffer.length > 1000) {
        this.metricsBuffer.shift();
      }
    }
  }

  private outputToConsole(event: TelemetryEvent): void {
    const timestamp = new Date(event.timestamp).toISOString();
    const prefix = `${this.options.logPrefix} [${event.level.toUpperCase()}] [${timestamp}]`;
    
    // 根据级别选择颜色
    let colorCode = '';
    let resetCode = '';
    
    if (typeof process !== 'undefined' && process.stdout?.isTTY) {
      const colors: Record<LogLevel, string> = {
        debug: '\x1b[36m',    // Cyan
        info: '\x1b[32m',     // Green
        warn: '\x1b[33m',     // Yellow
        error: '\x1b[31m',    // Red
        fatal: '\x1b[35m',    // Magenta
      };
      colorCode = colors[event.level];
      resetCode = '\x1b[0m';
    }

    // 构建上下文字符串
    let contextStr = '';
    if (event.context) {
      const ctx = event.context;
      const parts: string[] = [];
      if (ctx.model) parts.push(`model=${ctx.model}`);
      if (ctx.ip) parts.push(`ip=${ctx.ip}`);
      if (ctx.latency) parts.push(`${ctx.latency}ms`);
      if (ctx.statusCode) parts.push(`status=${ctx.statusCode}`);
      if (parts.length > 0) {
        contextStr = ` (${parts.join(', ')})`;
      }
    }

    console.log(`${colorCode}${prefix}${resetCode} ${event.message}${contextStr}`);

    // 如果有元数据且是详细模式，输出元数据
    if (this.options.verbose && event.metadata && Object.keys(event.metadata).length > 0) {
      console.log(`  ${colorCode}metadata:${resetCode}`, JSON.stringify(event.metadata, null, 2));
    }
  }

  // ========================================================================
  // 链路追踪
  // ========================================================================

  /**
   * 开始一个新的追踪
   */
  startTrace(traceId?: string): string {
    const id = traceId || this.generateTraceId();
    this.traceContext.set(id, { startTime: Date.now(), events: [] });
    return id;
  }

  /**
   * 结束追踪
   */
  endTrace(traceId: string): { duration: number; events: TelemetryEvent[] } | undefined {
    const context = this.traceContext.get(traceId);
    if (!context) return undefined;

    const duration = Date.now() - context.startTime;
    this.traceContext.delete(traceId);

    this.emit('traceEnd', { traceId, duration, events: context.events });

    return { duration, events: context.events };
  }

  /**
   * 创建子Span
   */
  createSpan(parentTraceId: string, operation: string): { spanId: string; end: () => void } {
    const spanId = this.generateSpanId();
    const startTime = Date.now();

    this.info(`Span started: ${operation}`, { parentTraceId, spanId });

    return {
      spanId,
      end: () => {
        const duration = Date.now() - startTime;
        this.info(`Span ended: ${operation}`, { parentTraceId, spanId, durationMs: duration });
      },
    };
  }

  // ========================================================================
  // 指标收集
  // ========================================================================

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      this.emitMetrics();
    }, this.options.metricsIntervalMs);
  }

  private emitMetrics(): void {
    if (this.metricsBuffer.length === 0) return;

    const sorted = [...this.metricsBuffer].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    const metrics: MetricsSnapshot = {
      timestamp: Date.now(),
      callsTotal: this.metricsBuffer.length,
      callsSuccess: 0, // 需要外部传入
      callsFailed: 0,  // 需要外部传入
      averageLatency: sum / sorted.length,
      p95Latency: sorted[Math.floor(sorted.length * 0.95)] || 0,
      p99Latency: sorted[Math.floor(sorted.length * 0.99)] || 0,
      errorRate: 0,    // 需要外部传入
      activeConnections: 0, // 需要外部传入
      circuitBreakerState: 'unknown',
    };

    this.emit('metrics', metrics);
  }

  /**
   * 记录调用指标
   */
  recordCallMetrics(metrics: {
    success: boolean;
    latency: number;
    model: string;
    ip: string;
  }): void {
    this.metricsBuffer.push(metrics.latency);
    if (this.metricsBuffer.length > 1000) {
      this.metricsBuffer.shift();
    }

    if (metrics.success) {
      this.info('Call succeeded', { model: metrics.model, ip: metrics.ip }, {
        model: metrics.model,
        ip: metrics.ip,
        latency: metrics.latency,
      });
    } else {
      this.error('Call failed', { model: metrics.model, ip: metrics.ip }, {
        model: metrics.model,
        ip: metrics.ip,
        latency: metrics.latency,
      });
    }
  }

  // ========================================================================
  // Alice 状态同步
  // ========================================================================

  /**
   * 同步状态到 Alice 悬浮球
   */
  syncToAlice(status: AliceStatusSync): void {
    // 转换状态为 Alice 可理解的格式
    const aliceState = {
      component: 'openrouter',
      mood: status.aliceMood,
      pattern: status.trajectoryPattern,
      agent: status.activeAgent,
      timestamp: Date.now(),
    };

    this.emit('aliceSync', aliceState);

    // 根据状态输出不同日志
    switch (status.aliceMood) {
      case 'idle':
        this.debug('Alice state: idle', aliceState);
        break;
      case 'working':
        this.info('Alice state: working', aliceState);
        break;
      case 'alert':
        this.warn('Alice state: alert', aliceState);
        break;
      case 'error':
        this.error('Alice state: error', aliceState);
        break;
    }
  }

  /**
   * 报告 Circuit Breaker 状态变化
   */
  reportCircuitBreaker(from: string, to: string): void {
    const moods: Record<string, AliceStatusSync['aliceMood']> = {
      'CLOSED': 'idle',
      'HALF_OPEN': 'alert',
      'OPEN': 'error',
    };

    this.syncToAlice({
      aliceMood: moods[to] || 'alert',
      activeAgent: '压力怪',
    });

    if (to === 'OPEN') {
      this.fatal('Circuit breaker opened!', { from, to });
    } else if (to === 'CLOSED') {
      this.info('Circuit breaker closed - service recovered', { from, to });
    }
  }

  // ========================================================================
  // 错误分类统计
  // ========================================================================

  private errorStats: Map<string, number> = new Map();

  /**
   * 分类记录错误
   */
  categorizeError(error: Error, category: string): void {
    const count = this.errorStats.get(category) || 0;
    this.errorStats.set(category, count + 1);

    this.error(`[${category}] ${error.message}`, {
      category,
      stack: error.stack,
      count: count + 1,
    });
  }

  /**
   * 获取错误统计
   */
  getErrorStats(): Record<string, number> {
    return Object.fromEntries(this.errorStats);
  }

  // ========================================================================
  // 工具方法
  // ========================================================================

  private generateTraceId(): string {
    return `or-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }

  private generateSpanId(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  /**
   * 获取所有事件
   */
  getEvents(): TelemetryEvent[] {
    return [...this.eventQueue];
  }

  /**
   * 清空事件队列
   */
  clearEvents(): void {
    this.eventQueue = [];
  }

  // ========================================================================
  // 清理
  // ========================================================================

  dispose(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }
    this.removeAllListeners();
    this.eventQueue = [];
    this.metricsBuffer = [];
    this.traceContext.clear();
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

export function createDefaultTelemetry(): ORTelemetry {
  return new ORTelemetry({
    enabled: true,
    verbose: process.env.NODE_ENV === 'development',
    sampleRate: 1.0,
  });
}

// 全局实例
export const globalTelemetry = createDefaultTelemetry();

export default ORTelemetry;
