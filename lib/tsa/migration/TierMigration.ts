/**
 * TSA (Tiered Storage Architecture) 存储层迁移模块
 * 
 * 功能：
 * - 数据晋升/降级（Transient→Staging→Archive）
 * - 手动迁移数据
 * - 迁移策略配置
 */

import { StorageTier } from '../index';

export type Tier = 'transient' | 'staging' | 'archive';

export interface MigrationPolicy {
  /** 最大 transient 层数据量 */
  transientMaxSize: number;
  /** 最大 staging 层数据量 */
  stagingMaxSize: number;
  /** Transient 层 TTL（毫秒） */
  transientTTL: number;
  /** Staging 层 TTL（毫秒） */
  stagingTTL: number;
  /** Archive 层 TTL（毫秒），-1 表示永不过期 */
  archiveTTL: number;
}

export interface MigrationConfig {
  policy: MigrationPolicy;
  /** 是否启用自动晋升 */
  enablePromotion: boolean;
  /** 是否启用自动降级 */
  enableDemotion: boolean;
}

export interface DataEntry<T = unknown> {
  key: string;
  value: T;
  tier: Tier;
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
}

export interface MigrationResult {
  success: boolean;
  fromTier: Tier;
  toTier: Tier;
  key: string;
  message?: string;
}

export const DEFAULT_MIGRATION_POLICY: MigrationPolicy = {
  transientMaxSize: 1000,
  stagingMaxSize: 10000,
  transientTTL: 5 * 60 * 1000, // 5 分钟
  stagingTTL: 60 * 60 * 1000, // 1 小时
  archiveTTL: -1, // 永不过期
};

export class TierMigration {
  private policy: MigrationPolicy;
  private enablePromotion: boolean;
  private enableDemotion: boolean;

  constructor(config?: Partial<MigrationConfig>) {
    this.policy = config?.policy ?? DEFAULT_MIGRATION_POLICY;
    this.enablePromotion = config?.enablePromotion ?? true;
    this.enableDemotion = config?.enableDemotion ?? true;
  }

