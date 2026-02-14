/**
 * Phase 1 冷热分层存储 - 数据迁移工具
 * Migration Tool - 热→冷迁移、批量迁移、数据导入导出
 */

import {
  StorageTier,
  StorageItem,
  StorageQuery,
  StorageResult,
  StorageErrorCode,
  MigrationTask,
  MigrationStatus,
  MigrationResult,
  IStorageAdapter,
  DataPriority,
} from './types';
import {
  ResultBuilder,
  StorageException,
  DataSerializer,
  IStorageLogger,
  ConsoleStorageLogger,
  NoOpStorageLogger,
} from './dal';

// ==================== 迁移配置 ====================

export interface MigrationConfig {
  // 批量迁移配置
  batchSize: number;
  concurrency: number;
  retryAttempts: number;
  retryDelay: number;

  // 进度回调
  onProgress?: (progress: MigrationProgress) => void;
  onItemMigrated?: (result: MigrationResult) => void;
  onError?: (error: Error, task: MigrationTask) => void;

  // 过滤配置
  filter?: {
    minAge?: number;           // 最小年龄(毫秒)
    maxAge?: number;           // 最大年龄(毫秒)
    minAccessCount?: number;   // 最小访问次数
    maxAccessCount?: number;   // 最大访问次数
    priorities?: DataPriority[];
  };
}

export interface MigrationProgress {
  totalItems: number;
  completedItems: number;
  failedItems: number;
  bytesTransferred: number;
  startTime: number;
  estimatedEndTime?: number;
  currentTask?: MigrationTask;
}

export interface MigrationReport {
  id: string;
  config: MigrationConfig;
  startTime: number;
  endTime: number;
  results: MigrationResult[];
  failedTasks: MigrationTask[];
  summary: {
    totalItems: number;
    successfulItems: number;
    failedItems: number;
    totalBytes: number;
    averageDuration: number;
  };
}

// ==================== 迁移工具类 ====================

export class MigrationTool {
  private adapters: Map<StorageTier, IStorageAdapter> = new Map();
  private logger: IStorageLogger;
  private activeMigrations: Map<string, AbortController> = new Map();

