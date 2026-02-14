# 第8章 TSA完善（B-08）

> **工单**: B-08/09 TSA生命周期与监控  
> **目标**: 实现LifecycleManager定期清理、数据迁移、TSAMonitor监控面板  
> **依赖**: 白皮书第6章TSA三层、fix.md Phase 2完善  
> **状态**: 设计完成，待实现

---

## 8.1 LifecycleManager设计

### 8.1.1 架构概述

```
┌─────────────────────────────────────────────────────────────────┐
│                    LifecycleManager                             │
│                   (生命周期管理器)                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ CleanupTask  │  │MigrateTask   │  │ ArchiveTask  │          │
│  │ (定期清理)    │  │ (数据迁移)    │  │ (归档任务)    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                  │
│         └─────────────────┼─────────────────┘                  │
│                           ▼                                    │
│              ┌─────────────────────────┐                       │
│              │    Scheduler (调度器)    │                       │
│              │    - 1小时间隔触发        │                       │
│              │    - 任务队列管理         │                       │
│              └─────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

### 8.1.2 核心类型定义

```typescript
// lib/tsa/lifecycle/types.ts

/**
 * 生命周期配置
 */
export interface LifecycleConfig {
  /** 清理间隔 (毫秒), 默认1小时 */
  cleanupIntervalMs: number;
  /** 归档阈值 (天), 默认30天 */
  archiveThresholdDays: number;
  /** 热层最大空闲时间 (分钟), 默认5分钟 */
  transientIdleTimeoutMinutes: number;
  /** 温层最大空闲时间 (小时), 默认24小时 */
  stagingIdleTimeoutHours: number;
  /** 是否启用自动迁移 */
  enableAutoMigration: boolean;
  /** 是否启用归档 */
  enableArchiving: boolean;
}

/**
 * 清理任务结果
 */
export interface CleanupResult {
  /** 清理的数据条目数 */
  cleanedCount: number;
  /** 释放的内存大小 (字节) */
  freedMemoryBytes: number;
  /** 清理的层级 */
  tier: StorageTier;
  /** 执行时间戳 */
  timestamp: number;
}

/**
 * 迁移任务结果
 */
export interface MigrationResult {
  /** 迁移的数据条目数 */
  migratedCount: number;
  /** 迁移方向 */
  direction: 'promote' | 'demote';
  /** 源层级 */
  fromTier: StorageTier;
  /** 目标层级 */
  toTier: StorageTier;
  /** 执行时间戳 */
  timestamp: number;
}

/**
 * 生命周期事件类型
 */
export enum LifecycleEventType {
  CLEANUP_STARTED = 'cleanup:started',
  CLEANUP_COMPLETED = 'cleanup:completed',
  MIGRATION_STARTED = 'migration:started',
  MIGRATION_COMPLETED = 'migration:completed',
  ITEM_EXPIRED = 'item:expired',
  ITEM_PROMOTED = 'item:promoted',
  ITEM_DEMOTED = 'item:demoted',
}

/**
 * 生命周期事件
 */
export interface LifecycleEvent {
  type: LifecycleEventType;
  key: string;
  tier: StorageTier;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
```

### 8.1.3 LifecycleManager实现

```typescript
// lib/tsa/lifecycle/LifecycleManager.ts

import { EventEmitter } from 'events';
import { TSA } from '../StorageManager';
import { TransientStore } from '../TransientStore';
import { StagingStore } from '../StagingStore';
import { ArchiveStore } from '../ArchiveStore';
import { 
  LifecycleConfig, 
  CleanupResult, 
  MigrationResult,
  LifecycleEventType,
  LifecycleEvent,
  StorageTier 
} from './types';

export class LifecycleManager extends EventEmitter {
  private tsa: TSA;
  private transientStore: TransientStore;
  private stagingStore: StagingStore;
  private archiveStore: ArchiveStore;
  private config: LifecycleConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  /** 默认配置 */
  private static readonly DEFAULT_CONFIG: LifecycleConfig = {
    cleanupIntervalMs: 60 * 60 * 1000,        // 1小时
    archiveThresholdDays: 30,                  // 30天
    transientIdleTimeoutMinutes: 5,            // 5分钟
    stagingIdleTimeoutHours: 24,               // 24小时
    enableAutoMigration: true,
    enableArchiving: true,
  };

  constructor(
    tsa: TSA,
    transientStore: TransientStore,
    stagingStore: StagingStore,
    archiveStore: ArchiveStore,
    config: Partial<LifecycleConfig> = {}
  ) {
    super();
    this.tsa = tsa;
    this.transientStore = transientStore;
    this.stagingStore = stagingStore;
    this.archiveStore = archiveStore;
    this.config = { ...LifecycleManager.DEFAULT_CONFIG, ...config };
  }

  /**
   * 启动生命周期管理
   */
  start(): void {
    if (this.isRunning) {
      console.warn('[LifecycleManager] 已经处于运行状态');
      return;
    }

    this.isRunning = true;
    console.log(`[LifecycleManager] 已启动，清理间隔: ${this.config.cleanupIntervalMs}ms`);

    // 立即执行一次清理
    this.performCleanup();

    // 设置定时器
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupIntervalMs);

    this.emit('started', { timestamp: Date.now() });
  }

  /**
   * 停止生命周期管理
   */
  stop(): void {
    if (!this.isRunning) {
      console.warn('[LifecycleManager] 未处于运行状态');
      return;
    }

    this.isRunning = false;

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    console.log('[LifecycleManager] 已停止');
    this.emit('stopped', { timestamp: Date.now() });
  }

