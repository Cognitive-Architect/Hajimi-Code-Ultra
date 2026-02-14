/**
 * TSA LRU (Least Recently Used) 管理器
 * 
 * 功能：
 * - 内存压力下自动淘汰
 * - 访问计数追踪
 * - 加权优先级计算
 * - 智能淘汰策略
 */

import { DataEntry, Tier } from '../migration/TierMigration';
import { 
  LRUPolicy, 
  DEFAULT_LRU_POLICY, 
  ILRUManager,
  MemoryPressure,
  LRUEvictionResult,
  EvictContext 
} from './types';

export interface LRUConfig {
  policy: LRUPolicy;
  /** 淘汰回调 */
  onEvict?: (context: EvictContext) => void | Promise<void>;
}

interface AccessRecord {
  count: number;
  lastAccess: number;
  weight: number;
}

interface EvictionCandidate<T> {
  entry: DataEntry<T>;
  score: number;
  priority: number;
}

export class LRUManager implements ILRUManager {
  private policy: LRUPolicy;
  private accessRecords: Map<string, AccessRecord>;
  private onEvict?: (context: EvictContext) => void | Promise<void>;
  private memoryStats: {
    usedEntries: number;
    totalCapacity: number;
  };

  constructor(config?: Partial<LRUConfig>) {
    this.policy = config?.policy ?? DEFAULT_LRU_POLICY;
    this.accessRecords = new Map();
    this.onEvict = config?.onEvict;
    this.memoryStats = {
      usedEntries: 0,
      totalCapacity: this.policy.maxEntries,
    };
  }

  /**
   * 更新 LRU 策略
   */
  updatePolicy(policy: Partial<LRUPolicy>): void {
    this.policy = { ...this.policy, ...policy };
    // 更新容量
    this.memoryStats.totalCapacity = this.policy.maxEntries;
  }

  /**
   * 获取当前策略
   */
  getPolicy(): LRUPolicy {
    return { ...this.policy };
  }

  /**
   * 记录访问
   */
  recordAccess(key: string): void {
    const now = Date.now();
    const record = this.accessRecords.get(key);

    if (record) {
      record.count++;
      record.lastAccess = now;
      // 更新权重：访问越频繁，权重越高
      record.weight = this.calculateWeight(record);
    } else {
      this.accessRecords.set(key, {
        count: 1,
        lastAccess: now,
        weight: 1,
      });
    }
  }

  /**
   * 批量记录访问
   */
  batchRecordAccess(keys: string[]): void {
    for (const key of keys) {
      this.recordAccess(key);
    }
  }

  /**
   * 获取访问计数
   */
  getAccessCount(key: string): number {
    return this.accessRecords.get(key)?.count ?? 0;
  }

  /**
   * 获取访问记录
   */
  getAccessRecord(key: string): AccessRecord | undefined {
    const record = this.accessRecords.get(key);
    return record ? { ...record } : undefined;
  }

  /**
   * 获取最后访问时间
   */
  getLastAccess(key: string): number | undefined {
    return this.accessRecords.get(key)?.lastAccess;
  }

  /**
   * 获取访问权重
   */
  getAccessWeight(key: string): number {
    return this.accessRecords.get(key)?.weight ?? 0;
  }

  /**
   * 检查内存压力
   */
  checkMemoryPressure(currentEntries?: number): MemoryPressure {
    const used = currentEntries ?? this.memoryStats.usedEntries;
    const total = this.memoryStats.totalCapacity;
    const usedRatio = total > 0 ? used / total : 0;
    const isUnderPressure = usedRatio >= this.policy.memoryPressureThreshold;

    let suggestedEvictionCount = 0;
    if (isUnderPressure) {
      // 建议淘汰数量：使内存使用降到阈值的80%
      const targetRatio = this.policy.memoryPressureThreshold * 0.8;
      const targetEntries = Math.floor(total * targetRatio);
      suggestedEvictionCount = Math.max(
        Math.floor(used * this.policy.evictionRatio),
        used - targetEntries
      );
      // 确保不低于最小保留数
      suggestedEvictionCount = Math.min(
        suggestedEvictionCount,
        used - this.policy.minEntries
      );
    }

    return {
      usedRatio,
      isUnderPressure,
      suggestedEvictionCount: Math.max(0, suggestedEvictionCount),
    };
  }

  /**
   * 更新内存使用统计
   */
  updateMemoryStats(usedEntries: number, totalCapacity?: number): void {
    this.memoryStats.usedEntries = usedEntries;
    if (totalCapacity !== undefined) {
      this.memoryStats.totalCapacity = totalCapacity;
    }
  }

  /**
   * 计算优先级分数
   * 分数越低，越容易被淘汰
   */
  calculatePriorityScore<T>(entry: DataEntry<T>): number {
    const now = Date.now();
    const age = now - entry.timestamp;
    const inactiveTime = now - entry.lastAccessed;
    const record = this.accessRecords.get(entry.key);

    // 基础分数计算
    let score = 0;

    // 访问频率因子（访问越多，分数越高，越不容易被淘汰）
    const accessCount = record?.count ?? entry.accessCount;
    const accessScore = Math.min(accessCount * 10, 1000);
    score += accessScore;

    // 权重因子
    if (this.policy.useWeightedAccess && record) {
      score += record.weight * 5;
    }

    // 年龄因子（越新，分数越高）
    const ageScore = Math.max(0, 10000 - age / 100);
    score += ageScore;

    // 活跃度因子（越活跃，分数越高）
    const activityScore = Math.max(0, 10000 - inactiveTime / 100);
    score += activityScore;

    // 层级因子（Archive 层更容易被淘汰）
    const tierBonus: Record<Tier, number> = {
      transient: 500,
      staging: 300,
      archive: 0,
    };
    score += tierBonus[entry.tier];

    return score;
  }

