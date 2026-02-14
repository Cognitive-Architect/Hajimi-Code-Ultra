/**
 * TSA (Tiered Storage Architecture) 生命周期管理器
 * 
 * 功能：
 * - 定期清理过期数据
 * - 数据晋升/降级（Transient→Staging→Archive）
 * - 触发频率配置
 */

import { Tier, DataEntry, TierMigration, MigrationConfig } from '../migration/TierMigration';
import TSAMonitor from '../monitor/TSAMonitor';

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

export interface CleanupResult {
  cleaned: number;
  expired: string[];
  errors: string[];
}

export interface MigrationReport {
  promoted: number;
  demoted: number;
  promotedKeys: string[];
  demotedKeys: string[];
  errors: string[];
}

export type LifecycleEventType = 'cleanup' | 'promotion' | 'demotion' | 'eviction';

export interface LifecycleEvent {
  type: LifecycleEventType;
  key: string;
  fromTier?: Tier;
  toTier?: Tier;
  timestamp: number;
}

export type LifecycleEventHandler = (event: LifecycleEvent) => void;

export class LifecycleManager {
  private config: LifecycleConfig;
  private migrationManager: TierMigration;
  private monitor: TSAMonitor;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private migrationTimer: NodeJS.Timeout | null = null;
  private eventHandlers: Map<LifecycleEventType, Set<LifecycleEventHandler>>;
  private isRunning: boolean = false;

  constructor(
    migrationManager: TierMigration,
    monitor: TSAMonitor,
    config?: Partial<LifecycleConfig>
  ) {
    this.config = { ...DEFAULT_LIFECYCLE_CONFIG, ...config };
    this.migrationManager = migrationManager;
    this.monitor = monitor;
    this.eventHandlers = new Map();
    
    // 初始化事件处理器集合
    const eventTypes: LifecycleEventType[] = ['cleanup', 'promotion', 'demotion', 'eviction'];
    for (const type of eventTypes) {
      this.eventHandlers.set(type, new Set());
    }
  }

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
  updateConfig(config: Partial<LifecycleConfig>): void {
    const wasRunning = this.isRunning;
    
    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...config };

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
   * 注册事件处理器
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

  /**
   * 调度清理任务
   */
  private scheduleCleanup(): void {
    if (!this.isRunning) return;

    this.cleanupTimer = setTimeout(async () => {
      try {
        await this.performCleanup();
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
        await this.performMigration();
      } catch (error) {
        console.error('Lifecycle migration error:', error);
      } finally {
        this.scheduleMigration();
      }
    }, this.config.migrationInterval);
  }

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
      let cleaned = 0;

      for (const entry of entries) {
        if (cleaned >= this.config.maxCleanupPerRun) {
          break;
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

      result.cleaned = cleaned;
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
  }
}

export default LifecycleManager;