  /**
   * 更新迁移配置
   */
  updateConfig(config: Partial<MigrationConfig>): void {
    if (config.policy) {
      this.policy = { ...this.policy, ...config.policy };
    }
    if (config.enablePromotion !== undefined) {
      this.enablePromotion = config.enablePromotion;
    }
    if (config.enableDemotion !== undefined) {
      this.enableDemotion = config.enableDemotion;
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): MigrationConfig {
    return {
      policy: this.policy,
      enablePromotion: this.enablePromotion,
      enableDemotion: this.enableDemotion,
    };
  }

  /**
   * 判断是否应该晋升（从低优先级层到高优先级层）
   * Transient > Staging > Archive
   */
  shouldPromote(entry: DataEntry, currentTierSize: number): boolean {
    if (!this.enablePromotion) return false;

    const now = Date.now();
    const inactiveTime = now - entry.lastAccessed;

    switch (entry.tier) {
      case 'archive':
        // Archive -> Staging: 频繁访问的数据
        return entry.accessCount > 5 && currentTierSize < this.policy.stagingMaxSize;
      case 'staging':
        // Staging -> Transient: 热点数据
        return entry.accessCount > 10 && 
               inactiveTime < 60000 && // 1分钟内活跃
               currentTierSize < this.policy.transientMaxSize;
      default:
        return false;
    }
  }

  /**
   * 判断是否应该降级（从高优先级层到低优先级层）
   */
  shouldDemote(entry: DataEntry, currentTierSize: number): boolean {
    if (!this.enableDemotion) return false;

    const now = Date.now();
    const inactiveTime = now - entry.lastAccessed;

    switch (entry.tier) {
      case 'transient':
        // Transient -> Staging: 不活跃或空间不足
        return inactiveTime > this.policy.transientTTL || 
               currentTierSize > this.policy.transientMaxSize;
      case 'staging':
        // Staging -> Archive: 不活跃或空间不足
        return inactiveTime > this.policy.stagingTTL || 
               currentTierSize > this.policy.stagingMaxSize;
      default:
        return false;
    }
  }

  /**
   * 判断数据是否过期
   */
  isExpired(entry: DataEntry): boolean {
    const now = Date.now();
    
    switch (entry.tier) {
      case 'transient':
        return now - entry.timestamp > this.policy.transientTTL;
      case 'staging':
        return now - entry.timestamp > this.policy.stagingTTL;
      case 'archive':
        return this.policy.archiveTTL > 0 && now - entry.timestamp > this.policy.archiveTTL;
      default:
        return false;
    }
  }

  /**
   * 获取下一层（晋升）
   */
  getPromotionTier(currentTier: Tier): Tier | null {
    switch (currentTier) {
      case 'archive':
        return 'staging';
      case 'staging':
        return 'transient';
      default:
        return null;
    }
  }

  /**
   * 获取下一层（降级）
   */
  getDemotionTier(currentTier: Tier): Tier | null {
    switch (currentTier) {
      case 'transient':
        return 'staging';
      case 'staging':
        return 'archive';
      default:
        return null;
    }
  }

  /**
   * 计算数据优先级分数（用于淘汰决策）
   * 分数越低越容易被淘汰
   */
  calculatePriorityScore(entry: DataEntry): number {
    const now = Date.now();
    const age = now - entry.timestamp;
    const inactiveTime = now - entry.lastAccessed;
    
    // 优先级公式：访问次数越多、越新、越活跃 = 分数越高
    const accessScore = entry.accessCount * 100;
    const ageScore = Math.max(0, 10000 - age / 1000);
    const activityScore = Math.max(0, 10000 - inactiveTime / 1000);
    
    return accessScore + ageScore + activityScore;
  }

  /**
   * 选择要淘汰的数据项
   */
  selectForEviction<T>(entries: DataEntry<T>[], count: number): DataEntry<T>[] {
    return entries
      .map(entry => ({ entry, score: this.calculatePriorityScore(entry) }))
      .sort((a, b) => a.score - b.score)
      .slice(0, count)
      .map(item => item.entry);
  }

  /**
   * 执行迁移
   */
  migrate<T>(
    key: string, 
    value: T, 
    fromTier: Tier, 
    toTier: Tier
  ): MigrationResult {
    try {
      // 验证迁移路径
      const validMigration = this.validateMigrationPath(fromTier, toTier);
      if (!validMigration) {
        return {
          success: false,
          fromTier,
          toTier,
          key,
          message: `Invalid migration path from ${fromTier} to ${toTier}`,
        };
      }

      return {
        success: true,
        fromTier,
        toTier,
        key,
      };
    } catch (error) {
      return {
        success: false,
        fromTier,
        toTier,
        key,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 验证迁移路径是否有效
   */
  private validateMigrationPath(fromTier: Tier, toTier: Tier): boolean {
    // 允许的迁移路径：
    // transient <-> staging <-> archive
    const validPaths: Record<Tier, Tier[]> = {
      transient: ['staging'],
      staging: ['transient', 'archive'],
      archive: ['staging'],
    };

    return validPaths[fromTier]?.includes(toTier) ?? false;
  }

  /**
   * 将 StorageTier 转换为 Tier
   */
  static toTier(storageTier: StorageTier): Tier {
    switch (storageTier) {
      case 'TRANSIENT':
        return 'transient';
      case 'STAGING':
        return 'staging';
      case 'ARCHIVE':
        return 'archive';
      default:
        return 'staging';
    }
  }

  /**
   * 将 Tier 转换为 StorageTier
   */
  static toStorageTier(tier: Tier): StorageTier {
    switch (tier) {
      case 'transient':
        return 'TRANSIENT';
      case 'staging':
        return 'STAGING';
      case 'archive':
        return 'ARCHIVE';
      default:
        return 'STAGING';
    }
  }
}

export default TierMigration;