  /**
   * 执行清理任务 (TSA-001)
   */
  async performCleanup(): Promise<CleanupResult[]> {
    console.log('[LifecycleManager] 开始执行定期清理...');
    this.emit(LifecycleEventType.CLEANUP_STARTED, { timestamp: Date.now() });

    const results: CleanupResult[] = [];

    try {
      // 1. 清理热层过期数据
      const transientResult = await this.cleanupTransient();
      results.push(transientResult);

      // 2. 清理温层过期数据
      const stagingResult = await this.cleanupStaging();
      results.push(stagingResult);

      // 3. 执行数据迁移
      if (this.config.enableAutoMigration) {
        await this.performMigration();
      }

      console.log('[LifecycleManager] 清理完成:', results);
      this.emit(LifecycleEventType.CLEANUP_COMPLETED, { results, timestamp: Date.now() });

      return results;
    } catch (error) {
      console.error('[LifecycleManager] 清理失败:', error);
      this.emit('error', { error, timestamp: Date.now() });
      throw error;
    }
  }

  /**
   * 清理热层过期数据
   */
  private async cleanupTransient(): Promise<CleanupResult> {
    const expiredKeys = await this.transientStore.getExpiredKeys();
    let freedMemory = 0;

    for (const key of expiredKeys) {
      const item = await this.transientStore.getRaw(key);
      if (item) {
        freedMemory += this.estimateSize(item);
        await this.transientStore.delete(key);
        this.emit(LifecycleEventType.ITEM_EXPIRED, {
          key,
          tier: StorageTier.TRANSIENT,
          timestamp: Date.now(),
        } as LifecycleEvent);
      }
    }

    return {
      cleanedCount: expiredKeys.length,
      freedMemoryBytes: freedMemory,
      tier: StorageTier.TRANSIENT,
      timestamp: Date.now(),
    };
  }

  /**
   * 清理温层过期数据
   */
  private async cleanupStaging(): Promise<CleanupResult> {
    const expiredKeys = await this.stagingStore.getExpiredKeys();

    for (const key of expiredKeys) {
      await this.stagingStore.delete(key);
      this.emit(LifecycleEventType.ITEM_EXPIRED, {
        key,
        tier: StorageTier.STAGING,
        timestamp: Date.now(),
      } as LifecycleEvent);
    }

    return {
      cleanedCount: expiredKeys.length,
      freedMemoryBytes: 0, // 温层是磁盘存储
      tier: StorageTier.STAGING,
      timestamp: Date.now(),
    };
  }

  /**
   * 执行数据迁移 (TSA-002)
   */
  async performMigration(): Promise<MigrationResult[]> {
    console.log('[LifecycleManager] 开始执行数据迁移...');
    this.emit(LifecycleEventType.MIGRATION_STARTED, { timestamp: Date.now() });

    const results: MigrationResult[] = [];

    // 1. 热层 → 温层降级 (低频访问数据)
    const demoteResult = await this.demoteFromTransient();
    results.push(demoteResult);

    // 2. 温层 → 热层晋升 (高频访问数据)
    const promoteResult = await this.promoteFromStaging();
    results.push(promoteResult);

    // 3. 温层 → 冷层归档 (长期未访问)
    if (this.config.enableArchiving) {
      const archiveResult = await this.archiveFromStaging();
      results.push(archiveResult);
    }

    console.log('[LifecycleManager] 迁移完成:', results);
    this.emit(LifecycleEventType.MIGRATION_COMPLETED, { results, timestamp: Date.now() });

    return results;
  }

  /**
   * 热层 → 温层降级
   */
  private async demoteFromTransient(): Promise<MigrationResult> {
    const idleThreshold = Date.now() - (this.config.transientIdleTimeoutMinutes * 60 * 1000);
    const candidates = await this.transientStore.getIdleKeys(idleThreshold);
    let migratedCount = 0;

    for (const key of candidates) {
      const item = await this.transientStore.getRaw(key);
      if (item) {
        // 降级到温层
        await this.stagingStore.set(key, item.value, item.ttl);
        await this.transientStore.delete(key);
        migratedCount++;

        this.emit(LifecycleEventType.ITEM_DEMOTED, {
          key,
          tier: StorageTier.TRANSIENT,
          timestamp: Date.now(),
          metadata: { toTier: StorageTier.STAGING },
        } as LifecycleEvent);
      }
    }

    return {
      migratedCount,
      direction: 'demote',
      fromTier: StorageTier.TRANSIENT,
      toTier: StorageTier.STAGING,
      timestamp: Date.now(),
    };
  }

  /**
   * 温层 → 热层晋升 (访问时自动晋升)
   */
  private async promoteFromStaging(): Promise<MigrationResult> {
    // 晋升逻辑在读取时触发，这里只处理预加载
    const hotCandidates = await this.stagingStore.getHotCandidates(10); // 访问频率>10
    let migratedCount = 0;

    for (const key of hotCandidates) {
      const item = await this.stagingStore.getRaw(key);
      if (item) {
        await this.transientStore.set(key, item.value, item.ttl);
        migratedCount++;

        this.emit(LifecycleEventType.ITEM_PROMOTED, {
          key,
          tier: StorageTier.STAGING,
          timestamp: Date.now(),
          metadata: { toTier: StorageTier.TRANSIENT },
        } as LifecycleEvent);
      }
    }

    return {
      migratedCount,
      direction: 'promote',
      fromTier: StorageTier.STAGING,
      toTier: StorageTier.TRANSIENT,
      timestamp: Date.now(),
    };
  }

  /**
   * 温层 → 冷层归档
   */
  private async archiveFromStaging(): Promise<MigrationResult> {
    const archiveThreshold = Date.now() - (this.config.archiveThresholdDays * 24 * 60 * 60 * 1000);
    const candidates = await this.stagingStore.getIdleKeys(archiveThreshold);
    let migratedCount = 0;

    for (const key of candidates) {
      const item = await this.stagingStore.getRaw(key);
      if (item) {
        await this.archiveStore.set(key, item.value);
        await this.stagingStore.delete(key);
        migratedCount++;

        this.emit(LifecycleEventType.ITEM_DEMOTED, {
          key,
          tier: StorageTier.STAGING,
          timestamp: Date.now(),
          metadata: { toTier: StorageTier.ARCHIVE },
        } as LifecycleEvent);
      }
    }

    return {
      migratedCount,
      direction: 'demote',
      fromTier: StorageTier.STAGING,
      toTier: StorageTier.ARCHIVE,
      timestamp: Date.now(),
    };
  }

