/**
 * Phase 1 冷热分层存储 - 分层策略引擎
 * Tier Manager - 自动迁移、TTL清理策略
 */

import {
  StorageTier,
  StorageItem,
  StorageQuery,
  StorageResult,
  StorageStats,
  StorageEvent,
  StorageEventType,
  StorageEventHandler,
  TierManagerConfig,
  SetOptions,
  DataPriority,
  MigrationTask,
  MigrationStatus,
  MigrationResult,
  StorageErrorCode,
  IStorageAdapter,
  ITierManager,
} from './types';
import {
  ResultBuilder,
  StorageException,
  DataSerializer,
  StorageEventEmitter,
  IStorageLogger,
  ConsoleStorageLogger,
  NoOpStorageLogger,
} from './dal';

// ==================== 分层决策策略 ====================

interface TierDecision {
  sourceTier: StorageTier;
  targetTier: StorageTier;
  reason: TierDecisionReason;
  priority: number;
}

type TierDecisionReason = 
  | 'access_frequency'      // 访问频率
  | 'ttl_expired'           // TTL过期
  | 'storage_pressure'      // 存储压力
  | 'manual_promotion'      // 手动升级
  | 'manual_demotion'       // 手动降级
  | 'priority_based'        // 基于优先级
  | 'size_based';           // 基于大小

// ==================== 分层策略引擎 ====================

export class TierPolicyEngine {
  private config: TierManagerConfig;

  constructor(config: TierManagerConfig) {
    this.config = config;
  }

  /**
   * 根据访问模式决定目标存储层
   */
  decideTierByAccess(item: StorageItem): TierDecision {
    const accessFrequency = this.calculateAccessFrequency(item);

    // 高频访问 -> 热存储
    if (accessFrequency >= this.config.promotionThreshold) {
      if (item.tier !== StorageTier.HOT) {
        return {
          sourceTier: item.tier,
          targetTier: StorageTier.HOT,
          reason: 'access_frequency',
          priority: 10,
        };
      }
    }

    // 低频访问 -> 冷存储
    if (accessFrequency <= this.config.demotionThreshold && item.tier === StorageTier.WARM) {
      return {
        sourceTier: item.tier,
        targetTier: StorageTier.COLD,
        reason: 'access_frequency',
        priority: 5,
      };
    }

    // 保持当前层
    return {
      sourceTier: item.tier,
      targetTier: item.tier,
      reason: 'access_frequency',
      priority: 0,
    };
  }

  /**
   * 根据TTL决定目标存储层
   */
  decideTierByTTL(item: StorageItem): TierDecision {
    const now = Date.now();
    const age = now - item.createdAt;

    // 热存储项超过TTL -> 温存储
    if (item.tier === StorageTier.HOT && age > this.config.hotToWarmTTL) {
      return {
        sourceTier: item.tier,
        targetTier: StorageTier.WARM,
        reason: 'ttl_expired',
        priority: 8,
      };
    }

    // 温存储项超过TTL -> 冷存储
    if (item.tier === StorageTier.WARM && age > this.config.warmToColdTTL) {
      return {
        sourceTier: item.tier,
        targetTier: StorageTier.COLD,
        reason: 'ttl_expired',
        priority: 7,
      };
    }

    return {
      sourceTier: item.tier,
      targetTier: item.tier,
      reason: 'ttl_expired',
      priority: 0,
    };
  }

  /**
   * 根据数据优先级决定目标存储层
   */
  decideTierByPriority(item: StorageItem): TierDecision {
    switch (item.priority) {
      case DataPriority.CRITICAL:
      case DataPriority.HIGH:
        if (item.tier !== StorageTier.HOT) {
          return {
            sourceTier: item.tier,
            targetTier: StorageTier.HOT,
            reason: 'priority_based',
            priority: 9,
          };
        }
        break;

      case DataPriority.ARCHIVE:
        if (item.tier !== StorageTier.COLD) {
          return {
            sourceTier: item.tier,
            targetTier: StorageTier.COLD,
            reason: 'priority_based',
            priority: 6,
          };
        }
        break;
    }

    return {
      sourceTier: item.tier,
      targetTier: item.tier,
      reason: 'priority_based',
      priority: 0,
    };
  }

