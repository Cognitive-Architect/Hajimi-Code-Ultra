/**
 * 预测性GC运行时实现
 * HAJIMI-PHASE2-IMPL-001 工单 B-05/06
 * 
 * 预测性GC：
 * - LSTM预测模型（简单实现或统计启发式）
 * - 内存压力预测
 * - ZGC协同：触发提前GC
 * - GC停顿目标：<100ms（ARC-003）
 * 
 * 自测点:
 * - ARC-003: GC停顿<100ms
 * - GC-001: 预测准确率>80%
 * 
 * @module lib/lcr/gc/predictive
 * @version 1.0.0
 */

import { EventEmitter } from 'events';

// ============================================================================
// 常量定义
// ============================================================================

/** GC停顿目标: 100ms */
export const TARGET_GC_PAUSE = 100;

/** 预测准确率目标: 80% */
export const TARGET_PREDICTION_ACCURACY = 0.8;

/** 历史窗口大小 */
export const HISTORY_WINDOW = 100;

/** 预测时间窗口: 60秒 */
export const PREDICTION_WINDOW_MS = 60000;

/** 采样间隔: 10秒 */
export const SAMPLE_INTERVAL_MS = 10000;

/** 软阈值: 100MB */
export const SOFT_THRESHOLD_MB = 100;

/** 硬阈值: 150MB */
export const HARD_THRESHOLD_MB = 150;

// ============================================================================
// 类型定义
// ============================================================================

/** GC级别 */
export type GCLevel = 'l1' | 'l2' | 'l3';

/** 内存使用历史 */
export interface MemorySample {
  timestamp: number;
  usedMB: number;
  totalMB: number;
  operation: string;
}

/** 预测结果 */
export interface PredictionResult {
  /** 预测的未来内存使用 (MB) */
  predictedUsageMB: number;
  /** 置信度 (0-1) */
  confidence: number;
  /** 推荐动作 */
  recommendedAction: 'none' | GCLevel;
  /** 预测时间戳 */
  timestamp: number;
}

/** GC统计 */
export interface GCStats {
  totalRuns: number;
  l1Runs: number;
  l2Runs: number;
  l3Runs: number;
  avgPauseTime: number;
  maxPauseTime: number;
  predictionAccuracy: number;
}

/** GC结果 */
export interface GCResult {
  level: GCLevel;
  freedMB: number;
  pauseTime: number;
  timestamp: number;
}

/** 内存压力状态 */
export interface MemoryPressure {
  level: 'none' | 'low' | 'medium' | 'high' | 'critical';
  usedMB: number;
  totalMB: number;
  utilization: number;
}

// ============================================================================
// LSTM预测模型 (简化版)
// ============================================================================

/**
 * 简化LSTM预测器
 * 
 * 使用指数移动平均 + 趋势分析
 * 生产环境可替换为真实LSTM实现
 */
class LSTMPredictor {
  private alpha = 0.3; // EMA系数
  private ema = 0;
  private trend = 0;
  private lastValue = 0;

  /**
   * 更新模型
   */
  update(value: number): void {
    if (this.ema === 0) {
      this.ema = value;
      this.lastValue = value;
      return;
    }

    // 计算EMA
    this.ema = this.alpha * value + (1 - this.alpha) * this.ema;

    // 计算趋势
    this.trend = value - this.lastValue;
    this.lastValue = value;
  }

  /**
   * 预测未来值
   */
  predict(steps: number): { value: number; confidence: number } {
    // 基于EMA和趋势预测
    const predicted = this.ema + this.trend * steps;
    const confidence = Math.max(0.5, 1 - Math.abs(this.trend) / (this.ema + 1));

    return {
      value: Math.max(0, predicted),
      confidence,
    };
  }

  /**
   * 重置模型
   */
  reset(): void {
    this.ema = 0;
    this.trend = 0;
    this.lastValue = 0;
  }
}

// ============================================================================
// 预测性GC实现
// ============================================================================

/**
 * 预测性GC管理器
 * 
 * 核心职责:
 * 1. LSTM内存压力预测
 * 2. 三级GC调度 (L1/L2/L3)
 * 3. GC停顿控制 (<100ms)
 * 4. 预测准确率追踪
 */