  /**
   * 估算数据大小
   */
  private estimateSize(item: unknown): number {
    try {
      return JSON.stringify(item).length * 2; // UTF-16 估算
    } catch {
      return 1024; // 默认1KB
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): LifecycleConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<LifecycleConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[LifecycleManager] 配置已更新:', this.config);

    // 如果正在运行，重启定时器
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * 获取运行状态
   */
  getStatus(): { isRunning: boolean; nextCleanupAt: number | null } {
    return {
      isRunning: this.isRunning,
      nextCleanupAt: this.isRunning ? Date.now() + this.config.cleanupIntervalMs : null,
    };
  }
}
```

### 8.1.4 存储层扩展接口

```typescript
// lib/tsa/TransientStore.ts (扩展)

export class TransientStore {
  // ... 原有方法

  /**
   * 获取过期键列表 (LifecycleManager使用)
   */
  async getExpiredKeys(): Promise<string[]> {
    const expired: string[] = [];
    const now = Date.now();

    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt && item.expiresAt < now) {
        expired.push(key);
      }
    }

    return expired;
  }

  /**
   * 获取空闲键列表 (超过idleThreshold未访问)
   */
  async getIdleKeys(idleThreshold: number): Promise<string[]> {
    const idle: string[] = [];

    for (const [key, item] of this.cache.entries()) {
      if (item.metrics.lastAccessed < idleThreshold) {
        idle.push(key);
      }
    }

    return idle;
  }

  /**
   * 获取原始存储项 (不移除)
   */
  async getRaw(key: string): Promise<StorageItem | null> {
    return this.cache.get(key) || null;
  }
}

// lib/tsa/StagingStore.ts (扩展)

export class StagingStore {
  // ... 原有方法

  /**
   * 获取过期键列表
   */
  async getExpiredKeys(): Promise<string[]> {
    if (!this.db) await this.init();
    const expired: string[] = [];
    const now = Date.now();

    const allItems = await this.db!.getAll(this.config.storeName);
    for (const item of allItems) {
      if (item.expiresAt && item.expiresAt < now) {
        expired.push(item.key);
      }
    }

    return expired;
  }

  /**
   * 获取空闲键列表
   */
  async getIdleKeys(idleThreshold: number): Promise<string[]> {
    if (!this.db) await this.init();
    const idle: string[] = [];

    const allItems = await this.db!.getAll(this.config.storeName);
    for (const item of allItems) {
      if (item.metrics.lastAccessed < idleThreshold) {
        idle.push(item.key);
      }
    }

    return idle;
  }

  /**
   * 获取高频访问候选 (用于晋升)
   */
  async getHotCandidates(minFrequency: number): Promise<string[]> {
    if (!this.db) await this.init();
    const hot: string[] = [];

    const allItems = await this.db!.getAll(this.config.storeName);
    for (const item of allItems) {
      const hoursSinceCreated = Math.max(1, (Date.now() - item.metrics.createdAt) / (1000 * 60 * 60));
      const frequency = item.metrics.readCount / hoursSinceCreated;

      if (frequency >= minFrequency) {
        hot.push(item.key);
      }
    }

    return hot;
  }

  /**
   * 获取原始存储项
   */
  async getRaw(key: string): Promise<StorageItem | null> {
    if (!this.db) await this.init();
    return await this.db!.get(this.config.storeName, key);
  }
}
```

---

## 8.2 TSAMonitor设计

### 8.2.1 架构概述

```
┌─────────────────────────────────────────────────────────────────┐
│                      TSAMonitor                                 │
│                      (监控面板)                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ HitRate      │  │ TierMetrics  │  │ Performance  │          │
│  │ (命中率统计)  │  │ (层大小统计)  │  │ (性能指标)    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                  │
│         └─────────────────┼─────────────────┘                  │
│                           ▼                                    │
│              ┌─────────────────────────┐                       │
│              │    MetricsCollector     │                       │
│              │    (指标收集器)          │                       │
│              └─────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2.2 核心类型定义

