/**
 * 敏感操作熔断机制（Fuse）
 * 
 * 功能：
 * - 异常检测
 * - 自动熔断与恢复
 * - 人工确认流程
 * 
 * 熔断状态：
 * - CLOSED: 正常状态，请求通过
 * * OPEN: 熔断状态，请求被拒绝
 * - HALF_OPEN: 半开状态，测试请求
 */

import { EventEmitter } from 'events';

// 熔断器状态
export enum FuseState {
  CLOSED = 'CLOSED',       // 正常
  OPEN = 'OPEN',          // 熔断
  HALF_OPEN = 'HALF_OPEN'  // 半开（测试）
}

// 熔断器配置
export interface FuseConfig {
  // 名称
  name: string;
  // 失败阈值（触发熔断的失败次数）
  failureThreshold: number;
  // 成功率阈值（低于此值触发熔断）
  successRateThreshold: number;
  // 时间窗口（毫秒）
  timeWindowMs: number;
  // 熔断持续时间（毫秒）
  openDurationMs: number;
  // 半开状态测试请求数
  halfOpenMaxCalls: number;
  // 慢调用阈值（毫秒）
  slowCallThresholdMs: number;
  // 慢调用比例阈值
  slowCallRateThreshold: number;
  // 是否需要人工确认
  requireManualReset: boolean;
}

// 默认配置
export const DEFAULT_FUSE_CONFIG: Partial<FuseConfig> = {
  failureThreshold: 5,
  successRateThreshold: 50,
  timeWindowMs: 60000,
  openDurationMs: 30000,
  halfOpenMaxCalls: 3,
  slowCallThresholdMs: 1000,
  slowCallRateThreshold: 80,
  requireManualReset: false
};

// 调用记录
interface CallRecord {
  timestamp: number;
  success: boolean;
  durationMs: number;
  error?: string;
}

// 熔断器统计
interface FuseStats {
  state: FuseState;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  slowCalls: number;
  successRate: number;
  slowCallRate: number;
  lastFailureTime?: number;
  stateChangedAt: number;
}

// 熔断事件
interface FuseEvent {
  fuseName: string;
  state: FuseState;
  timestamp: number;
  reason?: string;
  stats?: FuseStats;
}

// 确认请求
interface ConfirmationRequest {
  requestId: string;
  fuseName: string;
  operation: string;
  risk: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  requestedAt: Date;
  expiresAt: Date;
  status: 'pending' | 'approved' | 'denied' | 'expired';
}

/**
 * 单个熔断器
 */
export class Fuse extends EventEmitter {
  private config: FuseConfig;
  private state: FuseState = FuseState.CLOSED;
  private callHistory: CallRecord[] = [];
  private stateChangedAt: number = Date.now();
  private halfOpenCalls: number = 0;
  private manualResetRequired: boolean = false;

  constructor(config: FuseConfig) {
    super();
    this.config = { ...DEFAULT_FUSE_CONFIG, ...config } as FuseConfig;
  }

  /**
   * 获取当前状态
   */
  getState(): FuseState {
    return this.state;
  }

  /**
   * 检查是否允许请求通过
   */
  canExecute(): boolean {
    this.cleanupOldRecords();

    // 检查是否需要从OPEN转换到HALF_OPEN
    if (this.state === FuseState.OPEN) {
      if (this.manualResetRequired) {
        return false;
      }
      
      const timeSinceOpen = Date.now() - this.stateChangedAt;
      if (timeSinceOpen >= this.config.openDurationMs) {
        this.transitionTo(FuseState.HALF_OPEN, 'Timeout elapsed, testing recovery');
        return true;
      }
      return false;
    }

    // 半开状态限制测试请求数
    if (this.state === FuseState.HALF_OPEN) {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        return false;
      }
      this.halfOpenCalls++;
    }

