/**
 * HAJIMI VIRTUALIZED - ResilienceMonitor韧性监控
 * 
 * 工单 5/6: ResilienceMonitor韧性监控（Wave3回填）
 * 
 * 参考规范:
 * - ID-85（长期稳定性章节）
 * - Wave3报告（7天稳定性数据）
 * 
 * 债务声明: DEBT-VIRT-003
 * Wave3的7天数据为模拟/缩短周期测试（真实7天需长期运行验证）
 * 
 * @module monitor
 * @version 1.0.0
 */

/**
 * 监控指标类型
 */
export type MetricType = 'uptime' | 'errorRate' | 'checkpointLatency' | 'agentCount' | 'memoryUsage';

/**
 * 降级建议类型
 */
export type DegradationRecommendation = 
  | 'MAINTAIN'           // 维持当前模式
  | 'INCREASE_CHECKPOINT' // 增加Checkpoint频率
  | 'SWITCH_TO_PHYSICAL'  // 切换到物理Agent模式
  | 'REDUCE_LOAD';        // 降低负载

/**
 * 健康状态
 */
export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';

/**
 * 指标数据点
 */
export interface MetricDataPoint {
  /** 时间戳 */
  timestamp: number;
  /** 指标值 */
  value: number;
  /** 标签 */
  labels?: Record<string, string>;
}

/**
 * 滑动窗口统计
 */
export interface SlidingWindowStats {
  /** 窗口大小（毫秒） */
  windowSize: number;
  /** 数据点数量 */
  count: number;
  /** 平均值 */
  mean: number;
  /** 中位数 */
  median: number;
  /** P50 */
  p50: number;
  /** P95 */
  p95: number;
  /** P99 */
  p99: number;
  /** 最小值 */
  min: number;
  /** 最大值 */
  max: number;
  /** 标准差 */
  stdDev: number;
}

/**
 * 健康报告
 */
export interface HealthReport {
  /** 状态 */
  status: HealthStatus;
  /** 综合得分 (0-100) */
  score: number;
  /** 最后更新时间 */
  lastUpdated: number;
  /** 各项指标 */
  metrics: {
    uptime: number;
    errorRate: number;
    checkpointLatencyP99: number;
    agentCount: number;
  };
  /** 降级建议 */
  recommendation: DegradationRecommendation;
  /** 问题列表 */
  issues: string[];
}

/**
 * Prometheus格式指标
 */
export interface PrometheusMetrics {
  /** 指标文本 */
  text: string;
  /** 内容类型 */
  contentType: string;
  /** 生成时间 */
  generatedAt: number;
}

/**
 * 面板集成数据
 */
export interface PanelIntegrationData {
  /** 虚拟化隔离度 (0-100) */
  isolationScore: number;
  /** 活跃Agent数量 */
  activeAgents: number;
  /** 污染率 */
  contaminationRate: number;
  /** 7天平均可用性 */
  sevenDayUptime: number;
  /** 最近错误数 */
  recentErrors: number;
  /** 状态指示 */
  statusIndicator: '🟢' | '🟡' | '🔴';
}

/**
 * 韧性指标数据
 */
export interface ResilienceMetrics {
  /** 窗口大小（毫秒） */
  windowSize: number;
  /** 数据点数量 */
  count: number;
  /** 平均值 */
  mean: number;
  /** P95 */
  p95: number;
  /** P99 */
  p99: number;
}

/**
 * ResilienceMonitor接口
 */