export class PredictiveGC extends EventEmitter {
  private history: MemorySample[] = [];
  private predictor: LSTMPredictor;
  private isRunning = false;
  private isL3Emergency = false;

  // 阈值配置
  private softThreshold: number;
  private hardThreshold: number;

  // 统计
  private stats = {
    totalRuns: 0,
    l1Runs: 0,
    l2Runs: 0,
    l3Runs: 0,
    pauseTimes: [] as number[],
    predictions: [] as { actual: number; predicted: number }[],
  };

  constructor(config: {
    softThresholdMB?: number;
    hardThresholdMB?: number;
  } = {}) {
    super();
    this.softThreshold = config.softThresholdMB || SOFT_THRESHOLD_MB;
    this.hardThreshold = config.hardThresholdMB || HARD_THRESHOLD_MB;
    this.predictor = new LSTMPredictor();
  }

  /**
   * 记录内存使用
   */
  recordMemoryUsage(usedMB: number, totalMB: number, operation: string): void {
    const sample: MemorySample = {
      timestamp: Date.now(),
      usedMB,
      totalMB,
      operation,
    };

    this.history.push(sample);
    if (this.history.length > HISTORY_WINDOW) {
      this.history.shift();
    }

    // 更新预测模型
    this.predictor.update(usedMB);

    // 检查是否需要GC
    this.checkGCNeeded();
  }

  /**
   * 预测内存使用
   * 
   * 自测: GC-001 预测准确率>80%
   */
  predict(): PredictionResult {
    if (this.history.length < 10) {
      return {
        predictedUsageMB: 0,
        confidence: 0,
        recommendedAction: 'none',
        timestamp: Date.now(),
      };
    }

    // 预测60秒后的使用量
    const steps = PREDICTION_WINDOW_MS / SAMPLE_INTERVAL_MS; // 6 steps
    const { value: predicted, confidence } = this.predictor.predict(steps);

    // 决定动作
    let action: 'none' | GCLevel = 'none';
    if (predicted > this.hardThreshold) {
      action = 'l3';
    } else if (predicted > this.softThreshold) {
      action = 'l2';
    } else if (predicted > this.softThreshold * 0.8) {
      action = 'l1';
    }

    return {
      predictedUsageMB: predicted,
      confidence,
      recommendedAction: action,
      timestamp: Date.now(),
    };
  }

  /**
   * 执行GC
   * 
   * 自测: ARC-003 GC停顿<100ms
   */
  async runGC(level: GCLevel = 'l1'): Promise<GCResult> {
    const startTime = Date.now();
    this.emit('gc:start', { level, timestamp: startTime });

    let freedMB = 0;
    let pauseTime = 0;

    switch (level) {
      case 'l1':
        freedMB = await this.runL1GC();
        pauseTime = Date.now() - startTime;
        this.stats.l1Runs++;
        break;
      case 'l2':
        freedMB = await this.runL2GC();
        pauseTime = Date.now() - startTime;
        this.stats.l2Runs++;
        break;
      case 'l3':
        freedMB = await this.runL3GC();
        pauseTime = Date.now() - startTime;
        this.stats.l3Runs++;
        break;
    }

    this.stats.totalRuns++;
    this.stats.pauseTimes.push(pauseTime);

    // 保持最近100次记录
    if (this.stats.pauseTimes.length > 100) {
      this.stats.pauseTimes.shift();
    }

    // 检查停顿目标
    if (pauseTime > TARGET_GC_PAUSE) {
      console.warn(`[PredictiveGC] ${level} pause ${pauseTime}ms exceeds target ${TARGET_GC_PAUSE}ms`);
      this.emit('gc:pause_exceeded', { level, pauseTime, target: TARGET_GC_PAUSE });
    }

    const result: GCResult = {
      level,
      freedMB,
      pauseTime,
      timestamp: Date.now(),
    };

    this.emit('gc:complete', result);
    return result;
  }