    return true;
  }

  /**
   * 记录调用结果
   */
  recordResult(success: boolean, durationMs: number, error?: string): void {
    const record: CallRecord = {
      timestamp: Date.now(),
      success,
      durationMs,
      error
    };

    this.callHistory.push(record);

    // 检查是否需要熔断
    this.evaluateState();
  }

  /**
   * 清理过期记录
   */
  private cleanupOldRecords(): void {
    const cutoff = Date.now() - this.config.timeWindowMs;
    this.callHistory = this.callHistory.filter(r => r.timestamp > cutoff);
  }

  /**
   * 评估状态转换
   */
  private evaluateState(): void {
    const stats = this.calculateStats();

    switch (this.state) {
      case FuseState.CLOSED:
        // 检查是否需要熔断
        if (stats.failedCalls >= this.config.failureThreshold) {
          this.transitionTo(FuseState.OPEN, `Failure threshold reached: ${stats.failedCalls}`);
        } else if (stats.successRate < this.config.successRateThreshold) {
          this.transitionTo(FuseState.OPEN, `Success rate too low: ${stats.successRate.toFixed(1)}%`);
        } else if (stats.slowCallRate > this.config.slowCallRateThreshold) {
          this.transitionTo(FuseState.OPEN, `Slow call rate too high: ${stats.slowCallRate.toFixed(1)}%`);
        }
        break;

      case FuseState.HALF_OPEN:
        // 检查是否可以关闭熔断
        if (stats.successRate >= this.config.successRateThreshold && 
            stats.slowCallRate <= this.config.slowCallRateThreshold) {
          this.transitionTo(FuseState.CLOSED, 'Recovery successful');
        } else if (stats.failedCalls > 0) {
          this.transitionTo(FuseState.OPEN, 'Recovery failed');
        }
        break;
    }
  }

  /**
   * 状态转换
   */
  private transitionTo(newState: FuseState, reason: string): void {
    const oldState = this.state;
    this.state = newState;
    this.stateChangedAt = Date.now();

    if (newState === FuseState.OPEN && this.config.requireManualReset) {
      this.manualResetRequired = true;
    }

    if (newState === FuseState.CLOSED) {
      this.manualResetRequired = false;
      this.halfOpenCalls = 0;
    }

    if (newState === FuseState.HALF_OPEN) {
      this.halfOpenCalls = 0;
    }

    const event: FuseEvent = {
      fuseName: this.config.name,
      state: newState,
      timestamp: Date.now(),
      reason,
      stats: this.getStats()
    };

    this.emit('state:changed', event);
    this.emit(`state:${newState.toLowerCase()}`, event);
  }

  /**
   * 手动重置熔断器
   */
  manualReset(): boolean {
    if (this.state !== FuseState.OPEN) {
      return false;
    }

    this.manualResetRequired = false;
    this.callHistory = [];
    this.transitionTo(FuseState.HALF_OPEN, 'Manual reset');
    return true;
  }

  /**
   * 强制熔断（紧急情况）
   */
  forceOpen(reason: string): void {
    if (this.state !== FuseState.OPEN) {
      this.transitionTo(FuseState.OPEN, `Forced: ${reason}`);
    }
  }

  /**
   * 计算统计信息
   */
  private calculateStats(): {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    slowCalls: number;
    successRate: number;
    slowCallRate: number;
  } {
    const total = this.callHistory.length;
    if (total === 0) {
      return {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        slowCalls: 0,
        successRate: 100,
        slowCallRate: 0
      };
    }

    const successful = this.callHistory.filter(r => r.success).length;
    const failed = total - successful;
    const slow = this.callHistory.filter(r => r.durationMs > this.config.slowCallThresholdMs).length;

    return {
      totalCalls: total,
      successfulCalls: successful,
      failedCalls: failed,
      slowCalls: slow,
      successRate: (successful / total) * 100,
      slowCallRate: (slow / total) * 100
    };
  }

  /**
   * 获取统计信息
   */
  getStats(): FuseStats {
    const calc = this.calculateStats();
    return {
      state: this.state,
      ...calc,
      lastFailureTime: this.callHistory.filter(r => !r.success).pop()?.timestamp,
      stateChangedAt: this.stateChangedAt
    };
  }
}

/**
 * 熔断管理器
 */
export class FuseManager extends EventEmitter {
  private fuses: Map<string, Fuse> = new Map();
  private confirmationRequests: Map<string, ConfirmationRequest> = new Map();

  /**
   * 注册熔断器
   */
  registerFuse(config: FuseConfig): Fuse {
    const fuse = new Fuse(config);
    
    // 转发事件
    fuse.on('state:changed', (event: FuseEvent) => {
      this.emit('fuse:state:changed', event);
    });

    this.fuses.set(config.name, fuse);
    return fuse;
  }