export interface IResilienceMonitor {
  /** 记录可用性指标 */
  recordUptime(isUp: boolean): void;
  /** 记录错误 */
  recordError(errorType?: string): void;
  /** 记录成功请求 */
  recordSuccess(): void;
  /** 记录Checkpoint延迟 */
  recordCheckpointLatency(latencyMs: number): void;
  /** 记录Agent数量 */
  recordAgentCount(count: number): void;
  /** 记录内存使用 */
  recordMemoryUsage(bytes: number): void;
  /** 获取7天滑动窗口统计 */
  getSevenDayStats(): {
    uptime: SlidingWindowStats | null;
    errorRate: SlidingWindowStats | null;
    checkpointLatency: SlidingWindowStats | null;
    agentCount: SlidingWindowStats | null;
  };
  /** 获取降级建议 */
  getDegradationRecommendation(): DegradationRecommendation;
  /** 获取健康报告 */
  getHealthReport(): HealthReport;
  /** 生成Prometheus格式指标 */
  getPrometheusMetrics(): PrometheusMetrics;
  /** 获取面板集成数据 */
  getPanelIntegrationData(contaminationRate?: number): PanelIntegrationData;
  /** 获取运行时间 */
  getUptime(): number;
  /** 获取错误率 */
  getErrorRate(): number;
  /** 重置监控数据 */
  reset(): void;
  /** 模拟7天数据（用于测试） */
  simulateSevenDayData(): void;
}

/**
 * 监控配置
 */
export interface MonitorConfig {
  /** 滑动窗口大小（毫秒） - 默认7天 */
  slidingWindowMs: number;
  /** 错误率阈值 (默认: 0.05 = 5%) */
  errorRateThreshold: number;
  /** Checkpoint延迟P99阈值 (默认: 200ms) */
  checkpointLatencyThreshold: number;
  /** 可用性目标 (默认: 0.99 = 99%) */
  uptimeTarget: number;
  /** 自动降级检测启用 */
  enableAutoDegradation: boolean;
  /** Prometheus端点启用 */
  enablePrometheus: boolean;
  /** 面板集成启用 */
  enablePanelIntegration: boolean;
  /** 数据保留数量 */
  maxDataPoints: number;
}

/**
 * 默认监控配置
 * Wave3: 7天滑动窗口
 */
export const DEFAULT_MONITOR_CONFIG: MonitorConfig = {
  slidingWindowMs: 7 * 24 * 60 * 60 * 1000, // 7天
  errorRateThreshold: 0.05,  // 5%
  checkpointLatencyThreshold: 200,  // 200ms
  uptimeTarget: 0.99,  // 99%
  enableAutoDegradation: true,
  enablePrometheus: true,
  enablePanelIntegration: true,
  maxDataPoints: 10000,
};

/**
 * 滑动窗口数据存储
 */
class SlidingWindow<T> {
  private data: Array<{ timestamp: number; value: T }> = [];
  private windowSize: number;

  constructor(windowSize: number) {
    this.windowSize = windowSize;
  }

  /**
   * 添加数据点
   */
  add(value: T, timestamp: number = Date.now()): void {
    // 清理过期数据
    const cutoff = timestamp - this.windowSize;
    this.data = this.data.filter(d => d.timestamp >= cutoff);
    
    // 添加新数据
    this.data.push({ timestamp, value });
  }

  /**
   * 获取统计数据
   */
  getStats(): SlidingWindowStats | null {
    if (this.data.length === 0) return null;

    const values = this.data.map(d => d.value as unknown as number).sort((a, b) => a - b);
    const count = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / count;
    const median = count % 2 === 0 
      ? (values[count / 2 - 1] + values[count / 2]) / 2 
      : values[Math.floor(count / 2)];
    
    const p50Index = Math.floor(count * 0.5);
    const p95Index = Math.floor(count * 0.95);
    const p99Index = Math.floor(count * 0.99);
    
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / count;
    const stdDev = Math.sqrt(variance);

    return {
      windowSize: this.windowSize,
      count,
      mean,
      median,
      p50: values[p50Index] || values[values.length - 1],
      p95: values[p95Index] || values[values.length - 1],
      p99: values[p99Index] || values[values.length - 1],
      min: values[0],
      max: values[values.length - 1],
      stdDev,
    };
  }

