/**
 * TSA (Tiered Storage Architecture) 完整实现 - B-07/09更新
 * 
 * 提供三层存储架构：
 * - TRANSIENT: 热数据，内存存储，快速访问
 * - STAGING: 温数据，临时存储
 * - ARCHIVE: 冷数据，长期存储
 * 
 * B-05/09: 新增三层降级韧性支持
 * - Redis → IndexedDB → Memory 自动故障转移
 * - 自动故障检测与恢复
 * - 确保数据不丢
 * 
 * B-07/09: 新增故障恢复机制
 * - Fallback: Redis故障时自动降级到本地存储
 * - Repair: 数据损坏检测与修复（Checksum验证）
 * - Split-Brain: 多写冲突解决
 * 
 * 技术债务清偿：DEBT-004 TSA虚假持久化
 */

import { TSAMonitor, TSAMetrics } from './monitor/TSAMonitor';
import { 
  TierMigration, 
  MigrationConfig, 
  Tier, 
  DataEntry,
  MigrationResult,
  DEFAULT_MIGRATION_POLICY 
} from './migration/TierMigration';
import { 
  LifecycleManager, 
  LifecycleConfig, 
  CleanupResult, 
  MigrationReport,
  DEFAULT_LIFECYCLE_CONFIG 
} from './lifecycle/LifecycleManager';

// B-05/09: 导入三层韧性组件
import { IndexedDBStore } from './persistence/IndexedDBStore';
import { RedisStore } from './persistence/RedisStore';
import { 
  TieredFallback, 
  FallbackConfig, 
  TierLevel,
  TierStatus,
  FallbackEvent,
  DEFAULT_FALLBACK_CONFIG 
} from './persistence/TieredFallback';
import type { StorageAdapter, SetOptions as StorageSetOptions } from './persistence/IndexedDBStore';

export type StorageTier = 'TRANSIENT' | 'STAGING' | 'ARCHIVE';

export interface StorageOptions {
  tier?: StorageTier;
  ttl?: number;
}

// B-05/09: 更新 TSA 配置
export interface TSAConfig {
  lifecycle?: Partial<LifecycleConfig>;
  migration?: Partial<MigrationConfig>;
  enableMonitoring?: boolean;
  
  // B-05/09: 新增韧性配置
  fallback?: Partial<FallbackConfig>;
  storage?: {
    redis?: StorageAdapter;           // 可选：自定义 Redis 存储
    indexedDB?: StorageAdapter;       // 可选：自定义 IndexedDB 存储
    useTieredFallback?: boolean;      // 是否启用三层韧性（默认 true）
  };
}

// B-05/09: 导出韧性相关类型
export { 
  TierLevel, 
  TierStatus, 
  FallbackEvent, 
  DEFAULT_FALLBACK_CONFIG,
  IndexedDBStore,
  TieredFallback,
};
export type { StorageAdapter, StorageSetOptions };

// B-07/09: 类型导出

// B-07/09: 导出故障恢复机制
export {
  // Fallback模块
  FallbackMemoryStore,
  createFallbackManager,
  ChecksumUtil,
  DEFAULT_FALLBACK_STORAGE_CONFIG,
  
  // Repair模块
  DataRepair,
  BackupManager,
  SplitBrainResolver,
  RepairManager,
  DEFAULT_REPAIR_CONFIG,
  DEFAULT_SPLIT_BRAIN_CONFIG,
  
  // 控制器
  TSAResilienceController,
  createResilienceController,
  DEFAULT_RESILIENCE_CONFIG,
} from './resilience';

export type {
  // Fallback类型
  FallbackStorageConfig,
  DataSyncResult,
  LocalFileEntry,
  WALEntry,
  FallbackManager,
  
  // Repair类型
  RepairConfig,
  RepairEvent,
  CorruptionReport,
  RepairResult,
  ConflictReport,
  SplitBrainConfig,
  ConflictResolutionStrategy,
  
  // 控制器类型
  ResilienceConfig,
  ResilienceStatus,
  ResilienceEvent,
  ResilienceEventHandler,
} from './resilience';

// 内部存储项接口
interface StorageItem<T> {
  value: T;
  tier: Tier;
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  ttl?: number;
}

// B-05/09: 环境检测工具
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function isNode(): boolean {
  return typeof process !== 'undefined' && process.versions?.node !== undefined;
}

class TieredStorageArchitecture {
  private stores: Map<string, StorageItem<unknown>>;
  private monitor: TSAMonitor;
  private migrationManager: TierMigration;
  private lifecycleManager: LifecycleManager;
  private initialized: boolean = false;
  private config: TSAConfig;
  