  /**
   * 获取熔断器
   */
  getFuse(name: string): Fuse | undefined {
    return this.fuses.get(name);
  }

  /**
   * 执行受保护的操作
   */
  async execute<T>(
    fuseName: string,
    operation: () => Promise<T>,
    options: {
      fallback?: () => Promise<T>;
      onRejected?: () => void;
    } = {}
  ): Promise<T> {
    const fuse = this.fuses.get(fuseName);
    if (!fuse) {
      throw new Error(`Fuse not found: ${fuseName}`);
    }

    // 检查是否需要人工确认
    if (!fuse.canExecute()) {
      this.emit('fuse:blocked', { fuseName, state: fuse.getState() });
      
      if (options.onRejected) {
        options.onRejected();
      }

      if (options.fallback) {
        return options.fallback();
      }

      throw new Error(`Fuse ${fuseName} is OPEN`);
    }

    const startTime = Date.now();

    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      
      fuse.recordResult(true, duration);
      this.emit('fuse:success', { fuseName, duration });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      fuse.recordResult(false, duration, error instanceof Error ? error.message : String(error));
      this.emit('fuse:failure', { fuseName, duration, error });

      throw error;
    }
  }

  /**
   * 请求人工确认
   */
  requestConfirmation(
    fuseName: string,
    operation: string,
    risk: 'low' | 'medium' | 'high' | 'critical',
    description: string,
    timeoutMinutes: number = 5
  ): ConfirmationRequest {
    const requestId = `confirm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    const request: ConfirmationRequest = {
      requestId,
      fuseName,
      operation,
      risk,
      description,
      requestedAt: now,
      expiresAt: new Date(now.getTime() + timeoutMinutes * 60000),
      status: 'pending'
    };

    this.confirmationRequests.set(requestId, request);

    this.emit('confirmation:requested', request);

    // 设置过期
    setTimeout(() => {
      const req = this.confirmationRequests.get(requestId);
      if (req && req.status === 'pending') {
        req.status = 'expired';
        this.emit('confirmation:expired', { requestId });
      }
    }, timeoutMinutes * 60000);

    return request;
  }

  /**
   * 批准确认请求
   */
  approveConfirmation(requestId: string): boolean {
    const request = this.confirmationRequests.get(requestId);
    if (!request || request.status !== 'pending') return false;

    // 检查是否过期
    if (new Date() > request.expiresAt) {
      request.status = 'expired';
      return false;
    }

    request.status = 'approved';

    // 如果对应熔断器是OPEN状态，尝试重置
    const fuse = this.fuses.get(request.fuseName);
    if (fuse) {
      fuse.manualReset();
    }

    this.emit('confirmation:approved', { requestId, request });
    return true;
  }

  /**
   * 拒绝确认请求
   */
  denyConfirmation(requestId: string): boolean {
    const request = this.confirmationRequests.get(requestId);
    if (!request || request.status !== 'pending') return false;

    request.status = 'denied';
    this.emit('confirmation:denied', { requestId, request });
    return true;
  }

  /**
   * 获取待处理的确认请求
   */
  getPendingConfirmations(): ConfirmationRequest[] {
    return Array.from(this.confirmationRequests.values())
      .filter(r => r.status === 'pending' && new Date() <= r.expiresAt);
  }

  /**
   * 获取所有熔断器状态
   */
  getAllStats(): Record<string, FuseStats> {
    const stats: Record<string, FuseStats> = {};
    this.fuses.forEach((fuse, name) => {
      stats[name] = fuse.getStats();
    });
    return stats;
  }

  /**
   * 紧急熔断所有
   */
  emergencyShutdown(reason: string): void {
    this.fuses.forEach(fuse => {
      fuse.forceOpen(`Emergency: ${reason}`);
    });
    this.emit('emergency:shutdown', { reason, timestamp: Date.now() });
  }

  /**
   * 全局恢复
   */
  globalReset(): void {
    this.fuses.forEach(fuse => {
      fuse.manualReset();
    });
    this.emit('global:reset', { timestamp: Date.now() });
  }
}

// 导出单例
export const fuseManager = new FuseManager();

// 导出类型
export type { CallRecord, FuseStats, FuseEvent, ConfirmationRequest };