  /**
   * 获取原始数据
   */
  getData(): Array<{ timestamp: number; value: T }> {
    return [...this.data];
  }

  /**
   * 清空数据
   */
  clear(): void {
    this.data = [];
  }

  /**
   * 获取数据点数量
   */
  size(): number {
    return this.data.length;
  }
}

/**
 * ResilienceMonitor韧性监控
 * 
 * 功能:
 * - 7天滑动窗口统计（uptime/errorRate/checkpointLatencyP99）
 * - 自动降级建议：errorRate>5%时建议'SWITCH_TO_PHYSICAL'
 * - 暴露/metrics端点（Prometheus格式，可选）
 * - 与ID-77压力怪审计面板集成（显示虚拟化隔离度）
 */
export class ResilienceMonitor implements IResilienceMonitor {
  private config: MonitorConfig;
  private uptimeWindow: SlidingWindow<number>;
  private errorRateWindow: SlidingWindow<number>;
  private checkpointLatencyWindow: SlidingWindow<number>;
  private agentCountWindow: SlidingWindow<number>;
  private memoryUsageWindow: SlidingWindow<number>;
  private errorCount: number = 0;
  private totalRequests: number = 0;
  private startTime: number;

  /**
   * 创建监控实例
   */
  constructor(config: Partial<MonitorConfig> = {}) {
    this.config = { ...DEFAULT_MONITOR_CONFIG, ...config };
    this.uptimeWindow = new SlidingWindow<number>(this.config.slidingWindowMs);
    this.errorRateWindow = new SlidingWindow<number>(this.config.slidingWindowMs);
    this.checkpointLatencyWindow = new SlidingWindow<number>(this.config.slidingWindowMs);
    this.agentCountWindow = new SlidingWindow<number>(this.config.slidingWindowMs);
    this.memoryUsageWindow = new SlidingWindow<number>(this.config.slidingWindowMs);
    this.startTime = Date.now();
  }

  /**
   * 记录可用性指标
   */
  recordUptime(isUp: boolean): void {
    const value = isUp ? 1 : 0;
    this.uptimeWindow.add(value);
  }

  /**
   * 记录错误
   */
  recordError(errorType?: string): void {
    this.errorCount++;
    this.errorRateWindow.add(1);
    
    // 记录错误类型统计
    if (errorType) {
      // 可以扩展为按类型统计
    }
  }

  /**
   * 记录成功请求
   */
  recordSuccess(): void {
    this.totalRequests++;
    this.errorRateWindow.add(0);
  }

  /**
   * 记录Checkpoint延迟
   */
  recordCheckpointLatency(latencyMs: number): void {
    this.checkpointLatencyWindow.add(latencyMs);
  }

  /**
   * 记录Agent数量
   */
  recordAgentCount(count: number): void {
    this.agentCountWindow.add(count);
  }

  /**
   * 记录内存使用
   */
  recordMemoryUsage(bytes: number): void {
    this.memoryUsageWindow.add(bytes);
  }

  /**
   * 获取7天滑动窗口统计
   * 
   * Wave3: 7天稳定性数据
   * 债务声明: DEBT-VIRT-003 - 模拟/缩短周期测试
   * 
   * @returns 统计数据
   */
  getSevenDayStats(): {
    uptime: SlidingWindowStats | null;
    errorRate: SlidingWindowStats | null;
    checkpointLatency: SlidingWindowStats | null;
    agentCount: SlidingWindowStats | null;
  } {
    return {
      uptime: this.uptimeWindow.getStats(),
      errorRate: this.errorRateWindow.getStats(),
      checkpointLatency: this.checkpointLatencyWindow.getStats(),
      agentCount: this.agentCountWindow.getStats(),
    };
  }