  // B-05/09: 三层韧性存储管理器
  private fallbackManager?: TieredFallback;
  private useTieredFallback: boolean;

  constructor(config?: TSAConfig) {
    this.config = config ?? {};
    this.stores = new Map();
    this.monitor = new TSAMonitor();
    this.migrationManager = new TierMigration(config?.migration);
    this.lifecycleManager = new LifecycleManager(
      this.migrationManager,
      this.monitor,
      config?.lifecycle
    );
    
    // B-05/09: 启用三层韧性（默认启用）
    this.useTieredFallback = config?.storage?.useTieredFallback !== false;
    
    if (this.useTieredFallback) {
      this.initializeFallbackManager();
    }
  }

  /**
   * B-05/09: 初始化三层韧性管理器
   * 根据环境自动选择合适的存储层
   * B-02/04 FIX: 自动检测Redis环境变量并创建RedisStore
   */
  private initializeFallbackManager(): void {
    const fallbackConfig: Partial<FallbackConfig> = {
      ...DEFAULT_FALLBACK_CONFIG,
      ...this.config.fallback,
    };

    // 自动检测环境并配置存储层
    let redisStore: StorageAdapter | undefined;
    let indexedDBStore: StorageAdapter | undefined;

    if (this.config.storage?.redis) {
      // 使用自定义 Redis 存储
      redisStore = this.config.storage.redis;
    } else if (isNode()) {
      // B-02/04 FIX: Node环境自动检测Redis配置
      const redisUrl = process.env.REDIS_URL || 
                       process.env.UPSTASH_REDIS_REST_URL || 
                       process.env.KV_REST_API_URL;
      if (redisUrl) {
        // B-02/04 FIX: 创建RedisStore实例
        console.log(`[TSA] Detected Redis URL: ${redisUrl.substring(0, 20)}...`);
        redisStore = new RedisStore();
        console.log('[TSA] RedisStore instance created');
      }
    }

    if (this.config.storage?.indexedDB) {
      // 使用自定义 IndexedDB 存储
      indexedDBStore = this.config.storage.indexedDB;
    } else if (isBrowser()) {
      // 浏览器环境：创建默认 IndexedDB 存储
      indexedDBStore = new IndexedDBStore({
        dbName: 'hajimi-tsa',
        storeName: 'storage',
        dbVersion: 1,
        enableCleanup: true,
        cleanupIntervalMs: 60000,
      });
    }

    this.fallbackManager = new TieredFallback(
      redisStore,
      indexedDBStore,
      fallbackConfig
    );

    // 注册事件处理器
    this.fallbackManager.on('failover', (event) => {
      console.warn(`[TSA] Storage failover: ${event.fromTier} → ${event.toTier}, reason: ${event.reason}`);
    });

    this.fallbackManager.on('recover', (event) => {
      console.info(`[TSA] Storage recovered: ${event.fromTier} → ${event.toTier}`);
    });

    this.fallbackManager.on('error', (event) => {
      console.error(`[TSA] Storage error: ${event.reason}`, event.error);
    });
  }

  /**
   * 初始化 TSA
   * 启动生命周期管理和监控，以及三层韧性存储
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // FIX: 如果 fallbackManager 不存在（如 destroy 后），重新初始化
    if (!this.fallbackManager) {
      this.initializeFallbackManager();
    }

    // B-05/09: 初始化三层韧性存储
    if (this.fallbackManager) {
      const initialized = await this.fallbackManager.initialize();
      if (initialized) {
        console.log(`[TSA] TieredFallback initialized, current tier: ${this.fallbackManager.currentTierName}`);
      } else {
        console.warn('[TSA] TieredFallback initialization failed, falling back to memory-only mode');
      }
    }

    // 启动生命周期管理
    this.lifecycleManager.start();
    
    // 注册生命周期事件处理器
    this.lifecycleManager.on('cleanup', (event) => {
      console.log(`[TSA] Cleaned up expired data: ${event.key} from ${event.fromTier}`);
    });

    this.lifecycleManager.on('promotion', (event) => {
      console.log(`[TSA] Promoted: ${event.key} from ${event.fromTier} to ${event.toTier}`);
    });

    this.lifecycleManager.on('demotion', (event) => {
      console.log(`[TSA] Demoted: ${event.key} from ${event.fromTier} to ${event.toTier}`);
    });

    this.initialized = true;
    console.log('[TSA] Initialized successfully');
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * B-05/09: 获取当前存储层信息
   */
  getCurrentStorageTier(): { level: TierLevel; name: string } | null {
    if (!this.fallbackManager) {
      return null;
    }
    return {
      level: this.fallbackManager.currentTierLevel,
      name: this.fallbackManager.currentTierName,
    };
  }