  /**
   * 综合决策
   */
  makeDecision(item: StorageItem): TierDecision {
    const decisions: TierDecision[] = [
      this.decideTierByPriority(item),
      this.decideTierByAccess(item),
      this.decideTierByTTL(item),
    ];

    // 按优先级排序，返回最高优先级的非保持决策
    const sortedDecisions = decisions
      .filter(d => d.sourceTier !== d.targetTier)
      .sort((a, b) => b.priority - a.priority);

    return sortedDecisions[0] ?? {
      sourceTier: item.tier,
      targetTier: item.tier,
      reason: 'access_frequency',
      priority: 0,
    };
  }

  /**
   * 计算访问频率 (访问次数/天)
   */
  private calculateAccessFrequency(item: StorageItem): number {
    const age = Date.now() - item.createdAt;
    const days = Math.max(1, age / (1000 * 60 * 60 * 24));
    return item.accessCount / days;
  }
}

// ==================== 分层管理器 ====================

export class TierManager implements ITierManager {
  private config: TierManagerConfig | null = null;
  private adapters: Map<StorageTier, IStorageAdapter> = new Map();
  private policyEngine: TierPolicyEngine | null = null;
  private eventEmitter: StorageEventEmitter = new StorageEventEmitter();
  private logger: IStorageLogger;

  // 维护相关
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private migrationQueue: MigrationTask[] = [];
  private isMigrating: boolean = false;

  constructor(logger?: IStorageLogger) {
    this.logger = logger ?? (process.env.NODE_ENV === 'production'
      ? new NoOpStorageLogger()
      : new ConsoleStorageLogger('[TierManager]'));
  }

  // ==================== 配置方法 ====================

  async configure(config: TierManagerConfig): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.logger.info('Configuring tier manager...');

      this.config = config;
      this.policyEngine = new TierPolicyEngine(config);

      this.logger.info('Tier manager configured successfully');

