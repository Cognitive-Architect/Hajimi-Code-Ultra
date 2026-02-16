/**
 * TSA TTL (Time To Live) 管理器
 * 
 * 功能：
 * - 状态过期自动清理
 * - 定期扫描过期数据
 * - 可配置TTL策略
 * - 支持动态TTL调整
 */

import { Tier, DataEntry, MigrationPolicy } from '../migration/TierMigration';
import { 
  TTLPolicy, 
  DEFAULT_TTL_POLICY, 
  ITTLManager,
  TTLScanResult,
  ExpireContext 
} from './types';

export interface TTLConfig {
  policy: TTLPolicy;
  migrationPolicy: MigrationPolicy;
  /** 过期回调 */
  onExpire?: (context: ExpireContext) => void | Promise<void>;
}

export class TTLManager implements ITTLManager {
  private policy: TTLPolicy;
  private migrationPolicy: MigrationPolicy;
  private customTTLs: Map<string, number>;
  private onExpire?: (context: ExpireContext) => void | Promise<void>;

  constructor(config?: Partial<TTLConfig>) {
    this.policy = config?.policy ?? DEFAULT_TTL_POLICY;
    this.migrationPolicy = config?.migrationPolicy ?? {
      transientMaxSize: 1000,
      stagingMaxSize: 10000,
      transientTTL: 5 * 60 * 1000,
      stagingTTL: 60 * 60 * 1000,
      archiveTTL: -1,
    };
    this.customTTLs = new Map();
    this.onExpire = config?.onExpire;
  }

  /**
   * 更新 TTL 策略
   */
  updatePolicy(policy: Partial<TTLPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }

  /**
   * 获取当前 TTL 策略
   */
  getPolicy(): TTLPolicy {
    return { ...this.policy };
  }

  /**
   * 设置条目自定义 TTL
   */
  setTTL(key: string, ttl: number): void {
    if (ttl < 0 && ttl !== -1) {
      throw new Error('TTL must be non-negative or -1 for infinite');
    }
    this.customTTLs.set(key, ttl);
  }

  /**
   * 获取条目 TTL
   * 优先级：自定义 TTL > 层级 TTL > 默认 TTL
   */
  getTTL(key: string, tier?: Tier): number {
    // 1. 检查自定义 TTL
    const customTTL = this.customTTLs.get(key);
    if (customTTL !== undefined) {
      return customTTL;
    }

    // 2. 检查层级 TTL
    if (tier && this.policy.tierTTL[tier] !== undefined) {
      return this.policy.tierTTL[tier];
    }

    // 3. 返回默认 TTL
    return this.policy.defaultTTL;
  }

  /**
   * 清除条目的自定义 TTL
   */
  clearCustomTTL(key: string): boolean {
    return this.customTTLs.delete(key);
  }

  /**
   * 检查条目是否过期
   */
  isExpired(entry: DataEntry, customTTL?: number): boolean {
    const ttl = customTTL ?? this.getTTL(entry.key, entry.tier);
    
    // -1 表示永不过期
    if (ttl === -1) {
      return false;
    }

    const now = Date.now();
    return now - entry.timestamp > ttl;
  }

  /**
   * 获取过期时间
   */
  getExpirationTime(entry: DataEntry, customTTL?: number): number {
    const ttl = customTTL ?? this.getTTL(entry.key, entry.tier);
    
    if (ttl === -1) {
      return -1; // 永不过期
    }

    return entry.timestamp + ttl;
  }

  /**
   * 获取剩余时间（毫秒）
   */
  getRemainingTime(entry: DataEntry, customTTL?: number): number {
    const ttl = customTTL ?? this.getTTL(entry.key, entry.tier);
    
    if (ttl === -1) {
      return -1; // 永不过期
    }

    const elapsed = Date.now() - entry.timestamp;
    const remaining = ttl - elapsed;
    return Math.max(0, remaining);
  }

  /**
   * 计算动态 TTL
   * 基于访问频率和重要性动态调整
   */
  calculateDynamicTTL(entry: DataEntry): number {
    if (!this.policy.enableDynamicTTL) {
      return this.getTTL(entry.key, entry.tier);
    }

    const baseTTL = this.getTTL(entry.key, entry.tier);
    if (baseTTL === -1) {
      return -1;
    }

    // 基于访问计数调整 TTL
    // 访问越多，TTL 越长
    const accessBonus = Math.min(entry.accessCount * 60 * 1000, baseTTL * 0.5);
    const dynamicTTL = baseTTL + accessBonus * this.policy.dynamicFactor;

    return Math.floor(dynamicTTL);
  }

  /**
   * 扫描过期条目
   */
  scanExpired<T>(
    entries: DataEntry<T>[],
    options?: {
      maxScan?: number;
      deleteEntry?: (key: string) => void;
    }
  ): TTLScanResult {
    const result: TTLScanResult = {
      scanned: 0,
      expired: [],
      cleaned: 0,
      errors: [],
    };

    const maxScan = options?.maxScan ?? entries.length;
    const entriesToScan = entries.slice(0, maxScan);

    for (const entry of entriesToScan) {
      result.scanned++;

      try {
        // 使用动态 TTL 检查
        const dynamicTTL = this.calculateDynamicTTL(entry);
        
        if (this.isExpired(entry, dynamicTTL)) {
          result.expired.push(entry.key);

          // 执行删除
          if (options?.deleteEntry) {
            try {
              options.deleteEntry(entry.key);
              result.cleaned++;

              // 触发过期钩子
              this.emitExpireHook(entry, dynamicTTL);
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : 'Unknown error';
              result.errors.push(`Failed to delete ${entry.key}: ${errorMsg}`);
            }
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Failed to check ${entry.key}: ${errorMsg}`);
      }
    }

    return result;
  }

  /**
   * 批量设置 TTL
   */
  batchSetTTL(ttlMap: Map<string, number>): { success: string[]; failed: string[] } {
    const success: string[] = [];
    const failed: string[] = [];

    for (const [key, ttl] of ttlMap.entries()) {
      try {
        this.setTTL(key, ttl);
        success.push(key);
      } catch (error) {
        failed.push(key);
      }
    }

    return { success, failed };
  }

  /**
   * 清除所有自定义 TTL
   */
  clearAllCustomTTLs(): number {
    const count = this.customTTLs.size;
    this.customTTLs.clear();
    return count;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    customTTLCount: number;
    defaultTTL: number;
    tierTTLs: Record<Tier, number>;
    dynamicTTLEnabled: boolean;
  } {
    return {
      customTTLCount: this.customTTLs.size,
      defaultTTL: this.policy.defaultTTL,
      tierTTLs: { ...this.policy.tierTTL },
      dynamicTTLEnabled: this.policy.enableDynamicTTL,
    };
  }

  /**
   * 触发过期钩子
   */
  private async emitExpireHook(entry: DataEntry, ttl: number): Promise<void> {
    if (!this.onExpire) return;

    const context: ExpireContext = {
      key: entry.key,
      tier: entry.tier,
      timestamp: Date.now(),
      expiredAt: Date.now(),
      ttl,
    };

    try {
      await this.onExpire(context);
    } catch (error) {
      console.error(`TTL expire hook error for ${entry.key}:`, error);
    }
  }
}

export default TTLManager;