  constructor(logger?: IStorageLogger) {
    this.logger = logger ?? (process.env.NODE_ENV === 'production'
      ? new NoOpStorageLogger()
      : new ConsoleStorageLogger('[MigrationTool]'));
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

  // ==================== 单条迁移 ====================

  async migrateItem(
    key: string,
    sourceTier: StorageTier,
    targetTier: StorageTier,
    config?: Partial<MigrationConfig>
  ): Promise<StorageResult<MigrationResult>> {
    const start = performance.now();

    try {
      this.logger.info(`Migrating item: ${key} from ${sourceTier} to ${targetTier}`);

      const sourceAdapter = this.adapters.get(sourceTier);
      const targetAdapter = this.adapters.get(targetTier);

      if (!sourceAdapter) {
        throw new StorageException(
          StorageErrorCode.TIER_UNAVAILABLE,
          `Source tier not available: ${sourceTier}`
        );
      }

      if (!targetAdapter) {
        throw new StorageException(
          StorageErrorCode.TIER_UNAVAILABLE,
          `Target tier not available: ${targetTier}`
        );
      }

      // 创建迁移任务
      const task: MigrationTask = {
        id: this.generateTaskId(),
        key,
        sourceTier,
        targetTier,
        status: MigrationStatus.IN_PROGRESS,
        createdAt: start,
        startedAt: start,
        retryCount: 0,
      };

      // 从源层读取
      const getResult = await this.retryOperation(
        () => sourceAdapter.get<unknown>(key),
        config?.retryAttempts ?? 3,
        config?.retryDelay ?? 1000
      );

      if (!getResult.success) {
        task.status = MigrationStatus.FAILED;
        task.error = getResult.error;

        throw new StorageException(
          StorageErrorCode.MIGRATION_FAILED,
          `Failed to read from source tier: ${getResult.error?.message}`
        );
      }

      const value = getResult.data;
      const bytesTransferred = DataSerializer.estimateSize(value);

      // 写入目标层
      const setResult = await this.retryOperation(
        () => targetAdapter.set(key, value!, { keepTTL: true }),
        config?.retryAttempts ?? 3,
        config?.retryDelay ?? 1000
      );

      if (!setResult.success) {
        task.status = MigrationStatus.FAILED;
        task.error = setResult.error;

        throw new StorageException(
          StorageErrorCode.MIGRATION_FAILED,
          `Failed to write to target tier: ${setResult.error?.message}`
        );
      }

      // 从源层删除
      await sourceAdapter.delete(key);

      // 完成任务
      task.status = MigrationStatus.COMPLETED;
      task.completedAt = Date.now();

      const durationMs = performance.now() - start;

      const result: MigrationResult = {
        task,
        bytesTransferred,
        durationMs,
      };

      this.logger.info(`Migration completed: ${key} -> ${targetTier} (${bytesTransferred} bytes, ${durationMs.toFixed(2)}ms)`);

      return ResultBuilder.success(result, targetTier, durationMs);
    } catch (error) {
      this.logger.error(`Migration failed for ${key}:`, error);

      return ResultBuilder.failure(
        StorageErrorCode.MIGRATION_FAILED,
        `Migration failed: ${(error as Error).message}`,
        targetTier,
        error as Error
      );
    }
  }

  // ==================== 批量迁移 ====================

  async migrateBatch(
    keys: string[],
    sourceTier: StorageTier,
    targetTier: StorageTier,
    config: MigrationConfig
  ): Promise<StorageResult<MigrationReport>> {
    const reportId = this.generateReportId();
    const startTime = performance.now();

    this.logger.info(`Starting batch migration: ${keys.length} items from ${sourceTier} to ${targetTier}`);

    const results: MigrationResult[] = [];
    const failedTasks: MigrationTask[] = [];
    let bytesTransferred = 0;

    // 创建进度追踪
    const progress: MigrationProgress = {
      totalItems: keys.length,
      completedItems: 0,
      failedItems: 0,
      bytesTransferred: 0,
      startTime,
    };

    // 分批处理
    const batches = this.chunkArray(keys, config.batchSize);

    for (const batch of batches) {
      // 并发处理
      const batchPromises = batch.map(async (key) => {
        const result = await this.migrateItem(key, sourceTier, targetTier, config);

        if (result.success && result.data) {
          results.push(result.data);
          bytesTransferred += result.data.bytesTransferred;
          progress.completedItems++;
          progress.bytesTransferred += result.data.bytesTransferred;

          config.onItemMigrated?.(result.data);
        } else {
          progress.failedItems++;

          const failedTask: MigrationTask = {
            id: this.generateTaskId(),
            key,
            sourceTier,
            targetTier,
            status: MigrationStatus.FAILED,
            createdAt: startTime,
            error: result.error,
            retryCount: 0,
          };
          failedTasks.push(failedTask);

          config.onError?.(new Error(result.error?.message ?? 'Unknown error'), failedTask);
        }

        // 更新进度
        progress.currentTask = {
          id: this.generateTaskId(),
          key,
          sourceTier,
          targetTier,
          status: result.success ? MigrationStatus.COMPLETED : MigrationStatus.FAILED,
          createdAt: startTime,
          startedAt: startTime,
          completedAt: Date.now(),
          retryCount: 0,
        };

        const elapsed = Date.now() - startTime;
        const rate = progress.completedItems / (elapsed / 1000);
        progress.estimatedEndTime = startTime + (keys.length / rate) * 1000;

        config.onProgress?.(progress);
      });

      // 限制并发数
      await this.runWithConcurrency(batchPromises, config.concurrency);
    }

    const endTime = Date.now();

    const report: MigrationReport = {
      id: reportId,
      config,
      startTime,
      endTime,
      results,
      failedTasks,
      summary: {
        totalItems: keys.length,
        successfulItems: results.length,
        failedItems: failedTasks.length,
        totalBytes: bytesTransferred,
        averageDuration: results.length > 0 
          ? results.reduce((sum, r) => sum + r.durationMs, 0) / results.length 
          : 0,
      },
    };

    this.logger.info(`Batch migration completed: ${report.summary.successfulItems}/${report.summary.totalItems} items, ${report.summary.totalBytes} bytes`);

    return ResultBuilder.success(report, targetTier, endTime - startTime);
  }

  // ==================== 智能迁移 ====================

  async migrateByPolicy(
    sourceTier: StorageTier,
    targetTier: StorageTier,
    config: MigrationConfig
  ): Promise<StorageResult<MigrationReport>> {
    try {
      this.logger.info(`Starting policy-based migration from ${sourceTier} to ${targetTier}`);

      const sourceAdapter = this.adapters.get(sourceTier);

      if (!sourceAdapter) {
        return ResultBuilder.failure(
          StorageErrorCode.TIER_UNAVAILABLE,
          `Source tier not available: ${sourceTier}`
        );
      }

      // 查询所有数据
      const queryResult = await sourceAdapter.query({});

      if (!queryResult.success || !queryResult.data) {
        return ResultBuilder.failure(
          StorageErrorCode.UNKNOWN,
          `Failed to query source tier: ${queryResult.error?.message}`
        );
      }

      // 应用过滤器
      let items = queryResult.data;
      const now = Date.now();

      if (config.filter) {
        items = items.filter(item => {
          const age = now - item.createdAt;

          if (config.filter!.minAge !== undefined && age < config.filter!.minAge) {
            return false;
          }

          if (config.filter!.maxAge !== undefined && age > config.filter!.maxAge) {
            return false;
          }

          if (config.filter!.minAccessCount !== undefined && 
              item.accessCount < config.filter!.minAccessCount!) {
            return false;
          }

          if (config.filter!.maxAccessCount !== undefined && 
              item.accessCount > config.filter!.maxAccessCount!) {
            return false;
          }

          if (config.filter!.priorities !== undefined && 
              !config.filter!.priorities!.includes(item.priority)) {
            return false;
          }

          return true;
        });
      }

      this.logger.info(`Filtered ${items.length} items for migration`);

      // 执行批量迁移
      const keys = items.map(item => item.key);
      return this.migrateBatch(keys, sourceTier, targetTier, config);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.MIGRATION_FAILED,
        `Policy-based migration failed: ${(error as Error).message}`
      );
    }
  }

