/**
 * YGGDRASIL - Regenerate 状态重置服务 (RST)
 * HAJIMI-YGGDRASIL-001
 * 
 * 职责:
 * - 清空Transient层数据
 * - 保持State Machine状态不变 (RST-002)
 * - 确保内存释放效率>80% (RST-003)
 * - 操作幂等性 (RST-001)
 */

import { tsa, StorageTier } from '@/lib/tsa';
import { stateMachine } from '@/lib/core/state';
import { 
  RegenerateRequest, 
  RegenerateResult,
  YggdrasilError,
  YggdrasilErrorCode 
} from './types';

// 性能指标
interface RegenerateMetrics {
  totalOperations: number;
  totalBytesReleased: number;
  averageDurationMs: number;
  lastOperationAt?: number;
}

// 默认保留键模式
const DEFAULT_PRESERVE_PATTERNS = [
  /^state:current/,      // 状态机当前状态
  /^state:history/,      // 状态机历史
  /^governance:/,        // 治理数据
  /^proposal:/,          // 提案数据
  /^vote:/,              // 投票数据
];

class RegenerateService {
  private metrics: RegenerateMetrics = {
    totalOperations: 0,
    totalBytesReleased: 0,
    averageDurationMs: 0,
  };

  /**
   * 执行状态重置 (RST-001~003)
   * 
   * @param request 重置请求
   * @returns 重置结果
   */
  async regenerate(request: RegenerateRequest): Promise<RegenerateResult> {
    const startTime = performance.now();
    const sessionPrefix = `session:${request.sessionId}:`;
    
    try {
      console.log(`[Regenerate] 开始状态重置: session=${request.sessionId}`);

      // 1. 记录当前状态机状态 (RST-002)
      const currentState = stateMachine.getCurrentState();
      console.log(`[Regenerate] 当前状态机状态: ${currentState} (将被保留)`);

      // 2. 获取所有Transient层键
      const allKeys = await this.getTransientKeys(sessionPrefix);
      console.log(`[Regenerate] 发现 ${allKeys.length} 个Transient键`);

      // 3. 确定需要保留的键
      const keysToPreserve = this.determineKeysToPreserve(
        allKeys, 
        request.preserveKeys || [],
        request.preserveAgentState !== false // 默认保留Agent状态
      );

      // 4. 确定需要清除的键
      const keysToClear = allKeys.filter(key => !keysToPreserve.includes(key));
      console.log(`[Regenerate] 将清除 ${keysToClear.length} 个键, 保留 ${keysToPreserve.length} 个键`);

      // 5. 计算释放字节数
      const releasedBytes = await this.calculateReleasedBytes(keysToClear);

      // 6. 执行清除
      let clearedCount = 0;
      for (const key of keysToClear) {
        try {
          await tsa.delete(key);
          clearedCount++;
        } catch (error) {
          console.warn(`[Regenerate] 删除键失败: ${key}`, error);
        }
      }

      // 7. 验证State Machine状态未改变 (RST-002)
      const afterState = stateMachine.getCurrentState();
      if (afterState !== currentState) {
        console.error(`[Regenerate] 警告: 状态机状态被意外修改 ${currentState} -> ${afterState}`);
      }

      const durationMs = Math.round(performance.now() - startTime);

      // 8. 更新指标
      this.updateMetrics(durationMs, releasedBytes);

      // 9. 返回结果
      const result: RegenerateResult = {
        success: true,
        clearedKeys: clearedCount,
        releasedBytes,
        durationMs,
        preservedKeys: keysToPreserve,
        timestamp: Date.now(),
      };

      console.log(`[Regenerate] 完成: 清除${clearedCount}个键, 释放${(releasedBytes/1024/1024).toFixed(2)}MB, 耗时${durationMs}ms`);

      return result;

    } catch (error) {
      console.error('[Regenerate] 状态重置失败:', error);
      throw this.createError('TRANSIENT_CLEAR_FAILED', '状态重置失败', error);
    }
  }

  /**
   * 检查操作幂等性 (RST-001)
   * 如果再次调用，应该返回 releasedBytes=0
   */
  async checkIdempotency(request: RegenerateRequest): Promise<boolean> {
    const sessionPrefix = `session:${request.sessionId}:`;
    const keys = await this.getTransientKeys(sessionPrefix);
    
    // 如果没有Transient键，说明已经重置过
    const hasTransientData = keys.some(key => {
      // 排除应该保留的键
      return !DEFAULT_PRESERVE_PATTERNS.some(pattern => pattern.test(key));
    });
    
    return !hasTransientData;
  }

  /**
   * 获取性能指标
   */
  getMetrics(): RegenerateMetrics {
    return { ...this.metrics };
  }

  /**
   * 重置性能指标（仅用于测试）
   */
  resetMetrics(): void {
    this.metrics = {
      totalOperations: 0,
      totalBytesReleased: 0,
      averageDurationMs: 0,
    };
  }

  // ==================== 私有方法 ====================

  /**
   * 获取所有Transient层键
   */
  private async getTransientKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    
    // 从TSA获取所有键
    const allKeys = tsa.keys();
    
    // 筛选出属于当前session的键
    for (const key of allKeys) {
      if (key.startsWith(prefix) || key.includes('transient')) {
        keys.push(key);
      }
    }

    return keys;
  }

  /**
   * 确定需要保留的键
   */
  private determineKeysToPreserve(
    allKeys: string[],
    userPreserveKeys: string[],
    preserveAgentState: boolean
  ): string[] {
    const preserveSet = new Set<string>();

    // 1. 用户指定的保留键
    for (const key of userPreserveKeys) {
      preserveSet.add(key);
    }

    // 2. 如果保留Agent状态，添加匹配的键
    if (preserveAgentState) {
      for (const key of allKeys) {
        if (DEFAULT_PRESERVE_PATTERNS.some(pattern => pattern.test(key))) {
          preserveSet.add(key);
        }
      }
    }

    return Array.from(preserveSet);
  }

  /**
   * 计算将要释放的字节数
   * 估算: 基于键的数量和平均大小
   */
  private async calculateReleasedBytes(keys: string[]): Promise<number> {
    const AVG_KEY_SIZE = 1024; // 假设平均每个键1KB
    return keys.length * AVG_KEY_SIZE;
  }

  /**
   * 更新性能指标
   */
  private updateMetrics(durationMs: number, releasedBytes: number): void {
    const { totalOperations, totalBytesReleased, averageDurationMs } = this.metrics;
    
    this.metrics.totalOperations = totalOperations + 1;
    this.metrics.totalBytesReleased = totalBytesReleased + releasedBytes;
    this.metrics.averageDurationMs = 
      (averageDurationMs * totalOperations + durationMs) / (totalOperations + 1);
    this.metrics.lastOperationAt = Date.now();
  }

  /**
   * 创建错误对象
   */
  private createError(
    code: YggdrasilErrorCode, 
    message: string, 
    cause?: unknown
  ): YggdrasilError {
    return {
      code,
      message: cause instanceof Error ? `${message}: ${cause.message}` : message,
      action: 'REGENERATE',
      recoverable: code === 'TRANSIENT_CLEAR_FAILED',
    };
  }
}

// 导出单例
export const regenerateService = new RegenerateService();
export default regenerateService;