  /**
   * 选择要淘汰的条目
   */
  selectForEviction<T>(entries: DataEntry<T>[], count: number): DataEntry<T>[] {
    if (count <= 0 || entries.length === 0) {
      return [];
    }

    // 计算每个条目的优先级分数
    const candidates: EvictionCandidate<T>[] = entries.map(entry => ({
      entry,
      score: this.calculatePriorityScore(entry),
      priority: 0, // 将在排序后设置
    }));

    // 按分数升序排序（分数越低，优先级越高，越容易被淘汰）
    candidates.sort((a, b) => a.score - b.score);

    // 设置优先级序号
    candidates.forEach((candidate, index) => {
      candidate.priority = index + 1;
    });

    // 返回需要淘汰的条目
    return candidates
      .slice(0, count)
      .map(c => c.entry);
  }

  /**
   * 执行淘汰
   */
  async evict<T>(
    entries: DataEntry<T>[],
    options?: {
      count?: number;
      reason?: EvictContext['reason'];
      deleteEntry?: (key: string) => void;
    }
  ): Promise<LRUEvictionResult> {
    const result: LRUEvictionResult = {
      evicted: 0,
      evictedKeys: [],
      memoryPressure: this.checkMemoryPressure(entries.length),
      errors: [],
    };

    const count = options?.count ?? result.memoryPressure.suggestedEvictionCount;
    if (count <= 0) {
      return result;
    }

    const candidates = this.selectForEviction(entries, count);

    for (const entry of candidates) {
      try {
        // 执行删除
        if (options?.deleteEntry) {
          options.deleteEntry(entry.key);
        }

        // 清理访问记录
        this.accessRecords.delete(entry.key);

        result.evicted++;
        result.evictedKeys.push(entry.key);

        // 触发淘汰钩子
        await this.emitEvictHook(entry, options?.reason ?? 'lru');
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Failed to evict ${entry.key}: ${errorMsg}`);
      }
    }

    // 更新内存统计
    this.memoryStats.usedEntries = Math.max(
      0,
      this.memoryStats.usedEntries - result.evicted
    );

    return result;
  }

  /**
   * 清理过期访问记录
   */
  cleanupAccessRecords(maxAge?: number): number {
    const now = Date.now();
    const max = maxAge ?? 24 * 60 * 60 * 1000; // 默认24小时
    let cleaned = 0;

    for (const [key, record] of this.accessRecords.entries()) {
      if (now - record.lastAccess > max) {
        this.accessRecords.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * 获取访问记录统计
   */
  getAccessStats(): {
    totalRecords: number;
    totalAccesses: number;
    averageWeight: number;
    hottestKey?: { key: string; count: number };
  } {
    let totalAccesses = 0;
    let totalWeight = 0;
    let hottestKey: { key: string; count: number } | undefined;

    for (const [key, record] of this.accessRecords.entries()) {
      totalAccesses += record.count;
      totalWeight += record.weight;

      if (!hottestKey || record.count > hottestKey.count) {
        hottestKey = { key, count: record.count };
      }
    }

    const totalRecords = this.accessRecords.size;
    return {
      totalRecords,
      totalAccesses,
      averageWeight: totalRecords > 0 ? totalWeight / totalRecords : 0,
      hottestKey,
    };
  }

  /**
   * 重置所有访问记录
   */
  resetAccessRecords(): void {
    this.accessRecords.clear();
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    policy: LRUPolicy;
    memoryStats: { usedEntries: number; totalCapacity: number };
    accessStats: ReturnType<typeof this.getAccessStats>;
    memoryPressure: MemoryPressure;
  } {
    return {
      policy: this.getPolicy(),
      memoryStats: { ...this.memoryStats },
      accessStats: this.getAccessStats(),
      memoryPressure: this.checkMemoryPressure(),
    };
  }

  /**
   * 计算访问权重
   */
  private calculateWeight(record: AccessRecord): number {
    const now = Date.now();
    const timeSinceLastAccess = now - record.lastAccess;
    
    // 时间衰减因子（越长时间未访问，权重越低）
    const decayFactor = Math.max(0.1, 1 - timeSinceLastAccess / (60 * 60 * 1000));
    
    // 权重 = 访问次数 * 衰减因子
    return record.count * decayFactor;
  }

  /**
   * 触发淘汰钩子
   */
  private async emitEvictHook(entry: DataEntry, reason: EvictContext['reason']): Promise<void> {
    if (!this.onEvict) return;

    const context: EvictContext = {
      key: entry.key,
      tier: entry.tier,
      timestamp: Date.now(),
      reason,
      value: entry.value,
    };

    try {
      await this.onEvict(context);
    } catch (error) {
      console.error(`LRU evict hook error for ${entry.key}:`, error);
    }
  }
}

export default LRUManager;
