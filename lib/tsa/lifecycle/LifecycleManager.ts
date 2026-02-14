/**
 * TSA (Tiered Storage Architecture) 生命周期管理器
 * 
 * 功能：
 * - 定期清理过期数据
 * - 数据晋升/降级（Transient→Staging→Archive）
 * - TTL机制、LRU淘汰
 * - 生命周期事件钩子
 * - 触发频率配置
 */

import { Tier, DataEntry, TierMigration, MigrationConfig } from '../migration/TierMigration';
import TSAMonitor from '../monitor/TSAMonitor';
import { 
  TTLManager, 
  TTLConfig 
} from './TTLManager';
import { 
  LRUManager, 
  LRUConfig 
} from './LRUManager';
import { 
  HookManager, 
  HookConfig 
} from './HookManager';
import {
  ExtendedLifecycleConfig,
  DEFAULT_EXTENDED_LIFECYCLE_CONFIG,
  TTLScanResult,
  LRUEvictionResult,
  HookExecutionResult,
  LifecycleHookType,
  LifecycleHook,
  PersistContext,
  RestoreContext,
  EvictContext,
  ErrorContext,
  ExpireContext,
  AccessContext,
  MigrateContext,
} from './types';

// ============================================================================
// 配置接口
// ============================================================================

export interface LifecycleConfig {
  /** 清理间隔（毫秒），默认 60 秒 */
  cleanupInterval: number;
  /** 迁移检查间隔（毫秒），默认 30 秒 */
  migrationInterval: number;
  /** 是否启用自动清理 */
  enableAutoCleanup: boolean;
  /** 是否启用自动迁移 */
  enableAutoMigration: boolean;
  /** 单次最大清理数量 */
  maxCleanupPerRun: number;
  /** 单次最大迁移数量 */
  maxMigrationPerRun: number;
}

export const DEFAULT_LIFECYCLE_CONFIG: LifecycleConfig = {
  cleanupInterval: 60 * 1000, // 60 秒
  migrationInterval: 30 * 1000, // 30 秒
  enableAutoCleanup: true,
  enableAutoMigration: true,
  maxCleanupPerRun: 100,
  maxMigrationPerRun: 50,
};

// ============================================================================
// 结果接口
// ============================================================================

export interface CleanupResult {
  cleaned: number;
  expired: string[];
  errors: string[];
  /** TTL扫描结果 */
  ttlResult?: TTLScanResult;
}

export interface MigrationReport {
  promoted: number;
  demoted: number;
  promotedKeys: string[];
  demotedKeys: string[];
  errors: string[];
}

export type LifecycleEventType = 'cleanup' | 'promotion' | 'demotion' | 'eviction' | 'expire' | 'lru_evict';

export interface LifecycleEvent {
  type: LifecycleEventType;
  key: string;
  fromTier?: Tier;
  toTier?: Tier;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export type LifecycleEventHandler = (event: LifecycleEvent) => void;

// ============================================================================
// 生命周期管理器
// ============================================================================

export class LifecycleManager {
  private config: LifecycleConfig;
  private extendedConfig: ExtendedLifecycleConfig;
  private migrationManager: TierMigration;
  private monitor: TSAMonitor;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private migrationTimer: NodeJS.Timeout | null = null;
  private scanTimer: NodeJS.Timeout | null = null;
  private eventHandlers: Map<LifecycleEventType, Set<LifecycleEventHandler>>;
  private isRunning: boolean = false;

  // 子管理器
  private ttlManager: TTLManager;
  private lruManager: LRUManager;
  private hookManager: HookManager;