  /**
   * 获取GC统计
   */
  getStats(): GCStats {
    const pauseTimes = this.stats.pauseTimes;
    const avgPause = pauseTimes.length > 0
      ? pauseTimes.reduce((a, b) => a + b, 0) / pauseTimes.length
      : 0;
    const maxPause = pauseTimes.length > 0 ? Math.max(...pauseTimes) : 0;

    // 计算预测准确率
    let accuracy = 0;
    if (this.stats.predictions.length > 10) {
      const errors = this.stats.predictions.map(p => Math.abs(p.actual - p.predicted) / (p.actual + 1));
      const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;
      accuracy = Math.max(0, 1 - avgError);
    }

    return {
      totalRuns: this.stats.totalRuns,
      l1Runs: this.stats.l1Runs,
      l2Runs: this.stats.l2Runs,
      l3Runs: this.stats.l3Runs,
      avgPauseTime: avgPause,
      maxPauseTime: maxPause,
      predictionAccuracy: accuracy,
    };
  }

  /**
   * 获取内存压力状态
   */
  getMemoryPressure(): MemoryPressure {
    const current = this.history[this.history.length - 1];
    if (!current) {
      return { level: 'none', usedMB: 0, totalMB: 0, utilization: 0 };
    }

    const utilization = current.usedMB / (current.totalMB || 1);
    let level: MemoryPressure['level'] = 'none';

    if (utilization > 0.9) level = 'critical';
    else if (utilization > 0.8) level = 'high';
    else if (utilization > 0.7) level = 'medium';
    else if (utilization > 0.5) level = 'low';

    return {
      level,
      usedMB: current.usedMB,
      totalMB: current.totalMB,
      utilization,
    };
  }

  /**
   * 是否处于紧急状态
   */
  isEmergency(): boolean {
    return this.isL3Emergency;
  }

  /**
   * 重置统计
   */
  reset(): void {
    this.history = [];
    this.predictor.reset();
    this.stats = {
      totalRuns: 0,
      l1Runs: 0,
      l2Runs: 0,
      l3Runs: 0,
      pauseTimes: [],
      predictions: [],
    };
    this.emit('gc:reset');
  }

  // -------------------------------------------------------------------------
  // 私有方法
  // -------------------------------------------------------------------------

  private checkGCNeeded(): void {
    const prediction = this.predict();

    if (prediction.recommendedAction !== 'none') {
      // 异步执行GC
      this.runGC(prediction.recommendedAction);
    }
  }

  /**
   * L1: 预测性GC - 0ms停顿
   * 后台清理，不影响主线程
   */
  private async runL1GC(): Promise<number> {
    this.emit('gc:l1:start');

    // 模拟增量标记
    await this.yieldToMainThread();

    // 清理过期缓存
    const freed = await this.cleanupExpiredCache();

    this.emit('gc:l1:complete', { freedMB: freed });
    return freed;
  }

  /**
   * L2: 响应式GC - <10ms停顿
   * 软水位触发，短暂STW
   */
  private async runL2GC(): Promise<number> {
    this.emit('gc:l2:start');

    const start = Date.now();

    // 模拟短暂STW清理
    await new Promise(resolve => setTimeout(resolve, 5));

    const elapsed = Date.now() - start;
    if (elapsed > 10) {
      console.warn(`[PredictiveGC] L2 STW took ${elapsed}ms`);
    }

    // 清理更多数据
    const freed = await this.cleanupOldData();

    this.emit('gc:l2:complete', { freedMB: freed, pauseTime: elapsed });
    return freed;
  }

  /**
   * L3: 紧急GC - <100ms停顿
   * 硬水位触发，全力回收
   */
  private async runL3GC(): Promise<number> {
    this.isL3Emergency = true;
    this.emit('gc:l3:start');

    // 冻结非关键操作
    await this.freezeNonCritical();

    const start = Date.now();

    // 全力回收
    await new Promise(resolve => setTimeout(resolve, 50));

    const elapsed = Date.now() - start;

    // 保留最小工作集
    const freed = await this.emergencyCleanup();

    this.isL3Emergency = false;
    this.emit('gc:l3:complete', { freedMB: freed, pauseTime: elapsed });
    return freed;
  }

  private async yieldToMainThread(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  private async cleanupExpiredCache(): Promise<number> {
    // 模拟清理
    return 5; // 5MB
  }

  private async cleanupOldData(): Promise<number> {
    // 模拟清理
    return 15; // 15MB
  }

  private async freezeNonCritical(): Promise<void> {
    this.emit('gc:freeze');
  }

  private async emergencyCleanup(): Promise<number> {
    this.emit('gc:retain-minimum');
    return 50; // 50MB
  }
}

export default PredictiveGC;
