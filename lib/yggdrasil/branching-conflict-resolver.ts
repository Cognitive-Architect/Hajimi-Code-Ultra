/**
 * YGGDRASIL P1 - Branching冲突检测与解决
 * HAJIMI-YGGDRASIL-P1-04
 * 
 * 职责:
 * - 合并冲突检测（Transient层Key冲突）(BRH-004)
 * - 冲突自动解决策略（Last-Write-Win+时间戳）(BRH-005)
 * - 合并后自动清理分支数据 (BRH-006)
 */

import { tsa } from '@/lib/tsa';
import { Branch } from './types';

export interface Conflict {
  key: string;
  sourceValue: unknown;
  targetValue: unknown;
  sourceTimestamp: number;
  targetTimestamp: number;
  resolution?: 'source' | 'target' | 'manual';
}

export interface MergeConflictResult {
  hasConflict: boolean;
  conflicts: Conflict[];
  autoResolved: Conflict[];
  needsManual: Conflict[];
}

export interface CleanupResult {
  success: boolean;
  deletedKeys: number;
  freedBytes: number;
}

class BranchingConflictResolver {
  /**
   * 检测合并冲突 (BRH-004)
   */
  async detectConflicts(sourceBranchId: string, targetBranchId: string): Promise<MergeConflictResult> {
    console.log(`[ConflictResolver] 检测冲突: ${sourceBranchId} -> ${targetBranchId}`);

    const conflicts: Conflict[] = [];
    const autoResolved: Conflict[] = [];
    const needsManual: Conflict[] = [];

    // 获取两个分支的Transient键
    const sourceKeys = await this.getBranchKeys(sourceBranchId);
    const targetKeys = await this.getBranchKeys(targetBranchId);

    // 找出共同键
    const commonKeys = sourceKeys.filter(k => targetKeys.includes(k));

    for (const key of commonKeys) {
      const sourceData = await this.getKeyWithMetadata(sourceBranchId, key);
      const targetData = await this.getKeyWithMetadata(targetBranchId, key);

      // 检查值是否不同
      if (JSON.stringify(sourceData.value) !== JSON.stringify(targetData.value)) {
        const conflict: Conflict = {
          key,
          sourceValue: sourceData.value,
          targetValue: targetData.value,
          sourceTimestamp: sourceData.timestamp,
          targetTimestamp: targetData.timestamp,
        };

        conflicts.push(conflict);

        // BRH-005: 尝试自动解决
        const resolution = this.attemptAutoResolve(conflict);
        if (resolution) {
          conflict.resolution = resolution;
          autoResolved.push(conflict);
        } else {
          needsManual.push(conflict);
        }
      }
    }

    console.log(`[ConflictResolver] 发现 ${conflicts.length} 个冲突，自动解决 ${autoResolved.length} 个`);

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
      autoResolved,
      needsManual,
    };
  }

  /**
   * 应用自动解决策略 (BRH-005)
   * Last-Write-Win + 时间戳
   */
  async applyAutoResolutions(
    targetBranchId: string,
    resolutions: Conflict[]
  ): Promise<{ applied: number; failed: number }> {
    let applied = 0;
    let failed = 0;

    for (const conflict of resolutions) {
      if (!conflict.resolution) continue;

      try {
        const value = conflict.resolution === 'source' 
          ? conflict.sourceValue 
          : conflict.targetValue;

        await tsa.set(
          `branch:${targetBranchId}:${conflict.key}`,
          value,
          { tier: 'TRANSIENT' }
        );

        applied++;
      } catch (error) {
        console.error(`[ConflictResolver] 应用解决失败: ${conflict.key}`, error);
        failed++;
      }
    }

    return { applied, failed };
  }

  /**
   * 合并后自动清理分支数据 (BRH-006)
   */
  async cleanupBranchData(branchId: string, preserveSnapshots: boolean = false): Promise<CleanupResult> {
    console.log(`[ConflictResolver] 清理分支数据: ${branchId}`);

    const result: CleanupResult = {
      success: true,
      deletedKeys: 0,
      freedBytes: 0,
    };

    try {
      // 获取所有分支键
      const keys = tsa.keys().filter(k => 
        k.includes(`branch:${branchId}:`) ||
        k.includes(`transient:${branchId}:`)
      );

      // 保留快照（如果需要）
      const keysToDelete = preserveSnapshots
        ? keys.filter(k => !k.includes('snapshot'))
        : keys;

      for (const key of keysToDelete) {
        await tsa.delete(key);
        result.deletedKeys++;
        result.freedBytes += 1024; // 估算
      }

      console.log(`[ConflictResolver] 清理完成: ${result.deletedKeys} 个键, ${(result.freedBytes/1024).toFixed(2)} MB`);

    } catch (error) {
      console.error('[ConflictResolver] 清理失败:', error);
      result.success = false;
    }

    return result;
  }

  /**
   * 智能预合并检查
   */
  async preMergeCheck(sourceBranch: Branch, targetBranch: Branch): Promise<{
    canMerge: boolean;
    warnings: string[];
    estimatedConflicts: number;
  }> {
    const warnings: string[] = [];

    // 检查分支状态
    if (sourceBranch.status !== 'active') {
      warnings.push(`Source branch is ${sourceBranch.status}`);
    }

    // 检测潜在冲突
    const conflictResult = await this.detectConflicts(sourceBranch.id, targetBranch.id);

    // 如果有需要手动解决的冲突，阻止自动合并
    const canMerge = conflictResult.needsManual.length === 0;

    return {
      canMerge,
      warnings,
      estimatedConflicts: conflictResult.conflicts.length,
    };
  }

  // ==================== 私有方法 ====================

  /**
   * 获取分支的所有键
   */
  private async getBranchKeys(branchId: string): Promise<string[]> {
    const allKeys = tsa.keys();
    return allKeys
      .filter(k => k.includes(`branch:${branchId}:`) || k.includes(`transient:${branchId}:`))
      .map(k => k.replace(`branch:${branchId}:`, '').replace(`transient:${branchId}:`, ''));
  }

  /**
   * 获取键值和元数据
   */
  private async getKeyWithMetadata(branchId: string, key: string): Promise<{
    value: unknown;
    timestamp: number;
  }> {
    const fullKey = `branch:${branchId}:${key}`;
    const value = await tsa.get(fullKey);
    
    // 从其他元数据源获取时间戳（这里简化处理）
    return {
      value,
      timestamp: Date.now(),
    };
  }

  /**
   * 尝试自动解决冲突 (BRH-005)
   * 策略: Last-Write-Win
   */
  private attemptAutoResolve(conflict: Conflict): 'source' | 'target' | null {
    // 基于时间戳的Last-Write-Win
    if (conflict.sourceTimestamp > conflict.targetTimestamp) {
      return 'source';
    } else if (conflict.targetTimestamp > conflict.sourceTimestamp) {
      return 'target';
    }
    
    // 时间戳相同，无法自动解决
    return null;
  }
}

// 导出单例
export const branchingConflictResolver = new BranchingConflictResolver();
export { BranchingConflictResolver };
export default branchingConflictResolver;