```typescript
// lib/tsa/monitor/types.ts

/**
 * TSA监控指标
 */
export interface TSAMetrics {
  /** 时间戳 */
  timestamp: number;
  /** 热层指标 */
  transient: TransientMetrics;
  /** 温层指标 */
  staging: StagingMetrics;
  /** 冷层指标 */
  archive: ArchiveMetrics;
  /** 路由指标 */
  routing: RoutingMetrics;
  /** 整体指标 */
  overall: OverallMetrics;
}

/**
 * 热层指标
 */
export interface TransientMetrics {
  /** 当前条目数 */
  itemCount: number;
  /** 最大容量 */
  maxSize: number;
  /** 内存使用量 (字节) */
  memoryUsageBytes: number;
  /** 最大内存限制 (字节) */
  maxMemoryBytes: number;
  /** 命中次数 */
  hitCount: number;
  /** 未命中次数 */
  missCount: number;
  /** 命中率 (0-1) */
  hitRate: number;
  /** 平均响应时间 (ms) */
  avgResponseTimeMs: number;
  /** 驱逐次数 */
  evictionCount: number;
  /** 过期次数 */
  expiredCount: number;
}

/**
 * 温层指标
 */
export interface StagingMetrics {
  /** 当前条目数 */
  itemCount: number;
  /** 命中次数 */
  hitCount: number;
  /** 未命中次数 */
  missCount: number;
  /** 命中率 (0-1) */
  hitRate: number;
  /** 平均响应时间 (ms) */
  avgResponseTimeMs: number;
  /** 磁盘使用量 (字节) */
  diskUsageBytes: number;
  /** 晋升到热层次数 */
  promotionCount: number;
  /** 降级到冷层次数 */
  demotionCount: number;
}

/**
 * 冷层指标
 */
export interface ArchiveMetrics {
  /** 当前条目数 */
  itemCount: number;
  /** 总存储大小 (字节) */
  totalSizeBytes: number;
  /** 归档文件数 */
  fileCount: number;
  /** 平均响应时间 (ms) */
  avgResponseTimeMs: number;
}

/**
 * 路由指标
 */
export interface RoutingMetrics {
  /** 总请求数 */
  totalRequests: number;
  /** 总命中数 */
  totalHits: number;
  /** 总未命中数 */
  totalMisses: number;
  /** 整体命中率 (0-1) */
  overallHitRate: number;
  /** 热层命中占比 */
  transientHitRatio: number;
  /** 温层命中占比 */
  stagingHitRatio: number;
  /** 冷层命中占比 */
  archiveHitRatio: number;
}

/**
 * 整体指标
 */
export interface OverallMetrics {
  /** 总条目数 */
  totalItems: number;
  /** 总存储大小 (字节) */
  totalSizeBytes: number;
  /** 平均命中率 (目标>80%) */
  avgHitRate: number;
  /** 内存效率 (条目数/MB) */
  memoryEfficiency: number;
  /** 最后更新时间 */
  lastUpdated: number;
}

/**
 * 性能采样
 */
export interface PerformanceSample {
  operation: 'get' | 'set' | 'delete' | 'migrate';
  tier: StorageTier;
  durationMs: number;
  timestamp: number;
  success: boolean;
}

/**
 * 历史指标 (用于趋势分析)
 */
export interface MetricsHistory {
  /** 时间窗口 (小时) */
  windowHours: number;
  /** 采样点 */
  samples: {
    timestamp: number;
    hitRate: number;
    memoryUsage: number;
    requestCount: number;
  }[];
}
```

### 8.2.3 TSAMonitor实现