  // ==================== 热→冷归档 ====================

  async archiveToCold(
    options?: {
      olderThan?: number;        // 归档早于指定时间的数据
      maxItems?: number;         // 最大归档数量
      preserveInWarm?: boolean;  // 是否在温层保留副本
    }
  ): Promise<StorageResult<MigrationReport>> {
    try {
      this.logger.info('Starting archive to cold storage...');

      const hotAdapter = this.adapters.get(StorageTier.HOT);
      const warmAdapter = this.adapters.get(StorageTier.WARM);
      const coldAdapter = this.adapters.get(StorageTier.COLD);

      if (!hotAdapter || !warmAdapter || !coldAdapter) {
        return ResultBuilder.failure(
          StorageErrorCode.TIER_UNAVAILABLE,
          'Required storage tiers not available'
        );
      }

      const results: MigrationResult[] = [];
      const failedTasks: MigrationTask[] = [];
      const startTime = performance.now();
      let bytesTransferred = 0;

      // 第一步: HOT -> WARM
      this.logger.info('Step 1: Migrating from HOT to WARM...');

      const hotQuery: StorageQuery = {};
      if (options?.olderThan) {
        hotQuery.createdBefore = options.olderThan;
      }
      if (options?.maxItems) {
        hotQuery.limit = options.maxItems;
      }

      const hotItems = await hotAdapter.query(hotQuery);

      if (hotItems.success && hotItems.data) {
        for (const item of hotItems.data) {
          const result = await this.migrateItem(
            item.key,
            StorageTier.HOT,
            StorageTier.WARM,
            { batchSize: 1, concurrency: 1, retryAttempts: 3, retryDelay: 1000 }
          );

          if (result.success && result.data) {
            results.push(result.data);
            bytesTransferred += result.data.bytesTransferred;
          } else {
            failedTasks.push({
              id: this.generateTaskId(),
              key: item.key,
              sourceTier: StorageTier.HOT,
              targetTier: StorageTier.WARM,
              status: MigrationStatus.FAILED,
              createdAt: startTime,
              error: result.error,
              retryCount: 0,
            });
          }
        }
      }

      // 第二步: WARM -> COLD
      this.logger.info('Step 2: Migrating from WARM to COLD...');

      const warmQuery: StorageQuery = {};
      if (options?.olderThan) {
        warmQuery.createdBefore = options.olderThan;
      }

      const warmItems = await warmAdapter.query(warmQuery);

      if (warmItems.success && warmItems.data) {
        for (const item of warmItems.data) {
          const result = await this.migrateItem(
            item.key,
            StorageTier.WARM,
            StorageTier.COLD,
            { batchSize: 1, concurrency: 1, retryAttempts: 3, retryDelay: 1000 }
          );

          if (result.success && result.data) {
            results.push(result.data);
            bytesTransferred += result.data.bytesTransferred;
          } else {
            failedTasks.push({
              id: this.generateTaskId(),
              key: item.key,
              sourceTier: StorageTier.WARM,
              targetTier: StorageTier.COLD,
              status: MigrationStatus.FAILED,
              createdAt: startTime,
              error: result.error,
              retryCount: 0,
            });
          }
        }
      }

      const endTime = Date.now();

      const report: MigrationReport = {
        id: this.generateReportId(),
        config: { batchSize: 1, concurrency: 1, retryAttempts: 3, retryDelay: 1000 },
        startTime,
        endTime,
        results,
        failedTasks,
        summary: {
          totalItems: results.length + failedTasks.length,
          successfulItems: results.length,
          failedItems: failedTasks.length,
          totalBytes: bytesTransferred,
          averageDuration: results.length > 0 
            ? results.reduce((sum, r) => sum + r.durationMs, 0) / results.length 
            : 0,
        },
      };

      this.logger.info(`Archive completed: ${report.summary.successfulItems} items archived to cold storage`);

      return ResultBuilder.success(report, StorageTier.COLD, endTime - startTime);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.MIGRATION_FAILED,
        `Archive failed: ${(error as Error).message}`
      );
    }
  }

  // ==================== 数据导入导出 ====================

  async exportToJSON(
    tier: StorageTier,
    query?: StorageQuery
  ): Promise<StorageResult<string>> {
    try {
      const adapter = this.adapters.get(tier);

      if (!adapter) {
        return ResultBuilder.failure(
          StorageErrorCode.TIER_UNAVAILABLE,
          `Tier not available: ${tier}`
        );
      }

      const result = await adapter.query(query ?? {});

      if (!result.success || !result.data) {
        return ResultBuilder.failure(
          StorageErrorCode.UNKNOWN,
          `Query failed: ${result.error?.message}`
        );
      }

      const exportData = {
        tier,
        exportedAt: Date.now(),
        items: result.data,
      };

      const json = JSON.stringify(exportData, null, 2);

      this.logger.info(`Exported ${result.data.length} items from ${tier}`);

      return ResultBuilder.success(json);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Export failed: ${(error as Error).message}`
      );
    }
  }

  async importFromJSON(
    json: string,
    targetTier: StorageTier,
    options?: {
      skipExisting?: boolean;
      overwriteExisting?: boolean;
    }
  ): Promise<StorageResult<MigrationReport>> {
    try {
      const adapter = this.adapters.get(targetTier);

      if (!adapter) {
        return ResultBuilder.failure(
          StorageErrorCode.TIER_UNAVAILABLE,
          `Tier not available: ${targetTier}`
        );
      }

      const importData = JSON.parse(json);
      const items: StorageItem[] = importData.items ?? [];

      const results: MigrationResult[] = [];
      const failedTasks: MigrationTask[] = [];
      const startTime = performance.now();
      let bytesTransferred = 0;

      for (const item of items) {
        try {
          // 检查是否已存在
          if (options?.skipExisting) {
            const exists = await adapter.exists(item.key);
            if (exists.success && exists.data) {
              continue;
            }
          }

          // 写入数据
          const setResult = await adapter.set(item.key, item.value, {
            ttl: item.expiresAt ? item.expiresAt - Date.now() : undefined,
            priority: item.priority,
            metadata: item.metadata,
            ifExists: options?.overwriteExisting ? undefined : false,
          });

          if (setResult.success) {
            const bytes = DataSerializer.estimateSize(item.value);
            bytesTransferred += bytes;

            results.push({
              task: {
                id: this.generateTaskId(),
                key: item.key,
                sourceTier: StorageTier.COLD,
                targetTier,
                status: MigrationStatus.COMPLETED,
                createdAt: startTime,
                startedAt: startTime,
                completedAt: Date.now(),
                retryCount: 0,
              },
              bytesTransferred: bytes,
              durationMs: Date.now() - startTime,
            });
          } else {
            failedTasks.push({
              id: this.generateTaskId(),
              key: item.key,
              sourceTier: StorageTier.COLD,
              targetTier,
              status: MigrationStatus.FAILED,
              createdAt: startTime,
              error: setResult.error,
              retryCount: 0,
            });
          }
        } catch (error) {
          failedTasks.push({
            id: this.generateTaskId(),
            key: item.key,
            sourceTier: StorageTier.COLD,
            targetTier,
            status: MigrationStatus.FAILED,
            createdAt: startTime,
            retryCount: 0,
          });
        }
      }

      const endTime = Date.now();

      const report: MigrationReport = {
        id: this.generateReportId(),
        config: { batchSize: 1, concurrency: 1, retryAttempts: 3, retryDelay: 1000 },
        startTime,
        endTime,
        results,
        failedTasks,
        summary: {
          totalItems: items.length,
          successfulItems: results.length,
          failedItems: failedTasks.length,
          totalBytes: bytesTransferred,
          averageDuration: results.length > 0 
            ? results.reduce((sum, r) => sum + r.durationMs, 0) / results.length 
            : 0,
        },
      };

      this.logger.info(`Import completed: ${report.summary.successfulItems}/${report.summary.totalItems} items imported`);

      return ResultBuilder.success(report, targetTier, endTime - startTime);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Import failed: ${(error as Error).message}`
      );
    }
  }

  // ==================== 辅助方法 ====================

  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxAttempts: number,
    delay: number
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxAttempts - 1) {
          await this.delay(delay * Math.pow(2, attempt));
        }
      }
    }

    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private async runWithConcurrency<T>(
    promises: Promise<T>[],
    concurrency: number
  ): Promise<T[]> {
    const results: T[] = [];

    for (let i = 0; i < promises.length; i += concurrency) {
      const batch = promises.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
    }

    return results;
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ==================== 导出 ====================

export {
  StorageTier,
  MigrationConfig,
  MigrationProgress,
  MigrationReport,
  MigrationResult,
} from './types';
