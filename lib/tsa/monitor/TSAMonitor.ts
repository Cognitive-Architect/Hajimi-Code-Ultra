/**
 * TSA (Tiered Storage Architecture) 监控器
 * 
 * 功能：
 * - 统计各层命中率
 * - 记录读写操作
 * - 计算平均响应时间
 */

export interface TSAMetrics {
  transient: TierMetrics;
  staging: TierMetrics;
  archive: TierMetrics;
  overall: {
    totalReads: number;
    totalWrites: number;
    hitRate: number;
    avgResponseTime: number;
  };
}

export interface TierMetrics {
  size: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  evictionCount: number;
}

interface TierStats {
  size: number;
  hitCount: number;
  missCount: number;
  evictionCount: number;
  totalResponseTime: number;
  operationCount: number;
}

export class TSAMonitor {
  private transientStats: TierStats;
  private stagingStats: TierStats;
  private archiveStats: TierStats;
  private totalReads: number;
  private totalWrites: number;
  private startTime: number;

  constructor() {
    this.transientStats = this.createEmptyStats();
    this.stagingStats = this.createEmptyStats();
    this.archiveStats = this.createEmptyStats();
    this.totalReads = 0;
    this.totalWrites = 0;
    this.startTime = Date.now();
  }

  private createEmptyStats(): TierStats {
    return {
      size: 0,
      hitCount: 0,
      missCount: 0,
      evictionCount: 0,
      totalResponseTime: 0,
      operationCount: 0,
    };
  }

  /**
   * 记录读操作
   */
  recordRead(tier: 'transient' | 'staging' | 'archive', hit: boolean, responseTime: number): void {
    const stats = this.getTierStats(tier);
    stats.operationCount++;
    stats.totalResponseTime += responseTime;

    if (hit) {
      stats.hitCount++;
    } else {
      stats.missCount++;
    }

    this.totalReads++;
  }

  /**
   * 记录写操作
   */
  recordWrite(tier: 'transient' | 'staging' | 'archive', responseTime: number): void {
    const stats = this.getTierStats(tier);
    stats.operationCount++;
    stats.totalResponseTime += responseTime;
    this.totalWrites++;
  }

  /**
   * 更新存储层大小
   */
  updateSize(tier: 'transient' | 'staging' | 'archive', size: number): void {
    const stats = this.getTierStats(tier);
    stats.size = size;
  }

  /**
   * 记录数据驱逐
   */
  recordEviction(tier: 'transient' | 'staging' | 'archive'): void {
    const stats = this.getTierStats(tier);
    stats.evictionCount++;
  }

  /**
   * 获取存储层统计
   */
  private getTierStats(tier: 'transient' | 'staging' | 'archive'): TierStats {
    switch (tier) {
      case 'transient':
        return this.transientStats;
      case 'staging':
        return this.stagingStats;
      case 'archive':
        return this.archiveStats;
      default:
        throw new Error(`Unknown tier: ${tier}`);
    }
  }

  /**
   * 计算命中率
   */
  private calculateHitRate(stats: TierStats): number {
    const total = stats.hitCount + stats.missCount;
    return total > 0 ? stats.hitCount / total : 0;
  }

  /**
   * 计算平均响应时间
   */
  private calculateAvgResponseTime(stats: TierStats): number {
    return stats.operationCount > 0 ? stats.totalResponseTime / stats.operationCount : 0;
  }

  /**
   * 获取监控指标
   */
  getMetrics(): TSAMetrics {
    const transientHitRate = this.calculateHitRate(this.transientStats);
    const stagingHitRate = this.calculateHitRate(this.stagingStats);
    const archiveHitRate = this.calculateHitRate(this.archiveStats);

    const totalHits = this.transientStats.hitCount + this.stagingStats.hitCount + this.archiveStats.hitCount;
    const totalMisses = this.transientStats.missCount + this.stagingStats.missCount + this.archiveStats.missCount;
    const overallHitRate = totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0;

    const totalResponseTime = 
      this.transientStats.totalResponseTime + 
      this.stagingStats.totalResponseTime + 
      this.archiveStats.totalResponseTime;
    const totalOperations = 
      this.transientStats.operationCount + 
      this.stagingStats.operationCount + 
      this.archiveStats.operationCount;
    const overallAvgResponseTime = totalOperations > 0 ? totalResponseTime / totalOperations : 0;

    return {
      transient: {
        size: this.transientStats.size,
        hitCount: this.transientStats.hitCount,
        missCount: this.transientStats.missCount,
        hitRate: transientHitRate,
        evictionCount: this.transientStats.evictionCount,
      },
      staging: {
        size: this.stagingStats.size,
        hitCount: this.stagingStats.hitCount,
        missCount: this.stagingStats.missCount,
        hitRate: stagingHitRate,
        evictionCount: this.stagingStats.evictionCount,
      },
      archive: {
        size: this.archiveStats.size,
        hitCount: this.archiveStats.hitCount,
        missCount: this.archiveStats.missCount,
        hitRate: archiveHitRate,
        evictionCount: this.archiveStats.evictionCount,
      },
      overall: {
        totalReads: this.totalReads,
        totalWrites: this.totalWrites,
        hitRate: overallHitRate,
        avgResponseTime: overallAvgResponseTime,
      },
    };
  }

  /**
   * 获取运行时间（毫秒）
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * 重置所有统计数据
   */
  reset(): void {
    this.transientStats = this.createEmptyStats();
    this.stagingStats = this.createEmptyStats();
    this.archiveStats = this.createEmptyStats();
    this.totalReads = 0;
    this.totalWrites = 0;
    this.startTime = Date.now();
  }
}

export default TSAMonitor;