```typescript
// lib/tsa/monitor/TSAMonitor.ts

import { EventEmitter } from 'events';
import { TransientStore } from '../TransientStore';
import { StagingStore } from '../StagingStore';
import { ArchiveStore } from '../ArchiveStore';
import {
  TSAMetrics,
  TransientMetrics,
  StagingMetrics,
  ArchiveMetrics,
  RoutingMetrics,
  OverallMetrics,
  PerformanceSample,
  MetricsHistory,
  StorageTier,
} from './types';

export class TSAMonitor extends EventEmitter {
  private transientStore: TransientStore;
  private stagingStore: StagingStore;
  private archiveStore: ArchiveStore;

  // 命中统计
  private transientHits = 0;
  private transientMisses = 0;
  private stagingHits = 0;
  private stagingMisses = 0;
  private archiveHits = 0;
  private archiveMisses = 0;

  // 性能采样
  private performanceSamples: PerformanceSample[] = [];
  private readonly MAX_SAMPLES = 10000;

  // 历史数据
  private metricsHistory: MetricsHistory['samples'] = [];
  private readonly HISTORY_WINDOW_HOURS = 24;

  constructor(
    transientStore: TransientStore,
    stagingStore: StagingStore,
    archiveStore: ArchiveStore
  ) {
    super();
    this.transientStore = transientStore;
    this.stagingStore = stagingStore;
    this.archiveStore = archiveStore;
  }

  // ==================== 命中统计方法 ====================

  /**
   * 记录热层命中
   */
  recordTransientHit(): void {
    this.transientHits++;
    this.emit('hit', { tier: StorageTier.TRANSIENT, timestamp: Date.now() });
  }

  /**
   * 记录热层未命中
   */
  recordTransientMiss(): void {
    this.transientMisses++;
    this.emit('miss', { tier: StorageTier.TRANSIENT, timestamp: Date.now() });
  }

  /**
   * 记录温层命中
   */
  recordStagingHit(): void {
    this.stagingHits++;
    this.emit('hit', { tier: StorageTier.STAGING, timestamp: Date.now() });
  }

  /**
   * 记录温层未命中
   */
  recordStagingMiss(): void {
    this.stagingMisses++;
    this.emit('miss', { tier: StorageTier.STAGING, timestamp: Date.now() });
  }

  /**
   * 记录冷层命中
   */
  recordArchiveHit(): void {
    this.archiveHits++;
    this.emit('hit', { tier: StorageTier.ARCHIVE, timestamp: Date.now() });
  }

  /**
   * 记录冷层未命中
   */
  recordArchiveMiss(): void {
    this.archiveMisses++;
    this.emit('miss', { tier: StorageTier.ARCHIVE, timestamp: Date.now() });
  }

  /**
   * 记录性能采样
   */
  recordPerformance(sample: Omit<PerformanceSample, 'timestamp'>): void {
    const fullSample: PerformanceSample = {
      ...sample,
      timestamp: Date.now(),
    };

    this.performanceSamples.push(fullSample);

    // 限制采样数量
    if (this.performanceSamples.length > this.MAX_SAMPLES) {
      this.performanceSamples = this.performanceSamples.slice(-this.MAX_SAMPLES);
    }
  }

  // ==================== 指标计算方法 ====================

  /**
   * 获取热层指标 (TSA-004)
   */
  async getTransientMetrics(): Promise<TransientMetrics> {
    const startTime = performance.now();
    const stats = await this.transientStore.getStats();
    const endTime = performance.now();

    const total = this.transientHits + this.transientMisses;
    const hitRate = total > 0 ? this.transientHits / total : 0;

    this.recordPerformance({
      operation: 'get',
      tier: StorageTier.TRANSIENT,
      durationMs: endTime - startTime,
      success: true,
    });

    return {
      itemCount: stats.size,
      maxSize: stats.maxSize,
      memoryUsageBytes: stats.memoryUsage,
      maxMemoryBytes: stats.maxMemory,
      hitCount: this.transientHits,
      missCount: this.transientMisses,
      hitRate,
      avgResponseTimeMs: this.calculateAvgResponseTime(StorageTier.TRANSIENT),
      evictionCount: stats.evictionCount,
      expiredCount: stats.expiredCount,
    };
  }

  /**
   * 获取温层指标 (TSA-004)
   */
  async getStagingMetrics(): Promise<StagingMetrics> {
    const startTime = performance.now();
    const stats = await this.stagingStore.getStats();
    const endTime = performance.now();

    const total = this.stagingHits + this.stagingMisses;
    const hitRate = total > 0 ? this.stagingHits / total : 0;

    this.recordPerformance({
      operation: 'get',
      tier: StorageTier.STAGING,
      durationMs: endTime - startTime,
      success: true,
    });

    return {
      itemCount: stats.size,
      hitCount: this.stagingHits,
      missCount: this.stagingMisses,
      hitRate,
      avgResponseTimeMs: this.calculateAvgResponseTime(StorageTier.STAGING),
      diskUsageBytes: stats.diskUsage,
      promotionCount: stats.promotionCount,
      demotionCount: stats.demotionCount,
    };
  }

  /**
   * 获取冷层指标 (TSA-004)
   */
  async getArchiveMetrics(): Promise<ArchiveMetrics> {
    const startTime = performance.now();
    const stats = await this.archiveStore.getStats();
    const endTime = performance.now();

    this.recordPerformance({
      operation: 'get',
      tier: StorageTier.ARCHIVE,
      durationMs: endTime - startTime,
      success: true,
    });

    return {
      itemCount: stats.size,
      totalSizeBytes: stats.totalSize,
      fileCount: stats.fileCount,
      avgResponseTimeMs: this.calculateAvgResponseTime(StorageTier.ARCHIVE),
    };
  }

  /**
   * 获取路由指标 (TSA-003)
   */
  getRoutingMetrics(): RoutingMetrics {
    const totalHits = this.transientHits + this.stagingHits + this.archiveHits;
    const totalMisses = this.transientMisses + this.stagingMisses + this.archiveMisses;
    const totalRequests = totalHits + totalMisses;

    const overallHitRate = totalRequests > 0 ? totalHits / totalRequests : 0;

    return {
      totalRequests,
      totalHits,
      totalMisses,
      overallHitRate,
      transientHitRatio: totalHits > 0 ? this.transientHits / totalHits : 0,
      stagingHitRatio: totalHits > 0 ? this.stagingHits / totalHits : 0,
      archiveHitRatio: totalHits > 0 ? this.archiveHits / totalHits : 0,
    };
  }

  /**
   * 获取整体指标
   */
  async getOverallMetrics(): Promise<OverallMetrics> {
    const transient = await this.getTransientMetrics();
    const staging = await this.getStagingMetrics();
    const archive = await this.getArchiveMetrics();
    const routing = this.getRoutingMetrics();

    const totalItems = transient.itemCount + staging.itemCount + archive.itemCount;
    const totalSize = transient.memoryUsageBytes + staging.diskUsageBytes + archive.totalSizeBytes;

    return {
      totalItems,
      totalSizeBytes: totalSize,
      avgHitRate: routing.overallHitRate,
      memoryEfficiency: totalItems > 0 && transient.memoryUsageBytes > 0
        ? totalItems / (transient.memoryUsageBytes / 1024 / 1024)
        : 0,
      lastUpdated: Date.now(),
    };
  }

  /**
   * 获取完整监控指标
   */
  async getMetrics(): Promise<TSAMetrics> {
    const [transient, staging, archive, overall] = await Promise.all([
      this.getTransientMetrics(),
      this.getStagingMetrics(),
      this.getArchiveMetrics(),
      this.getOverallMetrics(),
    ]);

    const metrics: TSAMetrics = {
      timestamp: Date.now(),
      transient,
      staging,
      archive,
      routing: this.getRoutingMetrics(),
      overall,
    };

    // 记录历史
    this.recordMetricsHistory(metrics);

    return metrics;
  }

  /**
   * 获取历史趋势
   */
  getMetricsHistory(hours: number = 24): MetricsHistory {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const samples = this.metricsHistory.filter(s => s.timestamp >= cutoff);

    return {
      windowHours: hours,
      samples,
    };
  }

  // ==================== 辅助方法 ====================

  /**
   * 计算平均响应时间
   */
  private calculateAvgResponseTime(tier: StorageTier): number {
    const samples = this.performanceSamples.filter(
      s => s.tier === tier && s.operation === 'get'
    );

    if (samples.length === 0) return 0;

    const total = samples.reduce((sum, s) => sum + s.durationMs, 0);
    return total / samples.length;
  }

  /**
   * 记录历史指标
   */
  private recordMetricsHistory(metrics: TSAMetrics): void {
    this.metricsHistory.push({
      timestamp: metrics.timestamp,
      hitRate: metrics.routing.overallHitRate,
      memoryUsage: metrics.transient.memoryUsageBytes,
      requestCount: metrics.routing.totalRequests,
    });

    // 清理过期历史
    const cutoff = Date.now() - (this.HISTORY_WINDOW_HOURS * 60 * 60 * 1000);
    this.metricsHistory = this.metricsHistory.filter(s => s.timestamp >= cutoff);
  }

  /**
   * 重置统计 (用于测试)
   */
  resetStats(): void {
    this.transientHits = 0;
    this.transientMisses = 0;
    this.stagingHits = 0;
    this.stagingMisses = 0;
    this.archiveHits = 0;
    this.archiveMisses = 0;
    this.performanceSamples = [];
    this.metricsHistory = [];
  }

  /**
   * 检查命中率是否达标
   */
  isHitRateHealthy(threshold: number = 0.8): boolean {
    const routing = this.getRoutingMetrics();
    return routing.overallHitRate >= threshold;
  }
}
```