  constructor(
    migrationManager: TierMigration,
    monitor: TSAMonitor,
    config?: Partial<LifecycleConfig>,
    extendedConfig?: Partial<ExtendedLifecycleConfig>
  ) {
    this.config = { ...DEFAULT_LIFECYCLE_CONFIG, ...config };
    this.extendedConfig = { ...DEFAULT_EXTENDED_LIFECYCLE_CONFIG, ...extendedConfig };
    this.migrationManager = migrationManager;
    this.monitor = monitor;
    this.eventHandlers = new Map();

    // 初始化事件处理器集合
    const eventTypes: LifecycleEventType[] = ['cleanup', 'promotion', 'demotion', 'eviction', 'expire', 'lru_evict'];
    for (const type of eventTypes) {
      this.eventHandlers.set(type, new Set());
    }

    // 初始化子管理器
    this.ttlManager = new TTLManager({
      policy: this.extendedConfig.ttlPolicy,
      migrationPolicy: this.migrationManager.getConfig().policy,
      onExpire: (context) => this.handleExpire(context),
    });

    this.lruManager = new LRUManager({
      policy: this.extendedConfig.lruPolicy,
      onEvict: (context) => this.handleEvict(context),
    });

    this.hookManager = new HookManager({
      timeout: 5000,
      continueOnError: true,
      parallel: false,
    });

    // 注册扩展配置中的钩子
    this.registerExtendedHooks();
  }

  // ============================================================================
  // 生命周期控制
  // ============================================================================

  /**
   * 启动生命周期管理
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    if (this.config.enableAutoCleanup) {
      this.scheduleCleanup();
    }

    if (this.config.enableAutoMigration) {
      this.scheduleMigration();
    }

    if (this.extendedConfig.enableAutoScan) {
      this.scheduleScan();
    }
  }

  /**
   * 停止生命周期管理
   */
  stop(): void {
    this.isRunning = false;

    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.migrationTimer) {
      clearTimeout(this.migrationTimer);
      this.migrationTimer = null;
    }

    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
  }

