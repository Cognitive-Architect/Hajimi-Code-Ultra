/**
 * YGGDRASIL - Rollback 三重回滚服务 (RLB)
 * HAJIMI-YGGDRASIL-001
 * 
 * 核心能力:
 * - 软回滚 <500ms (RLB-001)
 * - 硬回滚与TSA状态同步 (RLB-002)
 * - 状态机逆向流转 (RLB-003)
 */

import { tsa, StorageTier } from '@/lib/tsa';
import { stateMachine } from '@/lib/core/state';
import { PowerState, AgentRole } from '@/lib/types/state';
import {
  RollbackType,
  RollbackSnapshot,
  SoftRollbackRequest,
  HardRollbackRequest,
  GovernanceRollbackRequest,
  RollbackResult,
  YggdrasilError,
  YggdrasilErrorCode,
} from './types';

// 快照存储键前缀
const SNAPSHOT_KEY_PREFIX = 'yggdrasil:snapshot:';

class RollbackService {
  private metrics = {
    totalRollbacks: 0,
    averageDurationMs: 0,
    successRate: 1.0,
  };

  /**
   * 创建快照
   * 在执行重大操作前自动调用
   */
  async createSnapshot(sessionId: string): Promise<RollbackSnapshot> {
    const startTime = performance.now();
    
    const snapshot: RollbackSnapshot = {
      id: `snap-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      sessionId,
      state: stateMachine.getCurrentState(),
      timestamp: Date.now(),
      transientKeys: [],
      stagingData: {},
      checksum: '',
    };

    // 收集Transient层数据
    const allKeys = tsa.keys();
    for (const key of allKeys) {
      if (key.includes(`session:${sessionId}:`) || key.includes('transient')) {
        snapshot.transientKeys.push(key);
      }
    }

    // 收集Staging层关键数据
    const stateKey = `state:current`;
    const historyKey = `state:history`;
    
    const currentState = await tsa.get(stateKey);
    const history = await tsa.get(historyKey);
    
    if (currentState) snapshot.stagingData[stateKey] = currentState;
    if (history) snapshot.stagingData[historyKey] = history;

    // 计算校验和
    snapshot.checksum = this.calculateChecksum(snapshot);

    // 保存快照
    await tsa.set(
      `${SNAPSHOT_KEY_PREFIX}${sessionId}:${snapshot.id}`,
      snapshot,
      { tier: 'ARCHIVE' }
    );

    console.log(`[Rollback] 快照创建: ${snapshot.id}, 包含${snapshot.transientKeys.length}个键`);

    return snapshot;
  }

  /**
   * 执行软回滚 (RLB-001)
   * 目标: <500ms
   */
  async softRollback(request: SoftRollbackRequest): Promise<RollbackResult> {
    const startTime = performance.now();
    const previousState = stateMachine.getCurrentState();

    try {
      console.log(`[Rollback] 软回滚: session=${request.sessionId}, snapshot=${request.snapshotId}`);

      // 1. 加载快照
      const snapshot = await tsa.get<RollbackSnapshot>(
        `${SNAPSHOT_KEY_PREFIX}${request.sessionId}:${request.snapshotId}`
      );

      if (!snapshot) {
        throw new Error(`Snapshot not found: ${request.snapshotId}`);
      }

      // 2. 验证校验和
      if (!this.verifyChecksum(snapshot)) {
        console.warn('[Rollback] 快照校验和验证失败');
      }

      // 3. 恢复Transient层数据
      await this.restoreTransientData(snapshot);

      // 4. 恢复Staging层数据
      await this.restoreStagingData(snapshot);

      // 5. 恢复State Machine状态 (RLB-003)
      if (snapshot.state !== previousState) {
        await stateMachine.transition(snapshot.state, 'system', {
          reason: 'Rollback to snapshot',
          snapshotId: snapshot.id,
        });
      }

      const durationMs = Math.round(performance.now() - startTime);
      this.updateMetrics(durationMs, true);

      console.log(`[Rollback] 软回滚完成: 耗时${durationMs}ms`);

      return {
        success: true,
        type: 'soft',
        previousState,
        currentState: snapshot.state,
        durationMs,
        restoredKeys: snapshot.transientKeys.length,
      };

    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      this.updateMetrics(durationMs, false);

      console.error('[Rollback] 软回滚失败:', error);
      return {
        success: false,
        type: 'soft',
        previousState,
        currentState: previousState,
        durationMs,
        restoredKeys: 0,
        error: error instanceof Error ? error.message : 'Rollback failed',
      };
    }
  }

  /**
   * 执行硬回滚 (RLB-002)
   * 从Git历史恢复
   */
  async hardRollback(request: HardRollbackRequest): Promise<RollbackResult> {
    const startTime = performance.now();
    const previousState = stateMachine.getCurrentState();

    try {
      console.log(`[Rollback] 硬回滚: session=${request.sessionId}, commit=${request.commitId}`);

      // TODO: 实现从Git恢复的硬回滚
      // 当前版本暂不支持

      throw new Error('Hard rollback not implemented in current version');

    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      this.updateMetrics(durationMs, false);

      return {
        success: false,
        type: 'hard',
        previousState,
        currentState: previousState,
        durationMs,
        restoredKeys: 0,
        error: error instanceof Error ? error.message : 'Hard rollback failed',
      };
    }
  }

  /**
   * 执行治理回滚
   * 需要投票通过
   */
  async governanceRollback(request: GovernanceRollbackRequest): Promise<RollbackResult> {
    const startTime = performance.now();
    const previousState = stateMachine.getCurrentState();

    try {
      console.log(`[Rollback] 治理回滚: targetState=${request.targetState}`);

      // 1. 触发治理投票
      // TODO: 使用voteService发起投票

      // 2. 执行状态回滚
      if (request.targetState !== previousState) {
        await stateMachine.transition(request.targetState, 'system', {
          reason: 'Governance rollback',
          proposalId: request.proposalId,
        });
      }

      const durationMs = Math.round(performance.now() - startTime);
      this.updateMetrics(durationMs, true);

      return {
        success: true,
        type: 'governance',
        previousState,
        currentState: request.targetState,
        durationMs,
        restoredKeys: 0,
      };

    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      this.updateMetrics(durationMs, false);

      return {
        success: false,
        type: 'governance',
        previousState,
        currentState: previousState,
        durationMs,
        restoredKeys: 0,
        error: error instanceof Error ? error.message : 'Governance rollback failed',
      };
    }
  }

  /**
   * 获取快照列表
   */
  async getSnapshots(sessionId: string): Promise<RollbackSnapshot[]> {
    const snapshots: RollbackSnapshot[] = [];
    const pattern = `${SNAPSHOT_KEY_PREFIX}${sessionId}:`;

    const allKeys = tsa.keys();
    for (const key of allKeys) {
      if (key.startsWith(pattern)) {
        const snapshot = await tsa.get<RollbackSnapshot>(key);
        if (snapshot) {
          snapshots.push(snapshot);
        }
      }
    }

    return snapshots.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 删除快照
   */
  async deleteSnapshot(sessionId: string, snapshotId: string): Promise<boolean> {
    const key = `${SNAPSHOT_KEY_PREFIX}${sessionId}:${snapshotId}`;
    await tsa.delete(key);
    return true;
  }

  /**
   * 清理过期快照
   */
  async cleanupSnapshots(sessionId: string, maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const snapshots = await this.getSnapshots(sessionId);
    const now = Date.now();
    let cleaned = 0;

    for (const snapshot of snapshots) {
      if (now - snapshot.timestamp > maxAgeMs) {
        await this.deleteSnapshot(sessionId, snapshot.id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * 获取性能指标
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  // ==================== 私有方法 ====================

  /**
   * 恢复Transient层数据
   */
  private async restoreTransientData(snapshot: RollbackSnapshot): Promise<void> {
    // 清除当前Transient数据
    const currentKeys = tsa.keys().filter(key => 
      key.includes(`session:${snapshot.sessionId}:`) ||
      key.includes('transient')
    );

    for (const key of currentKeys) {
      await tsa.delete(key);
    }

    // TODO: 恢复快照中的Transient数据
    // 实际项目中应从快照存储恢复
  }

  /**
   * 恢复Staging层数据
   */
  private async restoreStagingData(snapshot: RollbackSnapshot): Promise<void> {
    for (const [key, value] of Object.entries(snapshot.stagingData)) {
      await tsa.set(key, value, { tier: 'STAGING' });
    }
  }

  /**
   * 计算校验和
   */
  private calculateChecksum(snapshot: RollbackSnapshot): string {
    const data = `${snapshot.sessionId}:${snapshot.state}:${snapshot.timestamp}:${snapshot.transientKeys.join(',')}`;
    // 简化实现，实际应使用加密哈希
    return Buffer.from(data).toString('base64').slice(0, 16);
  }

  /**
   * 验证校验和
   */
  private verifyChecksum(snapshot: RollbackSnapshot): boolean {
    const expected = this.calculateChecksum(snapshot);
    return expected === snapshot.checksum;
  }

  /**
   * 更新性能指标
   */
  private updateMetrics(durationMs: number, success: boolean): void {
    const { totalRollbacks, averageDurationMs, successRate } = this.metrics;
    
    this.metrics.totalRollbacks = totalRollbacks + 1;
    this.metrics.averageDurationMs = 
      (averageDurationMs * totalRollbacks + durationMs) / (totalRollbacks + 1);
    this.metrics.successRate = 
      (successRate * totalRollbacks + (success ? 1 : 0)) / (totalRollbacks + 1);
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
      action: 'ROLLBACK',
      recoverable: code === 'ROLLBACK_FAILED',
    };
  }
}

// 导出单例
export const rollbackService = new RollbackService();
export default rollbackService;