---

## 8.3 监控API

### 8.3.1 API路由实现

```typescript
// app/api/v1/tsa/metrics/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { tsa } from '@/lib/tsa';
import { tsaMonitor } from '@/lib/tsa/monitor';

/**
 * GET /api/v1/tsa/metrics
 * 获取TSA监控指标
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // 确保TSA已初始化
    await tsa.init();

    // 获取监控指标
    const metrics = await tsaMonitor.getMetrics();

    // 检查命中率是否达标
    const isHealthy = tsaMonitor.isHitRateHealthy(0.8);

    return NextResponse.json({
      success: true,
      data: metrics,
      health: {
        status: isHealthy ? 'healthy' : 'warning',
        hitRateTarget: 0.8,
        hitRateActual: metrics.routing.overallHitRate,
      },
      timestamp: Date.now(),
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[API] /api/v1/tsa/metrics error:', error);

    return NextResponse.json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    }, { status: 500 });
  }
}
```

### 8.3.2 历史指标API

```typescript
// app/api/v1/tsa/metrics/history/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { tsaMonitor } from '@/lib/tsa/monitor';

/**
 * GET /api/v1/tsa/metrics/history?hours=24
 * 获取TSA历史指标
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '24', 10);

    // 限制最大时间窗口
    const validHours = Math.min(Math.max(hours, 1), 168); // 1小时到7天

    const history = tsaMonitor.getMetricsHistory(validHours);

    return NextResponse.json({
      success: true,
      data: history,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[API] /api/v1/tsa/metrics/history error:', error);

    return NextResponse.json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    }, { status: 500 });
  }
}
```

### 8.3.3 健康检查API

```typescript
// app/api/v1/tsa/health/route.ts

import { NextResponse } from 'next/server';
import { tsa } from '@/lib/tsa';
import { tsaMonitor } from '@/lib/tsa/monitor';
import { lifecycleManager } from '@/lib/tsa/lifecycle';

/**
 * GET /api/v1/tsa/health
 * TSA健康检查
 */
export async function GET(): Promise<NextResponse> {
  try {
    await tsa.init();

    const metrics = await tsaMonitor.getMetrics();
    const lifecycleStatus = lifecycleManager.getStatus();

    // 健康检查项
    const checks = {
      initialized: true,
      hitRateHealthy: tsaMonitor.isHitRateHealthy(0.8),
      memoryHealthy: metrics.transient.memoryUsageBytes < metrics.transient.maxMemoryBytes * 0.9,
      lifecycleRunning: lifecycleStatus.isRunning,
    };

    const allHealthy = Object.values(checks).every(v => v);

    return NextResponse.json({
      success: true,
      status: allHealthy ? 'healthy' : 'degraded',
      checks,
      metrics: {
        hitRate: metrics.routing.overallHitRate,
        memoryUsage: metrics.transient.memoryUsageBytes,
        itemCount: metrics.overall.totalItems,
      },
      lifecycle: lifecycleStatus,
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    }, { status: 503 });
  }
}
```

### 8.3.4 控制API (启动/停止生命周期管理)

```typescript
// app/api/v1/tsa/lifecycle/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { lifecycleManager } from '@/lib/tsa/lifecycle';
import { z } from 'zod';

const ControlSchema = z.object({
  action: z.enum(['start', 'stop', 'cleanup', 'migrate']),
});

/**
 * POST /api/v1/tsa/lifecycle
 * 控制生命周期管理
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action } = ControlSchema.parse(body);

    let result: unknown;

    switch (action) {
      case 'start':
        lifecycleManager.start();
        result = { status: 'started' };
        break;
      case 'stop':
        lifecycleManager.stop();
        result = { status: 'stopped' };
        break;
      case 'cleanup':
        result = await lifecycleManager.performCleanup();
        break;
      case 'migrate':
        result = await lifecycleManager.performMigration();
        break;
    }

    return NextResponse.json({
      success: true,
      action,
      result,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[API] /api/v1/tsa/lifecycle error:', error);

    return NextResponse.json({
      success: false,
      error: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    }, { status: 400 });
  }
}

/**
 * GET /api/v1/tsa/lifecycle
 * 获取生命周期管理状态
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    success: true,
    status: lifecycleManager.getStatus(),
    config: lifecycleManager.getConfig(),
    timestamp: Date.now(),
  });
}
```

---

## 8.4 自测点

### 8.4.1 自测点清单

| 自测ID | 验证命令 | 通过标准 | 状态 |
|--------|----------|----------|------|
| TSA-001 | `curl -X POST http://localhost:3000/api/v1/tsa/lifecycle -d '{"action":"cleanup"}'` | 返回cleanedCount>0，过期数据被清理 | 🔴 待实现 |
| TSA-002 | `curl http://localhost:3000/api/v1/tsa/metrics` 后访问冷数据再查询 | 冷数据访问后promotionCount增加 | 🔴 待实现 |
| TSA-003 | `curl http://localhost:3000/api/v1/tsa/metrics` | 返回hitRate>=0.8，health.status="healthy" | 🔴 待实现 |
| TSA-004 | `curl http://localhost:3000/api/v1/tsa/metrics` | 返回各层size、memoryUsage、itemCount正确 | 🔴 待实现 |
| TSA-005 | `curl http://localhost:3000/api/v1/tsa/health` | 返回status="healthy"，所有checks为true | 🔴 待实现 |
| TSA-006 | 等待1小时后 `curl http://localhost:3000/api/v1/tsa/metrics/history` | 返回24小时内历史数据点 | 🔴 待实现 |

### 8.4.2 详细验证步骤

#### TSA-001: 定期清理过期数据