  /**
   * 是否正在运行
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * 更新配置
   */
  updateConfig(
    config?: Partial<LifecycleConfig>,
    extendedConfig?: Partial<ExtendedLifecycleConfig>
  ): void {
    const wasRunning = this.isRunning;

    if (wasRunning) {
      this.stop();
    }

    if (config) {
      this.config = { ...this.config, ...config };
    }

    if (extendedConfig) {
      this.extendedConfig = { ...this.extendedConfig, ...extendedConfig };

      // 更新子管理器配置
      if (extendedConfig.ttlPolicy) {
        this.ttlManager.updatePolicy(extendedConfig.ttlPolicy);
      }
      if (extendedConfig.lruPolicy) {
        this.lruManager.updatePolicy(extendedConfig.lruPolicy);
      }
      if (extendedConfig.hooks) {
        this.registerExtendedHooks();
      }
    }

    if (wasRunning) {
      this.start();
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): LifecycleConfig {
    return { ...this.config };
  }

  /**
   * 获取扩展配置
   */
  getExtendedConfig(): ExtendedLifecycleConfig {
    return { ...this.extendedConfig };
  }

  // ============================================================================
  // TTL 功能
  // ============================================================================

  /**
   * 获取 TTL 管理器
   */
  getTTLManager(): TTLManager {
    return this.ttlManager;
  }

  /**
   * 设置条目 TTL
   */
  setTTL(key: string, ttl: number): void {
    this.ttlManager.setTTL(key, ttl);
  }

  /**
   * 获取条目 TTL
   */
  getTTL(key: string, tier?: Tier): number {
    return this.ttlManager.getTTL(key, tier);
  }

  /**
   * 检查条目是否过期
   */
  isExpired(entry: DataEntry, customTTL?: number): boolean {
    return this.ttlManager.isExpired(entry, customTTL);
  }

  /**
   * 扫描并清理过期条目
   */
  async scanAndCleanup<T>(
    entries: DataEntry<T>[],
    deleteEntry?: (key: string) => void
  ): Promise<TTLScanResult> {
    return this.ttlManager.scanExpired(entries, {
      maxScan: this.extendedConfig.maxScanPerRun,
      deleteEntry,
    });
  }

  // ============================================================================
  // LRU 功能
  // ============================================================================

  /**
   * 获取 LRU 管理器
   */
  getLRUManager(): LRUManager {
    return this.lruManager;
  }

  /**
   * 记录访问
   */
  recordAccess(key: string): void {
    this.lruManager.recordAccess(key);
  }

  /**
   * 检查内存压力
   */
  checkMemoryPressure(currentEntries?: number): ReturnType<LRUManager['checkMemoryPressure']> {
    return this.lruManager.checkMemoryPressure(currentEntries);
  }

  /**
   * 执行 LRU 淘汰
   */
  async performLRUEviction<T>(
    entries: DataEntry<T>[],
    options?: {
      count?: number;
      reason?: EvictContext['reason'];
      deleteEntry?: (key: string) => void;
    }
  ): Promise<LRUEvictionResult> {
    return this.lruManager.evict(entries, options);
  }

  /**
   * 选择要淘汰的条目
   */
  selectForEviction<T>(entries: DataEntry<T>[], count: number): DataEntry<T>[] {
    return this.lruManager.selectForEviction(entries, count);
  }

  // ============================================================================
  // 钩子功能
  // ============================================================================

  /**
   * 获取钩子管理器
   */
  getHookManager(): HookManager {
    return this.hookManager;
  }

  /**
   * 注册生命周期钩子
   */
  onHook<T>(type: LifecycleHookType, hook: LifecycleHook<T>): () => void {
    return this.hookManager.register(type, hook);
  }

  /**
   * 批量注册钩子
   */
  batchOnHooks(hooks: Partial<Record<LifecycleHookType, LifecycleHook>>): () => void {
    return this.hookManager.batchRegister(hooks);
  }

  /**
   * 触发钩子
   */
  async emitHook<T>(type: LifecycleHookType, context: T): Promise<HookExecutionResult[]> {
    return this.hookManager.emit(type, context);
  }

  /**
   * 便捷方法：onPersist
   */
  onPersist(hook: LifecycleHook<PersistContext>): () => void {
    return this.onHook('onPersist', hook);
  }

  /**
   * 便捷方法：onRestore
   */
  onRestore(hook: LifecycleHook<RestoreContext>): () => void {
    return this.onHook('onRestore', hook);
  }

  /**
   * 便捷方法：onEvict
   */
  onEvict(hook: LifecycleHook<EvictContext>): () => void {
    return this.onHook('onEvict', hook);
  }

  /**
   * 便捷方法：onError
   */
  onError(hook: LifecycleHook<ErrorContext>): () => void {
    return this.onHook('onError', hook);
  }

  /**
   * 便捷方法：onExpire
   */
  onExpire(hook: LifecycleHook<ExpireContext>): () => void {
    return this.onHook('onExpire', hook);
  }

  /**
   * 便捷方法：onAccess
   */
  onAccess(hook: LifecycleHook<AccessContext>): () => void {
    return this.onHook('onAccess', hook);
  }

  /**
   * 便捷方法：onMigrate
   */
  onMigrate(hook: LifecycleHook<MigrateContext>): () => void {
    return this.onHook('onMigrate', hook);
  }

  // ============================================================================
  // 事件系统
  // ============================================================================

  /**
   * 注册事件处理器（传统事件）
   */
  on(event: LifecycleEventType, handler: LifecycleEventHandler): () => void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.add(handler);
    }