  /**
   * B-05/09: 获取所有存储层状态
   */
  getStorageTierStatuses(): TierStatus[] {
    if (!this.fallbackManager) {
      return [];
    }
    return this.fallbackManager.getTierStatuses();
  }

  /**
   * 获取数据
   * B-05/09: 支持三层降级读取
   */
  async get<T>(key: string): Promise<T | null> {
    const startTime = performance.now();
    
    // B-05/09: 优先从三层韧性存储读取
    if (this.fallbackManager) {
      const value = await this.fallbackManager.get<T>(key);
      if (value !== null) {
        // 如果找到，同时更新内存缓存
        const item = this.stores.get(key);
        if (item) {
          item.lastAccessed = Date.now();
          item.accessCount++;
        }
        this.monitor.recordRead('staging', true, performance.now() - startTime);
        return value;
      }
    }
    
    const item = this.stores.get(key);
    
    if (item === undefined) {
      this.monitor.recordRead('staging', false, performance.now() - startTime);
      return null;
    }

    // 检查是否过期
    if (this.isItemExpired(item)) {
      this.stores.delete(key);
      this.updateMonitorSize();
      this.monitor.recordRead(item.tier, false, performance.now() - startTime);
      return null;
    }

    // 更新访问统计
    item.lastAccessed = Date.now();
    item.accessCount++;

    const responseTime = performance.now() - startTime;
    this.monitor.recordRead(item.tier, true, responseTime);

    return item.value as T;
  }

  /**
   * 设置数据
   * B-05/09: 支持三层降级写入
   */
  async set<T>(key: string, value: T, options?: StorageOptions): Promise<void> {
    const startTime = performance.now();
    
    const tier = this.parseTier(options?.tier ?? 'STAGING');
    const now = Date.now();

    const item: StorageItem<T> = {
      value,
      tier,
      timestamp: now,
      lastAccessed: now,
      accessCount: 0,
      ttl: options?.ttl,
    };

    // B-05/09: 写入三层韧性存储（保证持久化）
    if (this.fallbackManager) {
      try {
        await this.fallbackManager.set(key, value, {
          ttl: options?.ttl,
        });
      } catch (error) {
        console.warn('[TSA] Failed to persist to fallback storage:', error);
      }
    }

    this.stores.set(key, item as StorageItem<unknown>);
    
    this.updateMonitorSize();
    
    const responseTime = performance.now() - startTime;
    this.monitor.recordWrite(tier, responseTime);
  }

  /**
   * 删除数据
   * B-05/09: 同时从三层韧性存储删除
   */
  async delete(key: string): Promise<void> {
    // B-05/09: 从三层韧性存储删除
    if (this.fallbackManager) {
      try {
        await this.fallbackManager.delete(key);
      } catch (error) {
        console.warn('[TSA] Failed to delete from fallback storage:', error);
      }
    }

    this.stores.delete(key);
    this.updateMonitorSize();
  }

  /**
   * 清空所有数据
   * B-05/09: 同时清空三层韧性存储
   * B-01/09 FIX: 确保已初始化再执行清空
   */
  async clear(): Promise<void> {
    // FIX: 先确保TSA已初始化
    if (!this.initialized) {
      await this.init();
    }
    
    // B-05/09: 清空三层韧性存储
    if (this.fallbackManager) {
      try {
        await this.fallbackManager.clear();
      } catch (error) {
        console.warn('[TSA] Failed to clear fallback storage:', error);
      }
    }

    this.stores.clear();
    this.updateMonitorSize();
  }

  /**
   * 手动迁移数据
   */
  async migrate(key: string, fromTier: StorageTier, toTier: StorageTier): Promise<MigrationResult> {
    const item = this.stores.get(key);
    
    if (!item) {
      return {
        success: false,
        fromTier: TierMigration.toTier(fromTier),
        toTier: TierMigration.toTier(toTier),
        key,
        message: 'Key not found',
      };
    }

    const currentTier = TierMigration.toStorageTier(item.tier);
    if (currentTier !== fromTier) {
      return {
        success: false,
        fromTier: TierMigration.toTier(fromTier),
        toTier: TierMigration.toTier(toTier),
        key,
        message: `Data is in ${currentTier}, not ${fromTier}`,
      };
    }

    const targetTier = TierMigration.toTier(toTier);
    const result = this.migrationManager.migrate(key, item.value, item.tier, targetTier);

    if (result.success) {
      item.tier = targetTier;
      this.stores.set(key, item);
      this.updateMonitorSize();
    }

    return result;
  }