```bash
# 1. 写入测试数据（设置短TTL）
curl -X POST http://localhost:3000/api/v1/tsa/test-data \
  -H "Content-Type: application/json" \
  -d '{"key":"test-expire","value":"data","ttl":5000}'

# 2. 等待6秒
sleep 6

# 3. 手动触发清理
curl -X POST http://localhost:3000/api/v1/tsa/lifecycle \
  -H "Content-Type: application/json" \
  -d '{"action":"cleanup"}'

# 期望响应:
{
  "success": true,
  "action": "cleanup",
  "result": [
    {
      "cleanedCount": 1,        // 清理了1条数据
      "freedMemoryBytes": 1024,  // 释放了1KB内存
      "tier": "TRANSIENT",
      "timestamp": 1700000000000
    }
  ]
}

# 4. 验证数据已被清理
curl http://localhost:3000/api/v1/tsa/test-data/test-expire
# 期望返回: null 或 404
```

**通过标准**: cleanedCount >= 1 且过期数据无法读取

#### TSA-002: 数据自动晋升（冷→温→热）

```bash
# 1. 写入温层数据
curl -X POST http://localhost:3000/api/v1/tsa/test-data \
  -H "Content-Type: application/json" \
  -d '{"key":"test-promote","value":"warm data","tier":"STAGING"}'

# 2. 获取初始指标
curl http://localhost:3000/api/v1/tsa/metrics | jq '.data.staging.promotionCount'
# 记录初始值

# 3. 多次访问该数据（触发晋升）
for i in {1..15}; do
  curl http://localhost:3000/api/v1/tsa/test-data/test-promote
done

# 4. 获取更新后指标
curl http://localhost:3000/api/v1/tsa/metrics | jq '.data.staging.promotionCount'
# 期望: 比初始值增加

# 5. 验证数据已晋升到热层
curl http://localhost:3000/api/v1/tsa/metrics | jq '.data.transient.itemCount'
# 期望: 包含test-promote
```

**通过标准**: promotionCount增加且数据可从热层读取

#### TSA-003: 命中率统计正确（目标>80%）

```bash
# 1. 重置统计（测试环境）
curl -X POST http://localhost:3000/api/v1/tsa/monitor/reset

# 2. 写入测试数据
curl -X POST http://localhost:3000/api/v1/tsa/test-data \
  -H "Content-Type: application/json" \
  -d '{"key":"hit-test","value":"data"}'

# 3. 模拟访问模式 (90%命中)
for i in {1..100}; do
  if [ $((i % 10)) -ne 0 ]; then
    curl -s http://localhost:3000/api/v1/tsa/test-data/hit-test > /dev/null  # 命中
  else
    curl -s http://localhost:3000/api/v1/tsa/test-data/miss-test > /dev/null  # 未命中
  fi
done

# 4. 获取命中率
curl http://localhost:3000/api/v1/tsa/metrics | jq '
  .data.routing.overallHitRate,
  .health.status,
  .health.hitRateActual
'

# 期望输出:
# 0.9
# "healthy"
# 0.9
```

**通过标准**: hitRate >= 0.8 且 health.status = "healthy"

#### TSA-004: 层大小统计正确

```bash
# 1. 获取完整指标
curl http://localhost:3000/api/v1/tsa/metrics | jq '.data | {
  transient: {
    itemCount: .transient.itemCount,
    memoryUsageMB: (.transient.memoryUsageBytes / 1024 / 1024),
    hitRate: .transient.hitRate
  },
  staging: {
    itemCount: .staging.itemCount,
    diskUsageMB: (.staging.diskUsageBytes / 1024 / 1024),
    hitRate: .staging.hitRate
  },
  archive: {
    itemCount: .archive.itemCount,
    totalSizeMB: (.archive.totalSizeBytes / 1024 / 1024)
  },
  overall: {
    totalItems: .overall.totalItems,
    avgHitRate: .overall.avgHitRate
  }
}'

# 期望响应结构:
{
  "transient": {
    "itemCount": 100,
    "memoryUsageMB": 5.2,
    "hitRate": 0.85
  },
  "staging": {
    "itemCount": 500,
    "diskUsageMB": 12.5,
    "hitRate": 0.75
  },
  "archive": {
    "itemCount": 1000,
    "totalSizeMB": 50.0
  },
  "overall": {
    "totalItems": 1600,
    "avgHitRate": 0.82
  }
}
```

**通过标准**: 
- 各层itemCount >= 0
- memoryUsageMB >= 0
- hitRate在0-1范围内
- totalItems = 各层itemCount之和

---

## 8.5 文件变更清单

### 8.5.1 新增文件

| 文件路径 | 类型 | 说明 | 大小估算 |
|----------|------|------|----------|
| `lib/tsa/lifecycle/types.ts` | 新增 | 生命周期类型定义 | ~2KB |
| `lib/tsa/lifecycle/LifecycleManager.ts` | 新增 | 生命周期管理器核心 | ~8KB |
| `lib/tsa/lifecycle/index.ts` | 新增 | 生命周期模块导出 | ~0.5KB |
| `lib/tsa/monitor/types.ts` | 新增 | 监控类型定义 | ~3KB |
| `lib/tsa/monitor/TSAMonitor.ts` | 新增 | 监控面板核心 | ~10KB |
| `lib/tsa/monitor/index.ts` | 新增 | 监控模块导出 | ~0.5KB |
| `app/api/v1/tsa/metrics/route.ts` | 新增 | 监控指标API | ~1.5KB |
| `app/api/v1/tsa/metrics/history/route.ts` | 新增 | 历史指标API | ~1KB |
| `app/api/v1/tsa/health/route.ts` | 新增 | 健康检查API | ~1.5KB |
| `app/api/v1/tsa/lifecycle/route.ts` | 新增 | 生命周期控制API | ~2KB |

### 8.5.2 修改文件