    // 返回取消订阅函数
    return () => {
      handlers?.delete(handler);
    };
  }

  /**
   * 触发事件
   */
  private emit(event: LifecycleEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`Lifecycle event handler error: ${error}`);
        }
      }
    }
  }

  // ============================================================================
  // 清理和迁移
  // ============================================================================

  /**
   * 执行清理（公开方法供外部调用）
   */
  async performCleanup(getEntries?: () => DataEntry[], deleteEntry?: (key: string) => void): Promise<CleanupResult> {
    const result: CleanupResult = {
      cleaned: 0,
      expired: [],
      errors: [],
    };

    if (!getEntries || !deleteEntry) {
      // 如果没有提供操作函数，仅返回空结果
      // 实际清理由 TSA 主模块调用
      return result;
    }

    try {
      const entries = getEntries();

      // 1. TTL 过期清理
      const ttlResult = await this.scanAndCleanup(entries, (key) => {
        deleteEntry(key);
        const entry = entries.find(e => e.key === key);
        if (entry) {
          this.monitor?.recordEviction(entry.tier);
        }
      });

      result.ttlResult = ttlResult;
      result.expired.push(...ttlResult.expired);
      result.cleaned += ttlResult.cleaned;
      result.errors.push(...ttlResult.errors);

      // 2. 传统过期检查（兼容性）
      let cleaned = 0;
      for (const entry of entries) {
        if (cleaned >= this.config.maxCleanupPerRun) {
          break;
        }

        // 跳过已处理的
        if (result.expired.includes(entry.key)) {
          continue;
        }

        if (this.migrationManager.isExpired(entry)) {
          try {
            deleteEntry(entry.key);
            cleaned++;
            result.expired.push(entry.key);
            this.monitor?.recordEviction(entry.tier);

            this.emit({
              type: 'cleanup',
              key: entry.key,
              fromTier: entry.tier,
              timestamp: Date.now(),
            });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            result.errors.push(`Failed to delete ${entry.key}: ${errorMsg}`);
          }
        }
      }

      result.cleaned += cleaned;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Cleanup failed: ${errorMsg}`);
    }

    return result;
  }

  /**
   * 执行迁移（公开方法供外部调用）
   */
  async performMigration(
    getEntries?: () => DataEntry[],
    migrateEntry?: (key: string, toTier: Tier) => void
  ): Promise<MigrationReport> {
    const report: MigrationReport = {
      promoted: 0,
      demoted: 0,
      promotedKeys: [],
      demotedKeys: [],
      errors: [],
    };

    if (!getEntries || !migrateEntry) {
      return report;
    }

    try {
      const entries = getEntries();

      // 按层分组统计大小
      const tierSizes = {
        transient: entries.filter(e => e.tier === 'transient').length,
        staging: entries.filter(e => e.tier === 'staging').length,
        archive: entries.filter(e => e.tier === 'archive').length,
      };

      // 处理晋升（从 Archive -> Staging -> Transient）
      for (const entry of entries) {
        if (report.promoted + report.demoted >= this.config.maxMigrationPerRun) {
          break;
        }

        const promotionTier = this.migrationManager.getPromotionTier(entry.tier);
        if (promotionTier && this.migrationManager.shouldPromote(entry, tierSizes[promotionTier])) {
          try {
            migrateEntry(entry.key, promotionTier);
            report.promoted++;
            report.promotedKeys.push(entry.key);
            tierSizes[entry.tier]--;
            tierSizes[promotionTier]++;

            this.emit({
              type: 'promotion',
              key: entry.key,
              fromTier: entry.tier,
              toTier: promotionTier,
              timestamp: Date.now(),
            });

            // 触发迁移钩子
            await this.hookManager.onMigrate({
              key: entry.key,
              tier: promotionTier,
              timestamp: Date.now(),
              fromTier: entry.tier,
              toTier: promotionTier,
              value: entry.value,
            });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            report.errors.push(`Failed to promote ${entry.key}: ${errorMsg}`);
          }
          continue;
        }

        // 处理降级（从 Transient -> Staging -> Archive）
        const demotionTier = this.migrationManager.getDemotionTier(entry.tier);
        if (demotionTier && this.migrationManager.shouldDemote(entry, tierSizes[entry.tier])) {
          try {
            migrateEntry(entry.key, demotionTier);
            report.demoted++;
            report.demotedKeys.push(entry.key);
            tierSizes[entry.tier]--;
            tierSizes[demotionTier]++;

            this.emit({
              type: 'demotion',
              key: entry.key,
              fromTier: entry.tier,
              toTier: demotionTier,
              timestamp: Date.now(),
            });

            // 触发迁移钩子
            await this.hookManager.onMigrate({
              key: entry.key,
              tier: demotionTier,
              timestamp: Date.now(),
              fromTier: entry.tier,
              toTier: demotionTier,
              value: entry.value,
            });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            report.errors.push(`Failed to demote ${entry.key}: ${errorMsg}`);
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      report.errors.push(`Migration failed: ${errorMsg}`);
    }

    return report;
  }

  // ============================================================================
  // 统计信息
  // ============================================================================

  /**
   * 获取完整统计信息
   */
  getStats(): {
    config: LifecycleConfig;
    extendedConfig: ExtendedLifecycleConfig;
    ttl: ReturnType<TTLManager['getStats']>;
    lru: ReturnType<LRUManager['getStats']>;
    hooks: {
      totalHooks: number;
    };
    isRunning: boolean;
  } {
    return {
      config: this.getConfig(),
      extendedConfig: this.getExtendedConfig(),
      ttl: this.ttlManager.getStats(),
      lru: this.lruManager.getStats(),
      hooks: {
        totalHooks: this.hookManager.getHookCount(),
      },
      isRunning: this.isRunning,
    };
  }

  // ============================================================================
  // 销毁
  // ============================================================================

  /**
   * 销毁生命周期管理器
   */
  destroy(): void {
    this.stop();

    // 清除所有事件处理器
    for (const handlers of this.eventHandlers.values()) {
      handlers.clear();
    }
    this.eventHandlers.clear();

    // 清除所有钩子
    this.hookManager.clear();

    // 重置访问记录
    this.lruManager.resetAccessRecords();

    // 清除自定义 TTL
    this.ttlManager.clearAllCustomTTLs();
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 调度清理任务
   */
  private scheduleCleanup(): void {
    if (!this.isRunning) return;

    this.cleanupTimer = setTimeout(async () => {
      try {
        // 清理由 TSA 主模块调用，这里只调度
      } catch (error) {
        console.error('Lifecycle cleanup error:', error);
      } finally {
        this.scheduleCleanup();
      }
    }, this.config.cleanupInterval);
  }

  /**
   * 调度迁移任务
   */
  private scheduleMigration(): void {
    if (!this.isRunning) return;

    this.migrationTimer = setTimeout(async () => {
      try {
        // 迁移由 TSA 主模块调用，这里只调度
      } catch (error) {
        console.error('Lifecycle migration error:', error);
      } finally {
        this.scheduleMigration();
      }
    }, this.config.migrationInterval);
  }

  /**
   * 调度扫描任务
   */
  private scheduleScan(): void {
    if (!this.isRunning) return;

    this.scanTimer = setTimeout(async () => {
      try {
        // 扫描由 TSA 主模块调用，这里只调度
      } catch (error) {
        console.error('Lifecycle scan error:', error);
      } finally {
        this.scheduleScan();
      }
    }, this.extendedConfig.scanInterval);
  }

  /**
   * 注册扩展配置中的钩子
   */
  private registerExtendedHooks(): void {
    const hooks = this.extendedConfig.hooks;
    if (!hooks) return;

    if (hooks.onPersist) this.hookManager.register('onPersist', hooks.onPersist);
    if (hooks.onRestore) this.hookManager.register('onRestore', hooks.onRestore);
    if (hooks.onEvict) this.hookManager.register('onEvict', hooks.onEvict);
    if (hooks.onError) this.hookManager.register('onError', hooks.onError);
    if (hooks.onExpire) this.hookManager.register('onExpire', hooks.onExpire);
    if (hooks.onAccess) this.hookManager.register('onAccess', hooks.onAccess);
    if (hooks.onMigrate) this.hookManager.register('onMigrate', hooks.onMigrate);
  }

  /**
   * 处理过期事件
   */
  private async handleExpire(context: ExpireContext): Promise<void> {
    this.emit({
      type: 'expire',
      key: context.key,
      fromTier: context.tier,
      timestamp: context.timestamp,
      metadata: { ttl: context.ttl },
    });

    // 同时触发钩子
    await this.hookManager.onExpire(context);
  }

  /**
   * 处理淘汰事件
   */
  private async handleEvict(context: EvictContext): Promise<void> {
    this.emit({
      type: 'lru_evict',
      key: context.key,
      fromTier: context.tier,
      timestamp: context.timestamp,
      metadata: { reason: context.reason },
    });

    // 同时触发钩子
    await this.hookManager.onEvict(context);
  }
}

export default LifecycleManager;