  /**
   * 获取降级建议
   * 
   * 规则:
   * - errorRate > 5%: SWITCH_TO_PHYSICAL
   * - checkpointLatencyP99 > 200ms: INCREASE_CHECKPOINT
   * - uptime < 99%: REDUCE_LOAD
   * - 其他: MAINTAIN
   * 
   * @returns 降级建议
   */
  getDegradationRecommendation(): DegradationRecommendation {
    const stats = this.getSevenDayStats();
    
    // 检查错误率
    if (stats.errorRate && stats.errorRate.mean > this.config.errorRateThreshold) {
      return 'SWITCH_TO_PHYSICAL';
    }
    
    // 检查Checkpoint延迟
    if (stats.checkpointLatency && stats.checkpointLatency.p99 > this.config.checkpointLatencyThreshold) {
      return 'INCREASE_CHECKPOINT';
    }
    
    // 检查可用性
    if (stats.uptime && stats.uptime.mean < this.config.uptimeTarget) {
      return 'REDUCE_LOAD';
    }
    
    return 'MAINTAIN';
  }

  /**
   * 获取健康报告
   */
  getHealthReport(): HealthReport {
    const stats = this.getSevenDayStats();
    const recommendation = this.getDegradationRecommendation();
    const issues: string[] = [];
    
    // 计算综合得分
    let score = 100;
    
    // 错误率扣分
    if (stats.errorRate) {
      const errorPenalty = Math.min(50, stats.errorRate.mean * 1000);
      score -= errorPenalty;
      if (stats.errorRate.mean > this.config.errorRateThreshold) {
        issues.push(`Error rate ${(stats.errorRate.mean * 100).toFixed(2)}% exceeds threshold ${(this.config.errorRateThreshold * 100).toFixed(2)}%`);
      }
    }
    
    // Checkpoint延迟扣分
    if (stats.checkpointLatency) {
      const latencyPenalty = Math.min(30, stats.checkpointLatency.p99 / 10);
      score -= latencyPenalty;
      if (stats.checkpointLatency.p99 > this.config.checkpointLatencyThreshold) {
        issues.push(`Checkpoint P99 latency ${stats.checkpointLatency.p99.toFixed(2)}ms exceeds threshold ${this.config.checkpointLatencyThreshold}ms`);
      }
    }
    
    // 可用性扣分
    if (stats.uptime) {
      const uptimePenalty = Math.max(0, (this.config.uptimeTarget - stats.uptime.mean) * 1000);
      score -= uptimePenalty;
      if (stats.uptime.mean < this.config.uptimeTarget) {
        issues.push(`Uptime ${(stats.uptime.mean * 100).toFixed(2)}% below target ${(this.config.uptimeTarget * 100).toFixed(2)}%`);
      }
    }
    
    score = Math.max(0, Math.min(100, score));
    
    // 确定状态
    let status: HealthStatus;
    if (score >= 90) status = 'HEALTHY';
    else if (score >= 70) status = 'DEGRADED';
    else status = 'CRITICAL';
    
    return {
      status,
      score,
      lastUpdated: Date.now(),
      metrics: {
        uptime: stats.uptime?.mean ?? 0,
        errorRate: stats.errorRate?.mean ?? 0,
        checkpointLatencyP99: stats.checkpointLatency?.p99 ?? 0,
        agentCount: stats.agentCount?.mean ?? 0,
      },
      recommendation,
      issues,
    };
  }