| 文件路径 | 类型 | 修改内容 | 影响行数 |
|----------|------|----------|----------|
| `lib/tsa/TransientStore.ts` | 修改 | 添加getExpiredKeys, getIdleKeys, getRaw方法 | ~+30行 |
| `lib/tsa/StagingStore.ts` | 修改 | 添加getExpiredKeys, getIdleKeys, getHotCandidates, getRaw方法 | ~+50行 |
| `lib/tsa/ArchiveStore.ts` | 修改 | 添加getStats方法 | ~+20行 |
| `lib/tsa/StorageManager.ts` | 修改 | 集成LifecycleManager和TSAMonitor | ~+40行 |
| `lib/tsa/index.ts` | 修改 | 导出生命周期和监控模块 | ~+5行 |

### 8.5.3 删除文件

无

---

## 8.6 技术债务声明

### 8.6.1 Mock清单

以下功能在当前设计中使用了Mock或简化实现，需在后续迭代中完善：

| # | 债务项 | 位置 | 影响 | 解决计划 |
|---|--------|------|------|----------|
| 1 | **ArchiveStore文件存储** | `lib/tsa/ArchiveStore.ts` | 冷层使用内存Mock，非真实文件存储 | P1 - 实现Node.js fs或S3存储 |
| 2 | **内存大小估算** | `LifecycleManager.estimateSize()` | 使用JSON.stringify估算，不准确 | P2 - 使用Buffer.byteLength |
| 3 | **IndexedDB磁盘用量** | `StagingStore.getStats()` | 浏览器环境无法精确获取磁盘用量 | P2 - 使用估算值或Chrome API |
| 4 | **定时器精度** | `LifecycleManager.cleanupTimer` | Node.js setInterval可能漂移 | P3 - 使用node-cron或类似库 |
| 5 | **历史数据持久化** | `TSAMonitor.metricsHistory` | 内存存储，重启丢失 | P2 - 存储到IndexedDB |
| 6 | **性能采样上限** | `MAX_SAMPLES = 10000` | 固定上限，可能丢失早期数据 | P3 - 使用环形缓冲区 |
| 7 | **并发清理控制** | `performCleanup()` | 无并发控制，可能重复执行 | P2 - 添加执行锁 |
| 8 | **错误恢复机制** | 各方法catch块 | 简单console.error，无重试 | P2 - 实现指数退避重试 |

### 8.6.2 已知限制

1. **浏览器兼容性**: IndexedDB相关功能在Safari私有模式下可能不可用
2. **存储配额**: 浏览器IndexedDB有存储配额限制，超出会抛出QuotaExceededError
3. **内存限制**: TransientStore使用内存，大对象可能导致OOM
4. **精度问题**: 性能采样使用performance.now()，精度约0.1ms

### 8.6.3 后续优化方向

```
P1 (高优先级):
├── 实现真实ArchiveStore (文件系统/S3)
├── 添加并发控制锁
└── 历史数据持久化

P2 (中优先级):
├── 内存大小精确计算
├── 错误恢复重试机制
├── 磁盘用量精确获取
└── 定时器精度优化

P3 (低优先级):
├── 性能采样环形缓冲区
├── 监控数据导出 (Prometheus格式)
└── 告警阈值配置
```

---

## 附录: 集成代码示例

### StorageManager集成

```typescript
// lib/tsa/StorageManager.ts (集成LifecycleManager和TSAMonitor)

import { LifecycleManager } from './lifecycle/LifecycleManager';
import { TSAMonitor } from './monitor/TSAMonitor';

export class TSA {
  private transientStore: TransientStore;
  private stagingStore: StagingStore;
  private archiveStore: ArchiveStore;
  private lifecycleManager: LifecycleManager;
  private monitor: TSAMonitor;
  private initialized = false;

  constructor() {
    this.transientStore = new TransientStore();
    this.stagingStore = new StagingStore();
    this.archiveStore = new ArchiveStore();
    
    // 初始化监控
    this.monitor = new TSAMonitor(
      this.transientStore,
      this.stagingStore,
      this.archiveStore
    );
    
    // 初始化生命周期管理
    this.lifecycleManager = new LifecycleManager(
      this,
      this.transientStore,
      this.stagingStore,
      this.archiveStore
    );
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    
    await this.stagingStore.init();
    await this.archiveStore.init();
    
    // 启动生命周期管理
    this.lifecycleManager.start();
    
    this.initialized = true;
    console.log('[TSA] 初始化完成，生命周期管理已启动');
  }

  async get<T>(key: string): Promise<T | null> {
    this.ensureInitialized();
    
    // 1. 尝试热层
    const hotValue = await this.transientStore.get<T>(key);
    if (hotValue !== null) {
      this.monitor.recordTransientHit();
      return hotValue;
    }
    this.monitor.recordTransientMiss();
    
    // 2. 尝试温层
    const warmValue = await this.stagingStore.get<T>(key);
    if (warmValue !== null) {
      this.monitor.recordStagingHit();
      // 晋升到热层
      await this.transientStore.set(key, warmValue);
      return warmValue;
    }
    this.monitor.recordStagingMiss();
    
    // 3. 尝试冷层
    const coldValue = await this.archiveStore.get<T>(key);
    if (coldValue !== null) {
      this.monitor.recordArchiveHit();
      // 晋升到温层
      await this.stagingStore.set(key, coldValue);
      return coldValue;
    }
    this.monitor.recordArchiveMiss();
    
    return null;
  }

  // ... 其他方法

  getMonitor(): TSAMonitor {
    return this.monitor;
  }

  getLifecycleManager(): LifecycleManager {
    return this.lifecycleManager;
  }
}

// 导出单例
export const tsa = new TSA();
export const tsaMonitor = tsa.getMonitor();
export const lifecycleManager = tsa.getLifecycleManager();
```

---

**文档生成**: HAJIMI-V2.1 TSA生命周期与监控专家  
**版本**: v1.0  
**日期**: 2026-02-13  
**状态**: 设计完成，待实现
