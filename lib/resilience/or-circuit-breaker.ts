/**
 * OpenRouter Circuit Breaker 熔断器
 * HAJIMI-OR-IPDIRECT
 * 
 * 实现 Circuit Breaker 模式，防止级联故障
 * 
 * @module lib/resilience/or-circuit-breaker
 * @author 压力怪 (Audit) - B-05/09
 */

import { EventEmitter } from 'events';

// ============================================================================
// 类型定义
// ============================================================================

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** 连续失败阈值，达到后熔断 */
  failureThreshold: number;
  /** 熔断后重置超时 (ms) */
  resetTimeoutMs: number;
  /** 半开状态最大成功请求数 */
  halfOpenMaxCalls: number;
  /** 监控窗口大小 (ms) */
  monitoringWindowMs?: number;
  /** 成功响应码列表 */
  successCodes?: number[];
}

export interface CircuitStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
}

export interface ProtectedCallResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  fromCache?: boolean;
  circuitState: CircuitState;
}

// ============================================================================
// Circuit Breaker 实现
// ============================================================================

export class ORCircuitBreaker extends EventEmitter {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private lastSuccessTime = 0;
  private totalCalls = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  
  private resetTimer?: NodeJS.Timeout;
  private options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions) {
    super();
    this.options = {
      failureThreshold: options.failureThreshold,
      resetTimeoutMs: options.resetTimeoutMs,
      halfOpenMaxCalls: options.halfOpenMaxCalls,
      monitoringWindowMs: options.monitoringWindowMs || 60000,
      successCodes: options.successCodes || [200, 201, 204],
    };
  }

  // ========================================================================
  // 核心方法
  // ========================================================================

  /**
   * 执行受保护的调用
   */
  async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<ProtectedCallResult<T>> {
    // 检查熔断器状态
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.transitionTo('HALF_OPEN');
      } else {
        this.emit('reject', { state: 'OPEN', remainingCooldown: this.getRemainingCooldown() });
        
        if (fallback) {
          try {
            const result = await fallback();
            return { success: true, result, circuitState: 'OPEN', fromCache: true };
          } catch (e) {
            return { 
              success: false, 
              error: e instanceof Error ? e : new Error(String(e)),
              circuitState: 'OPEN' 
            };
          }
        }
        
        return {
          success: false,
          error: new CircuitBreakerError(
            'Circuit breaker is OPEN',
            this.getRemainingCooldown()
          ),
          circuitState: 'OPEN',
        };
      }
    }

    this.totalCalls++;

    try {
      const result = await operation();
      this.onSuccess();
      return { success: true, result, circuitState: this.state };
    } catch (error) {
      this.onFailure();
      
      if (fallback && this.state === 'OPEN') {
        try {
          const result = await fallback();
          return { success: true, result, circuitState: this.state, fromCache: true };
        } catch (e) {
          // fallback 也失败了
        }
      }
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        circuitState: this.state,
      };
    }
  }

  /**
   * 记录成功
   */
  recordSuccess(): void {
    this.onSuccess();
  }

  /**
   * 记录失败
   */
  recordFailure(): void {
    this.onFailure();
  }

  // ========================================================================
  // 状态转换
  // ========================================================================

  private onSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.totalSuccesses++;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      
      if (this.successCount >= this.options.halfOpenMaxCalls) {
        this.transitionTo('CLOSED');
      }
    } else {
      this.failureCount = 0;
      this.successCount = 0;
    }

    this.emit('success', { state: this.state, successCount: this.successCount });
  }

  private onFailure(): void {
    this.lastFailureTime = Date.now();
    this.totalFailures++;
    this.failureCount++;

    if (this.state === 'HALF_OPEN') {
      // 半开状态下再次失败，立即重新熔断
      this.transitionTo('OPEN');
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.transitionTo('OPEN');
    }

    this.emit('failure', { 
      state: this.state, 
      failureCount: this.failureCount,
      threshold: this.options.failureThreshold 
    });
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === 'CLOSED') {
      this.failureCount = 0;
      this.successCount = 0;
      if (this.resetTimer) {
        clearTimeout(this.resetTimer);
        this.resetTimer = undefined;
      }
    } else if (newState === 'OPEN') {
      this.successCount = 0;
      this.scheduleReset();
    } else if (newState === 'HALF_OPEN') {
      this.failureCount = 0;
      this.successCount = 0;
    }

    this.emit('stateChange', { from: oldState, to: newState });
    console.log(`[OR-CIRCUIT] State: ${oldState} → ${newState}`);
  }

  private scheduleReset(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    
    this.resetTimer = setTimeout(() => {
      // 超时后进入 HALF_OPEN 状态
      if (this.state === 'OPEN') {
        this.transitionTo('HALF_OPEN');
      }
    }, this.options.resetTimeoutMs);
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs;
  }

  private getRemainingCooldown(): number {
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.options.resetTimeoutMs - elapsed);
  }

  // ========================================================================
  // 查询方法
  // ========================================================================

  getState(): CircuitState {
    return this.state;
  }

  getStats(): CircuitStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  /**
   * 获取健康状态（用于健康检查端点）
   */
  getHealthStatus(): 'healthy' | 'degraded' | 'unhealthy' {
    switch (this.state) {
      case 'CLOSED':
        return 'healthy';
      case 'HALF_OPEN':
        return 'degraded';
      case 'OPEN':
        return 'unhealthy';
      default:
        return 'unhealthy';
    }
  }

  /**
   * 手动重置熔断器
   */
  reset(): void {
    this.transitionTo('CLOSED');
    this.failureCount = 0;
    this.successCount = 0;
    this.totalCalls = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
  }

  // ========================================================================
  // 清理
  // ========================================================================

  dispose(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    this.removeAllListeners();
  }
}

// ============================================================================
// 错误类型
// ============================================================================

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly remainingCooldownMs: number
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createDefaultCircuitBreaker(): ORCircuitBreaker {
  return new ORCircuitBreaker({
    failureThreshold: 3,
    resetTimeoutMs: 30000,
    halfOpenMaxCalls: 2,
  });
}

export default ORCircuitBreaker;