  /**
   * 生成Prometheus格式指标
   * 
   * 债务声明: DEBT-VIRT-002
   * Prometheus指标端点可选（MVP可不实现，留接口）
   * 
   * @returns Prometheus格式指标
   */
  getPrometheusMetrics(): PrometheusMetrics {
    if (!this.config.enablePrometheus) {
      return {
        text: '# Prometheus metrics disabled',
        contentType: 'text/plain',
        generatedAt: Date.now(),
      };
    }

    const stats = this.getSevenDayStats();
    const health = this.getHealthReport();
    
    const lines: string[] = [
      '# HELP hajimi_uptime Virtualization uptime percentage',
      '# TYPE hajimi_uptime gauge',
      `hajimi_uptime ${health.metrics.uptime}`,
      '',
      '# HELP hajimi_error_rate Error rate percentage',
      '# TYPE hajimi_error_rate gauge',
      `hajimi_error_rate ${health.metrics.errorRate}`,
      '',
      '# HELP hajimi_checkpoint_latency_p99 Checkpoint latency P99 (ms)',
      '# TYPE hajimi_checkpoint_latency_p99 gauge',
      `hajimi_checkpoint_latency_p99 ${health.metrics.checkpointLatencyP99}`,
      '',
      '# HELP hajimi_agent_count Current agent count',
      '# TYPE hajimi_agent_count gauge',
      `hajimi_agent_count ${health.metrics.agentCount}`,
      '',
      '# HELP hajimi_health_score Health score (0-100)',
      '# TYPE hajimi_health_score gauge',
      `hajimi_health_score ${health.score}`,
    ];

    return {
      text: lines.join('\n'),
      contentType: 'text/plain; version=0.0.4',
      generatedAt: Date.now(),
    };
  }

  /**
   * 获取面板集成数据
   * 
   * ID-77压力怪审计面板集成
   * 显示虚拟化隔离度
   * 
   * @param contaminationRate - 污染率
   * @returns 面板数据
   */
  getPanelIntegrationData(contaminationRate: number = 0): PanelIntegrationData {
    const stats = this.getSevenDayStats();
    const health = this.getHealthReport();
    
    // 计算隔离度得分 (0-100)
    // 基于: 污染率、可用性、错误率
    const isolationScore = Math.max(0, Math.min(100, 
      100 - (contaminationRate * 1000) - (health.metrics.errorRate * 500)
    ));
    
    // 确定状态指示
    let statusIndicator: '🟢' | '🟡' | '🔴';
    if (health.status === 'HEALTHY') statusIndicator = '🟢';
    else if (health.status === 'DEGRADED') statusIndicator = '🟡';
    else statusIndicator = '🔴';
    
    return {
      isolationScore,
      activeAgents: Math.round(health.metrics.agentCount),
      contaminationRate,
      sevenDayUptime: health.metrics.uptime,
      recentErrors: this.errorCount,
      statusIndicator,
    };
  }

  /**
   * 获取运行时间
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * 获取错误率
   */
  getErrorRate(): number {
    if (this.totalRequests === 0) return 0;
    return this.errorCount / (this.errorCount + this.totalRequests);
  }

  /**
   * 重置监控数据
   */
  reset(): void {
    this.uptimeWindow.clear();
    this.errorRateWindow.clear();
    this.checkpointLatencyWindow.clear();
    this.agentCountWindow.clear();
    this.memoryUsageWindow.clear();
    this.errorCount = 0;
    this.totalRequests = 0;
    this.startTime = Date.now();
  }

  /**
   * 模拟7天数据（用于测试）
   * 
   * 债务声明: DEBT-VIRT-003
   * Wave3的7天数据为模拟/缩短周期测试
   */
  simulateSevenDayData(): void {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    
    // 模拟7天的数据点（每小时一个）
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const timestamp = now - (6 - day) * dayMs - (23 - hour) * 60 * 60 * 1000;
        
        // 模拟可用性 (99%以上)
        this.uptimeWindow.add(Math.random() > 0.01 ? 1 : 0, timestamp);
        
        // 模拟错误率 (低于5%)
        this.errorRateWindow.add(Math.random() > 0.95 ? 1 : 0, timestamp);
        
        // 模拟Checkpoint延迟 (100-200ms)
        this.checkpointLatencyWindow.add(100 + Math.random() * 100, timestamp);
        
        // 模拟Agent数量 (5-15)
        this.agentCountWindow.add(5 + Math.floor(Math.random() * 10), timestamp);
      }
    }
  }
}

// 导出默认实例
export const defaultMonitor = new ResilienceMonitor();