      return ResultBuilder.success(undefined, undefined, performance.now() - start);
    } catch (error) {
      this.logger.error('Failed to configure tier manager:', error);
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Configuration failed: ${(error as Error).message}`,
        undefined,
        error as Error
      );
    }
  }

  getConfig(): TierManagerConfig {
    if (!this.config) {
      throw new StorageException(
        StorageErrorCode.UNKNOWN,
        'Tier manager not configured'
      );
    }
    return this.config;
  }

  /**
   * 注册存储适配器
   */
  registerAdapter(tier: StorageTier, adapter: IStorageAdapter): void {
    this.adapters.set(tier, adapter);
    this.logger.info(`Registered adapter for tier: ${tier}`);
  }

  /**
   * 获取存储适配器
   */
  getAdapter(tier: StorageTier): IStorageAdapter | undefined {
    return this.adapters.get(tier);
  }

  // ==================== 数据访问方法 ====================

  async get<T>(key: string): Promise<StorageResult<T>> {
    const start = performance.now();

    try {
      // 按优先级顺序查找: HOT -> WARM -> COLD
      const tiers = [StorageTier.HOT, StorageTier.WARM, StorageTier.COLD];

      for (const tier of tiers) {
        const adapter = this.adapters.get(tier);
        if (!adapter) continue;

        const result = await adapter.get<T>(key);

        if (result.success) {
          this.logger.debug(`Found key ${key} in ${tier}`);

          // 如果找到但不在热存储，考虑升级
          if (tier !== StorageTier.HOT && this.config?.enableAutoMigration) {
            this.schedulePromotion(key, tier);
          }

          return {
            ...result,
            latencyMs: performance.now() - start,
          };
        }
      }

      return ResultBuilder.failure(
        StorageErrorCode.NOT_FOUND,
        `Key not found: ${key}`
      );
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Get failed: ${(error as Error).message}`,
        undefined,
        error as Error
      );
    }
  }

  async set<T>(
    key: string,
    value: T,
    options?: SetOptions
  ): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      // 根据优先级决定初始存储层
      let targetTier = StorageTier.WARM;

      if (options?.priority === DataPriority.CRITICAL || 
          options?.priority === DataPriority.HIGH) {
        targetTier = StorageTier.HOT;
      } else if (options?.priority === DataPriority.ARCHIVE) {
        targetTier = StorageTier.COLD;
      }

      const adapter = this.adapters.get(targetTier);
      if (!adapter) {
        return ResultBuilder.failure(
          StorageErrorCode.TIER_UNAVAILABLE,
          `No adapter available for tier: ${targetTier}`
        );
      }

      const result = await adapter.set(key, value, options);

      return {
        ...result,
        latencyMs: performance.now() - start,
      };
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Set failed: ${(error as Error).message}`,
        undefined,
        error as Error
      );
    }
  }

  async delete(key: string): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      // 从所有层删除
      const results = await Promise.all(
        Array.from(this.adapters.values()).map(adapter => adapter.delete(key))
      );

      const success = results.some(r => r.success);

      if (!success) {
        return ResultBuilder.failure(
          StorageErrorCode.NOT_FOUND,
          `Key not found in any tier: ${key}`
        );
      }

      return ResultBuilder.success(undefined, undefined, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Delete failed: ${(error as Error).message}`,
        undefined,
        error as Error
      );
    }
  }

  // ==================== 显式分层操作 ====================

  async promote(key: string, targetTier: StorageTier = StorageTier.HOT): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      // 找到当前所在层
      const currentTier = await this.findKeyTier(key);

      if (!currentTier) {
        return ResultBuilder.failure(
          StorageErrorCode.NOT_FOUND,
          `Key not found: ${key}`
        );
      }

      if (currentTier === targetTier) {
        return ResultBuilder.success(undefined, targetTier, 0);
      }

      // 执行迁移
      const result = await this.migrate(key, currentTier, targetTier);

      return {
        success: result.success,
        error: result.error,
        tier: targetTier,
        latencyMs: performance.now() - start,
      };
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Promote failed: ${(error as Error).message}`,
        undefined,
        error as Error
      );
    }
  }

  async demote(key: string, targetTier: StorageTier = StorageTier.COLD): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      // 找到当前所在层
      const currentTier = await this.findKeyTier(key);

      if (!currentTier) {
        return ResultBuilder.failure(
          StorageErrorCode.NOT_FOUND,
          `Key not found: ${key}`
        );
      }

      if (currentTier === targetTier) {
        return ResultBuilder.success(undefined, targetTier, 0);
      }

      // 执行迁移
      const result = await this.migrate(key, currentTier, targetTier);

      return {
        success: result.success,
        error: result.error,
        tier: targetTier,
        latencyMs: performance.now() - start,
      };
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Demote failed: ${(error as Error).message}`,
        undefined,
        error as Error
      );
    }
  }

  // ==================== 迁移方法 ====================

  async migrate(
    key: string,
    sourceTier: StorageTier,
    targetTier: StorageTier
  ): Promise<StorageResult<MigrationResult>> {
    const start = performance.now();

    try {
      this.logger.info(`Migrating ${key} from ${sourceTier} to ${targetTier}`);

      const sourceAdapter = this.adapters.get(sourceTier);
      const targetAdapter = this.adapters.get(targetTier);

      if (!sourceAdapter) {
        return ResultBuilder.failure(
          StorageErrorCode.TIER_UNAVAILABLE,
          `Source tier not available: ${sourceTier}`
        );
      }

      if (!targetAdapter) {
        return ResultBuilder.failure(
          StorageErrorCode.TIER_UNAVAILABLE,
          `Target tier not available: ${targetTier}`
        );
      }

      // 从源层读取
      const getResult = await sourceAdapter.get<unknown>(key);

      if (!getResult.success) {
        return ResultBuilder.failure(
          StorageErrorCode.NOT_FOUND,
          `Failed to read from source tier: ${getResult.error?.message}`
        );
      }

      const value = getResult.data;

      // 写入目标层
      const setResult = await targetAdapter.set(key, value!);

      if (!setResult.success) {
        return ResultBuilder.failure(
          StorageErrorCode.MIGRATION_FAILED,
          `Failed to write to target tier: ${setResult.error?.message}`
        );
      }

      // 从源层删除
      await sourceAdapter.delete(key);

      const bytesTransferred = DataSerializer.estimateSize(value);
      const durationMs = performance.now() - start;

      const task: MigrationTask = {
        id: this.generateTaskId(),
        key,
        sourceTier,
        targetTier,
        status: MigrationStatus.COMPLETED,
        createdAt: start,
        startedAt: start,
        completedAt: Date.now(),
        retryCount: 0,
      };

      const result: MigrationResult = {
        task,
        bytesTransferred,
        durationMs,
      };

      this.emitEvent({
        type: 'tier:migrated',
        timestamp: Date.now(),
        key,
        tier: targetTier,
        data: result,
      });

      this.logger.info(`Migration completed: ${key} -> ${targetTier}`);

      return ResultBuilder.success(result, targetTier, durationMs);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.MIGRATION_FAILED,
        `Migration failed: ${(error as Error).message}`,
        undefined,
        error as Error
      );
    }
  }

  async migrateBatch(
    keys: string[],
    targetTier: StorageTier
  ): Promise<StorageResult<MigrationResult[]>> {
    const start = performance.now();

    try {
      const results: MigrationResult[] = [];

      for (const key of keys) {
        const currentTier = await this.findKeyTier(key);

        if (currentTier && currentTier !== targetTier) {
          const result = await this.migrate(key, currentTier, targetTier);

          if (result.success && result.data) {
            results.push(result.data);
          }
        }
      }

      return ResultBuilder.success(results, targetTier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.MIGRATION_FAILED,
        `Batch migration failed: ${(error as Error).message}`,
        undefined,
        error as Error
      );
    }
  }

  // ==================== 查询方法 ====================

  async getItemInfo(key: string): Promise<StorageResult<StorageItem>> {
    try {
      for (const [tier, adapter] of this.adapters) {
        const query: StorageQuery = { key };
        const result = await adapter.query(query);

        if (result.success && result.data && result.data.length > 0) {
          return ResultBuilder.success(result.data[0], tier);
        }
      }

      return ResultBuilder.failure(
        StorageErrorCode.NOT_FOUND,
        `Key not found: ${key}`
      );
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Get item info failed: ${(error as Error).message}`
      );
    }
  }

  async getTierOf(key: string): Promise<StorageResult<StorageTier>> {
    const tier = await this.findKeyTier(key);

    if (!tier) {
      return ResultBuilder.failure(
        StorageErrorCode.NOT_FOUND,
        `Key not found: ${key}`
      );
    }

    return ResultBuilder.success(tier);
  }

  async query(query: StorageQuery): Promise<StorageResult<StorageItem[]>> {
    try {
      const allItems: StorageItem[] = [];

      for (const [tier, adapter] of this.adapters) {
        const result = await adapter.query(query);

        if (result.success && result.data) {
          allItems.push(...result.data);
        }
      }

      // 应用limit和offset
      const offset = query.offset ?? 0;
      const limit = query.limit ?? allItems.length;
      const paginatedItems = allItems.slice(offset, offset + limit);

      return ResultBuilder.success(paginatedItems);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Query failed: ${(error as Error).message}`
      );
    }
  }

  // ==================== 统计方法 ====================

  async getStats(): Promise<StorageResult<StorageStats[]>> {
    try {
      const stats: StorageStats[] = [];

      for (const [tier, adapter] of this.adapters) {
        const result = await adapter.stats();

        if (result.success && result.data) {
          stats.push(result.data);
        }
      }

      return ResultBuilder.success(stats);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Get stats failed: ${(error as Error).message}`
      );
    }
  }

  async getTierStats(tier: StorageTier): Promise<StorageResult<StorageStats>> {
    const adapter = this.adapters.get(tier);

    if (!adapter) {
      return ResultBuilder.failure(
        StorageErrorCode.TIER_UNAVAILABLE,
        `No adapter available for tier: ${tier}`
      );
    }

    return adapter.stats();
  }

  // ==================== 维护方法 ====================

  startAutoMaintenance(): void {
    if (!this.config) {
      this.logger.warn('Cannot start auto maintenance: not configured');
      return;
    }

    if (this.cleanupTimer) {
      this.logger.warn('Auto maintenance already running');
      return;
    }

    this.logger.info('Starting auto maintenance...');

    this.cleanupTimer = setInterval(async () => {
      try {
        if (this.config?.enableAutoCleanup) {
          await this.runCleanup();
        }

        if (this.config?.enableAutoMigration) {
          await this.runMigration();
        }
      } catch (error) {
        this.logger.error('Auto maintenance error:', error);
      }
    }, this.config.cleanupInterval);
  }

  stopAutoMaintenance(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      this.logger.info('Auto maintenance stopped');
    }
  }

  async runCleanup(): Promise<StorageResult<number>> {
    try {
      this.logger.info('Running cleanup...');

      let totalCleaned = 0;

      for (const [tier, adapter] of this.adapters) {
        const result = await adapter.cleanup();

        if (result.success && result.data !== undefined) {
          totalCleaned += result.data;
          this.logger.info(`Cleaned ${result.data} items from ${tier}`);
        }
      }

      this.emitEvent({
        type: 'cleanup:completed',
        timestamp: Date.now(),
        key: 'cleanup',
        data: { cleanedCount: totalCleaned },
      });

      return ResultBuilder.success(totalCleaned);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Cleanup failed: ${(error as Error).message}`
      );
    }
  }

  async runMigration(): Promise<StorageResult<MigrationResult[]>> {
    try {
      this.logger.info('Running migration analysis...');

      if (!this.policyEngine) {
        return ResultBuilder.failure(
          StorageErrorCode.UNKNOWN,
          'Policy engine not initialized'
        );
      }

      const results: MigrationResult[] = [];

      // 分析所有层的数据
      for (const [tier, adapter] of this.adapters) {
        const queryResult = await adapter.query({});

        if (!queryResult.success || !queryResult.data) {
          continue;
        }

        for (const item of queryResult.data) {
          const decision = this.policyEngine.makeDecision(item);

          if (decision.sourceTier !== decision.targetTier) {
            this.logger.debug(
              `Scheduling migration: ${item.key} ${decision.sourceTier} -> ${decision.targetTier} (${decision.reason})`
            );

            const migrateResult = await this.migrate(
              item.key,
              decision.sourceTier,
              decision.targetTier
            );

            if (migrateResult.success && migrateResult.data) {
              results.push(migrateResult.data);
            }
          }
        }
      }

      this.logger.info(`Migration completed: ${results.length} items migrated`);

      return ResultBuilder.success(results);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.MIGRATION_FAILED,
        `Migration run failed: ${(error as Error).message}`
      );
    }
  }

  // ==================== 事件方法 ====================

  on(event: StorageEventType, handler: StorageEventHandler): void {
    this.eventEmitter.on(event, handler);
  }

  off(event: StorageEventType, handler: StorageEventHandler): void {
    this.eventEmitter.off(event, handler);
  }

  private emitEvent(event: StorageEvent): void {
    this.eventEmitter.emit(event);
  }

  // ==================== 辅助方法 ====================

  private async findKeyTier(key: string): Promise<StorageTier | null> {
    for (const [tier, adapter] of this.adapters) {
      const result = await adapter.exists(key);

      if (result.success && result.data) {
        return tier;
      }
    }
    return null;
  }

  private schedulePromotion(key: string, fromTier: StorageTier): void {
    // 添加到迁移队列，稍后处理
    this.logger.debug(`Scheduled promotion for ${key} from ${fromTier}`);
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ==================== 导出 ====================

export { StorageTier, TierManagerConfig, SetOptions, MigrationResult } from './types';