  /**
   * 清理过期数据
   * B-05/09: 同时清理三层韧性存储
   */
  async cleanup(): Promise<CleanupResult> {
    const result: CleanupResult = {
      cleaned: 0,
      expired: [],
      errors: [],
    };

    // B-05/09: 清理三层韧性存储
    if (this.fallbackManager) {
      try {
        const fallbackCleaned = await this.fallbackManager.cleanup();
        if (fallbackCleaned > 0) {
          console.log(`[TSA] Fallback storage cleaned up ${fallbackCleaned} expired items`);
        }
      } catch (error) {
        console.warn('[TSA] Failed to cleanup fallback storage:', error);
      }
    }

    const entriesToDelete: string[] = [];

    for (const [key, item] of this.stores.entries()) {
      if (this.isItemExpired(item)) {
        entriesToDelete.push(key);
      }
    }

    for (const key of entriesToDelete) {
      try {
        const item = this.stores.get(key);
        if (item) {
          this.stores.delete(key);
          this.monitor.recordEviction(item.tier);
          result.expired.push(key);
          result.cleaned++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Failed to delete ${key}: ${errorMsg}`);
      }
    }

    if (result.cleaned > 0) {
      this.updateMonitorSize();
    }

    return result;
  }

  /**
   * 获取监控指标
   */
  getMetrics(): TSAMetrics {
    return this.monitor.getMetrics();
  }

  /**
   * 获取监控器实例（用于高级操作）
   */
  getMonitor(): TSAMonitor {
    return this.monitor;
  }

  /**
   * 获取迁移管理器实例（用于高级操作）
   */
  getMigrationManager(): TierMigration {
    return this.migrationManager;
  }

  /**
   * 获取生命周期管理器实例（用于高级操作）
   */
  getLifecycleManager(): LifecycleManager {
    return this.lifecycleManager;
  }

  /**
   * B-05/09: 获取三层韧性管理器实例
   */
  getFallbackManager(): TieredFallback | undefined {
    return this.fallbackManager;
  }

  /**
   * 获取所有键（用于调试）
   */
  keys(): string[] {
    return Array.from(this.stores.keys());
  }

  /**
   * 获取存储统计
   */
  getStats(): {
    total: number;
    transient: number;
    staging: number;
    archive: number;
  } {
    const stats = { total: 0, transient: 0, staging: 0, archive: 0 };
    
    for (const item of this.stores.values()) {
      stats.total++;
      stats[item.tier]++;
    }

    return stats;
  }

  /**
   * 销毁 TSA
   * 清理所有定时器和资源
   */
  async destroy(): Promise<void> {
    this.lifecycleManager.destroy();
    
    // B-05/09: 关闭三层韧性存储
    if (this.fallbackManager) {
      await this.fallbackManager.close();
      // FIX: 清除 fallbackManager 引用，下次 init 时重新创建
      this.fallbackManager = undefined;
    }
    
    this.stores.clear();
    this.initialized = false;
    console.log('[TSA] Destroyed');
  }

  /**
   * 解析存储层类型
   */
  private parseTier(tier: StorageTier): Tier {
    switch (tier) {
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
   * 检查数据项是否过期
   */
  private isItemExpired(item: StorageItem<unknown>): boolean {
    // 首先检查自定义 TTL
    if (item.ttl !== undefined && item.ttl > 0) {
      return Date.now() - item.timestamp > item.ttl;
    }

    // 使用迁移策略检查过期
    const dataEntry: DataEntry = {
      key: '',
      value: item.value,
      tier: item.tier,
      timestamp: item.timestamp,
      lastAccessed: item.lastAccessed,
      accessCount: item.accessCount,
    };

    return this.migrationManager.isExpired(dataEntry);
  }

  /**
   * 更新监控器中的存储层大小
   */
  private updateMonitorSize(): void {
    const stats = this.getStats();
    this.monitor.updateSize('transient', stats.transient);
    this.monitor.updateSize('staging', stats.staging);
    this.monitor.updateSize('archive', stats.archive);
  }
}

// ==================== 导出类型和类 ====================

export { TSAMonitor } from './monitor/TSAMonitor';
export type { TSAMetrics, TierMetrics } from './monitor/TSAMonitor';
export { TierMigration, DEFAULT_MIGRATION_POLICY } from './migration/TierMigration';
export type { MigrationConfig, MigrationResult, Tier, DataEntry } from './migration/TierMigration';
export { LifecycleManager, DEFAULT_LIFECYCLE_CONFIG } from './lifecycle/LifecycleManager';
export type { LifecycleConfig, CleanupResult, MigrationReport, LifecycleEvent, LifecycleEventType } from './lifecycle/LifecycleManager';

// B-05/09: 导出环境检测工具
export { isBrowser, isNode };

// 导出单例实例
export const tsa = new TieredStorageArchitecture();
export default tsa;
