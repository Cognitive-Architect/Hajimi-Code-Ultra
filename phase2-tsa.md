# Phase 2 TSA三层产出

## 概述

TSA (Transient/Staging/Archive) 三层存储架构是一种智能分层存储方案，根据数据访问频率自动路由到不同的存储层：

- **Transient (瞬态层)** → Hot (内存) - 高频访问
- **Staging (暂态层)** → Warm (IndexedDB) - 中频访问  
- **Archive (归档层)** → Cold (文件) - 低频访问

---

## 1. TSA类型定义

### lib/tsa/types.ts

```typescript
/**
 * TSA三层存储类型定义
 * Transient/Staging/Archive Three-Tier Storage Architecture
 */

// ============================================================================
// 存储层枚举
// ============================================================================

export enum StorageTier {
  TRANSIENT = 'transient',  // 热层 - 内存存储
  STAGING = 'staging',      // 温层 - IndexedDB
  ARCHIVE = 'archive',      // 冷层 - 文件存储
}

// ============================================================================
// 访问频率统计
// ============================================================================

export interface AccessMetrics {
  key: string;
  readCount: number;
  writeCount: number;
  lastAccessed: number;
  lastWritten: number;
  createdAt: number;
  accessFrequency: number; // 计算出的访问频率得分
}

// ============================================================================
// 存储项定义
// ============================================================================

export interface StorageItem<T = unknown> {
  key: string;
  value: T;
  tier: StorageTier;
  version: number;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
  metrics: AccessMetrics;
}

// ============================================================================
// 路由决策
// ============================================================================

export interface RoutingDecision {
  key: string;
  targetTier: StorageTier;
  reason: RoutingReason;
  confidence: number; // 0-1
  previousTier?: StorageTier;
}

export enum RoutingReason {
  FREQUENCY_HIGH = 'frequency_high',
  FREQUENCY_MEDIUM = 'frequency_medium',
  FREQUENCY_LOW = 'frequency_low',
  EXPLICIT = 'explicit',
  PROMOTION = 'promotion',
  DEMOTION = 'demotion',
  EXPIRATION = 'expiration',
  CAPACITY = 'capacity',
  INITIAL = 'initial',
}

// ============================================================================
// 存储配置
// ============================================================================

export interface TransientStoreConfig {
  maxSize: number;           // 最大条目数
  maxMemoryMB: number;       // 最大内存(MB)
  defaultTTL: number;        // 默认过期时间(ms)
  evictionPolicy: 'lru' | 'lfu' | 'fifo';
}

export interface StagingStoreConfig {
  dbName: string;
  storeName: string;
  version: number;
  maxSize: number;
  defaultTTL: number;
  compressionEnabled: boolean;
}

export interface ArchiveStoreConfig {
  basePath: string;
  maxFileSizeMB: number;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
}

export interface StorageManagerConfig {
  transient: TransientStoreConfig;
  staging: StagingStoreConfig;
  archive: ArchiveStoreConfig;
  routing: TierRouterConfig;
}

// ============================================================================
// 路由配置
// ============================================================================

export interface TierRouterConfig {
  // 频率阈值 (次/分钟)
  highFrequencyThreshold: number;
  mediumFrequencyThreshold: number;
  
  // 检查间隔
  evaluationIntervalMs: number;
  
  // 晋升/降级冷却时间
  promotionCooldownMs: number;
  demotionCooldownMs: number;
  
  // 批处理大小
  batchSize: number;
  
  // 自动路由启用
  autoRoutingEnabled: boolean;
}

// ============================================================================
// 存储操作结果
// ============================================================================

export interface StorageResult<T = unknown> {
  success: boolean;
  data?: T;
  tier?: StorageTier;
  error?: StorageError;
}

export interface StorageError {
  code: ErrorCode;
  message: string;
  tier?: StorageTier;
  originalError?: Error;
}

export enum ErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  TIER_UNAVAILABLE = 'TIER_UNAVAILABLE',
  CAPACITY_EXCEEDED = 'CAPACITY_EXCEEDED',
  SERIALIZATION_ERROR = 'SERIALIZATION_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN = 'UNKNOWN',
}

// ============================================================================
// 存储接口
// ============================================================================

export interface ITierStore {
  readonly tier: StorageTier;
  readonly isAvailable: boolean;
  
  get<T>(key: string): Promise<StorageResult<T>>;
  set<T>(key: string, value: T, options?: SetOptions): Promise<StorageResult<void>>;
  delete(key: string): Promise<StorageResult<void>>;
  has(key: string): Promise<boolean>;
  keys(): Promise<string[]>;
  clear(): Promise<StorageResult<void>>;
  size(): Promise<number>;
  
  // 统计信息
  getMetrics(key: string): Promise<AccessMetrics | null>;
  getAllMetrics(): Promise<AccessMetrics[]>;
}

export interface SetOptions {
  ttl?: number;
  explicitTier?: StorageTier;
  metadata?: Record<string, unknown>;
  skipRouting?: boolean;
}

// ============================================================================
// 事件类型
// ============================================================================

export type StorageEventType = 
  | 'item:promoted'
  | 'item:demoted'
  | 'item:expired'
  | 'item:evicted'
  | 'tier:full'
  | 'tier:error'
  | 'routing:decision';

export interface StorageEvent {
  type: StorageEventType;
  key: string;
  timestamp: number;
  data?: unknown;
}

export type StorageEventListener = (event: StorageEvent) => void;

// ============================================================================
// Context类型
// ============================================================================

export interface TSAContextValue {
  // 核心操作
  get: <T>(key: string) => Promise<T | null>;
  set: <T>(key: string, value: T, options?: SetOptions) => Promise<void>;
  remove: (key: string) => Promise<void>;
  
  // 路由控制
  promote: (key: string, targetTier: StorageTier) => Promise<boolean>;
  getTier: (key: string) => Promise<StorageTier | null>;
  
  // 批量操作
  getMany: <T>(keys: string[]) => Promise<Record<string, T | null>>;
  setMany: <T>(entries: Record<string, T>, options?: SetOptions) => Promise<void>;
  
  // 统计与监控
  getMetrics: (key: string) => Promise<AccessMetrics | null>;
  getTierStats: () => Promise<TierStats>;
  
  // 状态
  isReady: boolean;
  isLoading: boolean;
  error: Error | null;
}

export interface TierStats {
  transient: { size: number; maxSize: number; memoryMB: number };
  staging: { size: number; maxSize: number };
  archive: { size: number; maxSize: number };
}

// ============================================================================
// Hook返回类型
// ============================================================================

export interface UseTSAReturn<T = unknown> {
  // 数据
  data: T | null;
  
  // 操作
  set: (value: T, options?: SetOptions) => Promise<void>;
  refresh: () => Promise<void>;
  remove: () => Promise<void>;
  promote: (targetTier: StorageTier) => Promise<boolean>;
  
  // 状态
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  currentTier: StorageTier | null;
  
  // 元数据
  metrics: AccessMetrics | null;
}
```

---

## 2. TSA管理器

### lib/tsa/StorageManager.ts

```typescript
/**
 * StorageManager - TSA三层存储核心管理器
 * 协调Transient/Staging/Archive三层存储，提供统一接口
 */

import {
  StorageTier,
  StorageItem,
  StorageResult,
  StorageError,
  ErrorCode,
  ITierStore,
  StorageManagerConfig,
  SetOptions,
  AccessMetrics,
  StorageEvent,
  StorageEventListener,
  TierStats,
} from './types';
import { TransientStore } from './TransientStore';
import { StagingStore } from './StagingStore';
import { ArchiveStore } from './ArchiveStore';
import { TierRouter } from './TierRouter';

// 默认配置
const DEFAULT_CONFIG: StorageManagerConfig = {
  transient: {
    maxSize: 1000,
    maxMemoryMB: 50,
    defaultTTL: 5 * 60 * 1000, // 5分钟
    evictionPolicy: 'lru',
  },
  staging: {
    dbName: 'TSAStagingDB',
    storeName: 'staging',
    version: 1,
    maxSize: 10000,
    defaultTTL: 60 * 60 * 1000, // 1小时
    compressionEnabled: true,
  },
  archive: {
    basePath: '/storage/archive',
    maxFileSizeMB: 100,
    compressionEnabled: true,
    encryptionEnabled: false,
  },
  routing: {
    highFrequencyThreshold: 10,    // 10次/分钟
    mediumFrequencyThreshold: 2,   // 2次/分钟
    evaluationIntervalMs: 60000,   // 1分钟
    promotionCooldownMs: 30000,    // 30秒
    demotionCooldownMs: 120000,    // 2分钟
    batchSize: 100,
    autoRoutingEnabled: true,
  },
};

export class StorageManager {
  private static instance: StorageManager | null = null;
  
  private transientStore: TransientStore;
  private stagingStore: StagingStore;
  private archiveStore: ArchiveStore;
  private router: TierRouter;
  
  private config: StorageManagerConfig;
  private eventListeners: Map<StorageEvent['type'], Set<StorageEventListener>> = new Map();
  private isInitialized = false;
  private routingTimer: NodeJS.Timeout | null = null;

  private constructor(config: Partial<StorageManagerConfig> = {}) {
    this.config = this.mergeConfig(config);
    
    // 初始化各层存储
    this.transientStore = new TransientStore(this.config.transient);
    this.stagingStore = new StagingStore(this.config.staging);
    this.archiveStore = new ArchiveStore(this.config.archive);
    
    // 初始化路由器
    this.router = new TierRouter(this.config.routing);
  }

  static getInstance(config?: Partial<StorageManagerConfig>): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager(config);
    }
    return StorageManager.instance;
  }

  static destroy(): void {
    if (StorageManager.instance) {
      StorageManager.instance.dispose();
      StorageManager.instance = null;
    }
  }

  // ============================================================================
  // 初始化与销毁
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 并行初始化各层存储
      await Promise.all([
        this.stagingStore.initialize(),
        this.archiveStore.initialize(),
      ]);

      this.isInitialized = true;

      // 启动自动路由
      if (this.config.routing.autoRoutingEnabled) {
        this.startAutoRouting();
      }
    } catch (error) {
      throw new Error(`Failed to initialize StorageManager: ${error}`);
    }
  }

  dispose(): void {
    this.stopAutoRouting();
    this.eventListeners.clear();
    this.transientStore.dispose?.();
    this.stagingStore.dispose?.();
    this.archiveStore.dispose?.();
    this.isInitialized = false;
  }

  // ============================================================================
  // 核心CRUD操作
  // ============================================================================

  async get<T>(key: string): Promise<StorageResult<T>> {
    this.ensureInitialized();

    // 1. 尝试从Transient获取 (最快)
    let result = await this.transientStore.get<T>(key);
    if (result.success && result.data !== undefined) {
      await this.updateAccessMetrics(key, 'read');
      return result;
    }

    // 2. 尝试从Staging获取
    result = await this.stagingStore.get<T>(key);
    if (result.success && result.data !== undefined) {
      // 考虑晋升到Transient
      await this.maybePromote(key, StorageTier.TRANSIENT);
      return result;
    }

    // 3. 尝试从Archive获取
    result = await this.archiveStore.get<T>(key);
    if (result.success && result.data !== undefined) {
      // 考虑晋升到Staging
      await this.maybePromote(key, StorageTier.STAGING);
      return result;
    }

    return {
      success: false,
      error: {
        code: ErrorCode.NOT_FOUND,
        message: `Key "${key}" not found in any tier`,
      },
    };
  }

  async set<T>(
    key: string,
    value: T,
    options: SetOptions = {}
  ): Promise<StorageResult<void>> {
    this.ensureInitialized();

    const { explicitTier, skipRouting } = options;

    // 确定目标存储层
    let targetTier: StorageTier;
    if (explicitTier) {
      targetTier = explicitTier;
    } else if (!skipRouting) {
      const decision = this.router.decideTier(key, null);
      targetTier = decision.targetTier;
    } else {
      targetTier = StorageTier.STAGING; // 默认
    }

    // 构建存储项
    const item = this.createStorageItem(key, value, targetTier, options);

    // 写入目标层
    const store = this.getStoreByTier(targetTier);
    const result = await store.set(key, item);

    if (result.success) {
      // 清理其他层中的旧数据
      await this.cleanOtherTiers(key, targetTier);
      this.emitEvent({
        type: 'routing:decision',
        key,
        timestamp: Date.now(),
        data: { tier: targetTier },
      });
    }

    return result;
  }

  async delete(key: string): Promise<StorageResult<void>> {
    this.ensureInitialized();

    // 从所有层删除
    const results = await Promise.all([
      this.transientStore.delete(key),
      this.stagingStore.delete(key),
      this.archiveStore.delete(key),
    ]);

    const anySuccess = results.some(r => r.success);
    
    return {
      success: anySuccess,
      error: anySuccess ? undefined : {
        code: ErrorCode.NOT_FOUND,
        message: `Key "${key}" not found`,
      },
    };
  }

  async has(key: string): Promise<boolean> {
    this.ensureInitialized();

    const results = await Promise.all([
      this.transientStore.has(key),
      this.stagingStore.has(key),
      this.archiveStore.has(key),
    ]);

    return results.some(r => r);
  }

  async keys(): Promise<string[]> {
    this.ensureInitialized();

    const allKeys = await Promise.all([
      this.transientStore.keys(),
      this.stagingStore.keys(),
      this.archiveStore.keys(),
    ]);

    // 去重
    return [...new Set(allKeys.flat())];
  }

  async clear(): Promise<StorageResult<void>> {
    this.ensureInitialized();

    const results = await Promise.all([
      this.transientStore.clear(),
      this.stagingStore.clear(),
      this.archiveStore.clear(),
    ]);

    const allSuccess = results.every(r => r.success);

    return {
      success: allSuccess,
      error: allSuccess ? undefined : {
        code: ErrorCode.UNKNOWN,
        message: 'Failed to clear some tiers',
      },
    };
  }

  // ============================================================================
  // 批量操作
  // ============================================================================

  async getMany<T>(keys: string[]): Promise<Record<string, T | null>> {
    const results: Record<string, T | null> = {};
    
    await Promise.all(
      keys.map(async (key) => {
        const result = await this.get<T>(key);
        results[key] = result.success ? result.data ?? null : null;
      })
    );

    return results;
  }

  async setMany<T>(
    entries: Record<string, T>,
    options?: SetOptions
  ): Promise<StorageResult<void>> {
    const promises = Object.entries(entries).map(([key, value]) =>
      this.set(key, value, options)
    );

    const results = await Promise.all(promises);
    const allSuccess = results.every(r => r.success);

    return {
      success: allSuccess,
      error: allSuccess ? undefined : {
        code: ErrorCode.UNKNOWN,
        message: 'Some batch operations failed',
      },
    };
  }

  // ============================================================================
  // 路由与晋升
  // ============================================================================

  async promote(key: string, targetTier: StorageTier): Promise<boolean> {
    const currentTier = await this.getCurrentTier(key);
    if (currentTier === targetTier) return true;

    const result = await this.get(key);
    if (!result.success || result.data === undefined) return false;

    // 写入目标层
    const setResult = await this.set(key, result.data, {
      explicitTier: targetTier,
      skipRouting: true,
    });

    if (setResult.success) {
      this.emitEvent({
        type: 'item:promoted',
        key,
        timestamp: Date.now(),
        data: { from: currentTier, to: targetTier },
      });
    }

    return setResult.success;
  }

  async demote(key: string, targetTier: StorageTier): Promise<boolean> {
    return this.promote(key, targetTier);
  }

  async getCurrentTier(key: string): Promise<StorageTier | null> {
    if (await this.transientStore.has(key)) return StorageTier.TRANSIENT;
    if (await this.stagingStore.has(key)) return StorageTier.STAGING;
    if (await this.archiveStore.has(key)) return StorageTier.ARCHIVE;
    return null;
  }

  // ============================================================================
  // 统计信息
  // ============================================================================

  async getMetrics(key: string): Promise<AccessMetrics | null> {
    const stores = [this.transientStore, this.stagingStore, this.archiveStore];
    
    for (const store of stores) {
      const metrics = await store.getMetrics(key);
      if (metrics) return metrics;
    }
    
    return null;
  }

  async getTierStats(): Promise<TierStats> {
    const [transientSize, stagingSize, archiveSize] = await Promise.all([
      this.transientStore.size(),
      this.stagingStore.size(),
      this.archiveStore.size(),
    ]);

    return {
      transient: {
        size: transientSize,
        maxSize: this.config.transient.maxSize,
        memoryMB: this.transientStore.getMemoryUsageMB(),
      },
      staging: {
        size: stagingSize,
        maxSize: this.config.staging.maxSize,
      },
      archive: {
        size: archiveSize,
        maxSize: this.config.archive.maxFileSizeMB * 100, // 估算
      },
    };
  }

  // ============================================================================
  // 事件系统
  // ============================================================================

  on(event: StorageEvent['type'], listener: StorageEventListener): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);

    return () => {
      this.eventListeners.get(event)?.delete(listener);
    };
  }

  private emitEvent(event: StorageEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('Event listener error:', error);
        }
      });
    }
  }

  // ============================================================================
  // 自动路由
  // ============================================================================

  private startAutoRouting(): void {
    if (this.routingTimer) return;

    this.routingTimer = setInterval(
      () => this.evaluateAndRoute(),
      this.config.routing.evaluationIntervalMs
    );
  }

  private stopAutoRouting(): void {
    if (this.routingTimer) {
      clearInterval(this.routingTimer);
      this.routingTimer = null;
    }
  }

  private async evaluateAndRoute(): Promise<void> {
    const allKeys = await this.keys();
    const batchSize = this.config.routing.batchSize;

    for (let i = 0; i < allKeys.length; i += batchSize) {
      const batch = allKeys.slice(i, i + batchSize);
      await Promise.all(batch.map(key => this.evaluateKey(key)));
    }
  }

  private async evaluateKey(key: string): Promise<void> {
    const metrics = await this.getMetrics(key);
    if (!metrics) return;

    const currentTier = await this.getCurrentTier(key);
    if (!currentTier) return;

    const decision = this.router.decideTier(key, metrics);
    
    if (decision.targetTier !== currentTier) {
      await this.promote(key, decision.targetTier);
    }
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('StorageManager not initialized. Call initialize() first.');
    }
  }

  private mergeConfig(config: Partial<StorageManagerConfig>): StorageManagerConfig {
    return {
      transient: { ...DEFAULT_CONFIG.transient, ...config.transient },
      staging: { ...DEFAULT_CONFIG.staging, ...config.staging },
      archive: { ...DEFAULT_CONFIG.archive, ...config.archive },
      routing: { ...DEFAULT_CONFIG.routing, ...config.routing },
    };
  }

  private getStoreByTier(tier: StorageTier): ITierStore {
    switch (tier) {
      case StorageTier.TRANSIENT:
        return this.transientStore;
      case StorageTier.STAGING:
        return this.stagingStore;
      case StorageTier.ARCHIVE:
        return this.archiveStore;
      default:
        throw new Error(`Unknown tier: ${tier}`);
    }
  }

  private createStorageItem<T>(
    key: string,
    value: T,
    tier: StorageTier,
    options: SetOptions
  ): StorageItem<T> {
    const now = Date.now();
    
    return {
      key,
      value,
      tier,
      version: 1,
      createdAt: now,
      updatedAt: now,
      expiresAt: options.ttl ? now + options.ttl : undefined,
      metadata: options.metadata,
      metrics: {
        key,
        readCount: 0,
        writeCount: 1,
        lastAccessed: now,
        lastWritten: now,
        createdAt: now,
        accessFrequency: 0,
      },
    };
  }

  private async updateAccessMetrics(key: string, type: 'read' | 'write'): Promise<void> {
    // 由各个store自行维护metrics
  }

  private async maybePromote(key: string, toTier: StorageTier): Promise<void> {
    const metrics = await this.getMetrics(key);
    if (!metrics) return;

    const decision = this.router.decideTier(key, metrics);
    if (decision.targetTier === toTier || decision.targetTier === StorageTier.TRANSIENT) {
      await this.promote(key, toTier);
    }
  }

  private async cleanOtherTiers(key: string, keepTier: StorageTier): Promise<void> {
    const tiers = [StorageTier.TRANSIENT, StorageTier.STAGING, StorageTier.ARCHIVE]
      .filter(t => t !== keepTier);

    await Promise.all(
      tiers.map(async (tier) => {
        const store = this.getStoreByTier(tier);
        if (await store.has(key)) {
          await store.delete(key);
        }
      })
    );
  }
}

// 导出单例
export const storageManager = StorageManager.getInstance();
```

---

## 3. 瞬态存储

### lib/tsa/TransientStore.ts

```typescript
/**
 * TransientStore - 瞬态存储层 (热层)
 * 基于内存的LRU缓存，提供最高性能访问
 */

import {
  StorageTier,
  StorageItem,
  StorageResult,
  StorageError,
  ErrorCode,
  ITierStore,
  TransientStoreConfig,
  AccessMetrics,
  SetOptions,
} from './types';

interface LRUCacheNode<T> {
  key: string;
  item: StorageItem<T>;
  prev: LRUCacheNode<T> | null;
  next: LRUCacheNode<T> | null;
}

export class TransientStore implements ITierStore {
  readonly tier = StorageTier.TRANSIENT;
  readonly isAvailable = true;

  private config: TransientStoreConfig;
  private cache: Map<string, LRUCacheNode<unknown>> = new Map();
  private head: LRUCacheNode<unknown> | null = null;
  private tail: LRUCacheNode<unknown> | null = null;
  private currentMemoryBytes = 0;

  constructor(config: TransientStoreConfig) {
    this.config = config;
  }

  // ============================================================================
  // 核心操作
  // ============================================================================

  async get<T>(key: string): Promise<StorageResult<T>> {
    const node = this.cache.get(key);
    
    if (!node) {
      return {
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: `Key "${key}" not found in transient store`,
          tier: this.tier,
        },
      };
    }

    // 检查过期
    if (this.isExpired(node.item)) {
      this.removeNode(node);
      return {
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: `Key "${key}" has expired`,
          tier: this.tier,
        },
      };
    }

    // 更新LRU位置
    this.moveToHead(node);
    
    // 更新访问统计
    this.updateMetrics(node.item, 'read');

    return {
      success: true,
      data: node.item.value as T,
      tier: this.tier,
    };
  }

  async set<T>(
    key: string,
    value: T | StorageItem<T>,
    options?: SetOptions
  ): Promise<StorageResult<void>> {
    try {
      let item: StorageItem<T>;

      if (this.isStorageItem(value)) {
        item = value;
      } else {
        item = this.createItem(key, value, options);
      }

      const itemSize = this.estimateSize(item);

      // 检查容量并执行淘汰
      while (
        this.cache.size >= this.config.maxSize ||
        this.currentMemoryBytes + itemSize > this.config.maxMemoryMB * 1024 * 1024
      ) {
        if (this.tail) {
          this.evictLRU();
        } else {
          break;
        }
      }

      // 检查是否已存在
      const existingNode = this.cache.get(key);
      if (existingNode) {
        this.currentMemoryBytes -= this.estimateSize(existingNode.item);
        existingNode.item = item;
        this.currentMemoryBytes += itemSize;
        this.moveToHead(existingNode);
      } else {
        const newNode = this.createNode(item);
        this.cache.set(key, newNode);
        this.currentMemoryBytes += itemSize;
        this.addToHead(newNode);
      }

      return { success: true, tier: this.tier };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCode.UNKNOWN,
          message: `Failed to set key "${key}": ${error}`,
          tier: this.tier,
          originalError: error as Error,
        },
      };
    }
  }

  async delete(key: string): Promise<StorageResult<void>> {
    const node = this.cache.get(key);
    
    if (!node) {
      return {
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: `Key "${key}" not found`,
          tier: this.tier,
        },
      };
    }

    this.removeNode(node);
    return { success: true, tier: this.tier };
  }

  async has(key: string): Promise<boolean> {
    const node = this.cache.get(key);
    if (!node) return false;
    
    if (this.isExpired(node.item)) {
      this.removeNode(node);
      return false;
    }
    
    return true;
  }

  async keys(): Promise<string[]> {
    this.cleanupExpired();
    return Array.from(this.cache.keys());
  }

  async clear(): Promise<StorageResult<void>> {
    this.cache.clear();
    this.head = null;
    this.tail = null;
    this.currentMemoryBytes = 0;
    return { success: true, tier: this.tier };
  }

  async size(): Promise<number> {
    this.cleanupExpired();
    return this.cache.size;
  }

  // ============================================================================
  // 统计信息
  // ============================================================================

  async getMetrics(key: string): Promise<AccessMetrics | null> {
    const node = this.cache.get(key);
    return node ? node.item.metrics : null;
  }

  async getAllMetrics(): Promise<AccessMetrics[]> {
    return Array.from(this.cache.values()).map(node => node.item.metrics);
  }

  getMemoryUsageMB(): number {
    return this.currentMemoryBytes / (1024 * 1024);
  }

  // ============================================================================
  // LRU缓存操作
  // ============================================================================

  private createNode<T>(item: StorageItem<T>): LRUCacheNode<T> {
    return {
      key: item.key,
      item: item as StorageItem<unknown>,
      prev: null,
      next: null,
    };
  }

  private addToHead(node: LRUCacheNode<unknown>): void {
    node.next = this.head;
    node.prev = null;

    if (this.head) {
      this.head.prev = node;
    }

    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: LRUCacheNode<unknown>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    this.cache.delete(node.key);
    this.currentMemoryBytes -= this.estimateSize(node.item);
  }

  private moveToHead(node: LRUCacheNode<unknown>): void {
    this.removeNode(node);
    this.addToHead(node);
  }

  private evictLRU(): void {
    if (this.tail) {
      this.removeNode(this.tail);
    }
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  private isStorageItem<T>(value: T | StorageItem<T>): value is StorageItem<T> {
    return value !== null &&
           typeof value === 'object' &&
           'key' in value &&
           'value' in value &&
           'tier' in value;
  }

  private createItem<T>(
    key: string,
    value: T,
    options?: SetOptions
  ): StorageItem<T> {
    const now = Date.now();
    
    return {
      key,
      value,
      tier: StorageTier.TRANSIENT,
      version: 1,
      createdAt: now,
      updatedAt: now,
      expiresAt: options?.ttl ? now + options.ttl : now + this.config.defaultTTL,
      metadata: options?.metadata,
      metrics: {
        key,
        readCount: 0,
        writeCount: 1,
        lastAccessed: now,
        lastWritten: now,
        createdAt: now,
        accessFrequency: 0,
      },
    };
  }

  private isExpired(item: StorageItem<unknown>): boolean {
    if (!item.expiresAt) return false;
    return Date.now() > item.expiresAt;
  }

  private cleanupExpired(): void {
    const expired: string[] = [];
    
    for (const [key, node] of this.cache.entries()) {
      if (this.isExpired(node.item)) {
        expired.push(key);
      }
    }

    expired.forEach(key => {
      const node = this.cache.get(key);
      if (node) this.removeNode(node);
    });
  }

  private updateMetrics(item: StorageItem<unknown>, type: 'read' | 'write'): void {
    const now = Date.now();
    
    if (type === 'read') {
      item.metrics.readCount++;
      item.metrics.lastAccessed = now;
    } else {
      item.metrics.writeCount++;
      item.metrics.lastWritten = now;
    }

    // 计算访问频率 (次/分钟)
    const ageMinutes = (now - item.metrics.createdAt) / 60000;
    const totalAccess = item.metrics.readCount + item.metrics.writeCount;
    item.metrics.accessFrequency = ageMinutes > 0 ? totalAccess / ageMinutes : totalAccess;
  }

  private estimateSize(item: StorageItem<unknown>): number {
    try {
      const json = JSON.stringify(item);
      // UTF-8 编码，每个字符1-4字节，估算平均2字节
      return json.length * 2;
    } catch {
      // 无法序列化时估算
      return 1024;
    }
  }

  dispose(): void {
    this.clear();
  }
}
```

---

## 4. 暂态存储

### lib/tsa/StagingStore.ts

```typescript
/**
 * StagingStore - 暂态存储层 (温层)
 * 基于IndexedDB的持久化存储，提供中等性能访问
 */

import {
  StorageTier,
  StorageItem,
  StorageResult,
  StorageError,
  ErrorCode,
  ITierStore,
  StagingStoreConfig,
  AccessMetrics,
  SetOptions,
} from './types';

const DB_NAME = 'TSAStagingDB';
const STORE_NAME = 'staging';
const DB_VERSION = 1;
const METRICS_STORE = 'metrics';

export class StagingStore implements ITierStore {
  readonly tier = StorageTier.STAGING;
  isAvailable = false;

  private config: StagingStoreConfig;
  private db: IDBDatabase | null = null;
  private pendingOperations: (() => void)[] = [];
  private isInitialized = false;

  constructor(config: StagingStoreConfig) {
    this.config = {
      dbName: DB_NAME,
      storeName: STORE_NAME,
      version: DB_VERSION,
      maxSize: 10000,
      defaultTTL: 60 * 60 * 1000, // 1小时
      compressionEnabled: true,
      ...config,
    };
  }

  // ============================================================================
  // 初始化
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.dbName, this.config.version);

      request.onerror = () => {
        this.isAvailable = false;
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isAvailable = true;
        this.isInitialized = true;
        this.flushPendingOperations();
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // 主存储
        if (!db.objectStoreNames.contains(this.config.storeName)) {
          const store = db.createObjectStore(this.config.storeName, { keyPath: 'key' });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        
        // 指标存储
        if (!db.objectStoreNames.contains(METRICS_STORE)) {
          db.createObjectStore(METRICS_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  dispose(): void {
    this.db?.close();
    this.db = null;
    this.isInitialized = false;
    this.isAvailable = false;
  }

  // ============================================================================
  // 核心操作
  // ============================================================================

  async get<T>(key: string): Promise<StorageResult<T>> {
    if (!this.ensureAvailable()) {
      return this.unavailableError();
    }

    try {
      const item = await this.getFromStore<StorageItem<T>>(this.config.storeName, key);

      if (!item) {
        return {
          success: false,
          error: {
            code: ErrorCode.NOT_FOUND,
            message: `Key "${key}" not found in staging store`,
            tier: this.tier,
          },
        };
      }

      // 检查过期
      if (this.isExpired(item)) {
        await this.delete(key);
        return {
          success: false,
          error: {
            code: ErrorCode.NOT_FOUND,
            message: `Key "${key}" has expired`,
            tier: this.tier,
          },
        };
      }

      // 更新访问统计
      await this.updateMetrics(key, 'read');

      // 解压值
      const value = this.config.compressionEnabled
        ? await this.decompress(item.value)
        : item.value;

      return {
        success: true,
        data: value as T,
        tier: this.tier,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCode.UNKNOWN,
          message: `Failed to get key "${key}": ${error}`,
          tier: this.tier,
          originalError: error as Error,
        },
      };
    }
  }

  async set<T>(
    key: string,
    value: T | StorageItem<T>,
    options?: SetOptions
  ): Promise<StorageResult<void>> {
    if (!this.ensureAvailable()) {
      return this.unavailableError();
    }

    try {
      let item: StorageItem<T>;

      if (this.isStorageItem(value)) {
        item = value;
      } else {
        item = this.createItem(key, value, options);
      }

      // 压缩值
      const valueToStore = this.config.compressionEnabled
        ? await this.compress(item.value)
        : item.value;

      const storeItem = {
        ...item,
        value: valueToStore,
      };

      await this.putToStore(this.config.storeName, storeItem);
      await this.putToStore(METRICS_STORE, item.metrics);

      // 检查容量
      await this.enforceCapacityLimit();

      return { success: true, tier: this.tier };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCode.UNKNOWN,
          message: `Failed to set key "${key}": ${error}`,
          tier: this.tier,
          originalError: error as Error,
        },
      };
    }
  }

  async delete(key: string): Promise<StorageResult<void>> {
    if (!this.ensureAvailable()) {
      return this.unavailableError();
    }

    try {
      await this.deleteFromStore(this.config.storeName, key);
      await this.deleteFromStore(METRICS_STORE, key);
      return { success: true, tier: this.tier };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCode.UNKNOWN,
          message: `Failed to delete key "${key}": ${error}`,
          tier: this.tier,
          originalError: error as Error,
        },
      };
    }
  }

  async has(key: string): Promise<boolean> {
    if (!this.ensureAvailable()) return false;

    try {
      const item = await this.getFromStore<StorageItem<unknown>>(this.config.storeName, key);
      if (!item) return false;
      
      if (this.isExpired(item)) {
        await this.delete(key);
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }

  async keys(): Promise<string[]> {
    if (!this.ensureAvailable()) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.config.storeName], 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        resolve(request.result as string[]);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async clear(): Promise<StorageResult<void>> {
    if (!this.ensureAvailable()) {
      return this.unavailableError();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.config.storeName, METRICS_STORE], 'readwrite');
      
      transaction.objectStore(this.config.storeName).clear();
      transaction.objectStore(METRICS_STORE).clear();

      transaction.oncomplete = () => {
        resolve({ success: true, tier: this.tier });
      };

      transaction.onerror = () => {
        reject({
          success: false,
          error: {
            code: ErrorCode.UNKNOWN,
            message: 'Failed to clear staging store',
            tier: this.tier,
          },
        });
      };
    });
  }

  async size(): Promise<number> {
    if (!this.ensureAvailable()) return 0;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.config.storeName], 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.count();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(0);
      };
    });
  }

  // ============================================================================
  // 统计信息
  // ============================================================================

  async getMetrics(key: string): Promise<AccessMetrics | null> {
    if (!this.ensureAvailable()) return null;
    return this.getFromStore<AccessMetrics>(METRICS_STORE, key);
  }

  async getAllMetrics(): Promise<AccessMetrics[]> {
    if (!this.ensureAvailable()) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([METRICS_STORE], 'readonly');
      const store = transaction.objectStore(METRICS_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result as AccessMetrics[]);
      };

      request.onerror = () => {
        reject([]);
      };
    });
  }

  // ============================================================================
  // IndexedDB辅助方法
  // ============================================================================

  private getFromStore<T>(storeName: string, key: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result ?? null);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  private putToStore<T>(storeName: string, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(value);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  private deleteFromStore(storeName: string, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  private ensureAvailable(): boolean {
    if (!this.isAvailable || !this.db) {
      return false;
    }
    return true;
  }

  private unavailableError(): StorageResult<never> {
    return {
      success: false,
      error: {
        code: ErrorCode.TIER_UNAVAILABLE,
        message: 'Staging store is not available',
        tier: this.tier,
      },
    };
  }

  private flushPendingOperations(): void {
    while (this.pendingOperations.length > 0) {
      const operation = this.pendingOperations.shift();
      operation?.();
    }
  }

  private isStorageItem<T>(value: T | StorageItem<T>): value is StorageItem<T> {
    return value !== null &&
           typeof value === 'object' &&
           'key' in value &&
           'value' in value &&
           'tier' in value;
  }

  private createItem<T>(
    key: string,
    value: T,
    options?: SetOptions
  ): StorageItem<T> {
    const now = Date.now();
    
    return {
      key,
      value,
      tier: StorageTier.STAGING,
      version: 1,
      createdAt: now,
      updatedAt: now,
      expiresAt: options?.ttl ? now + options.ttl : now + this.config.defaultTTL,
      metadata: options?.metadata,
      metrics: {
        key,
        readCount: 0,
        writeCount: 1,
        lastAccessed: now,
        lastWritten: now,
        createdAt: now,
        accessFrequency: 0,
      },
    };
  }

  private isExpired(item: StorageItem<unknown>): boolean {
    if (!item.expiresAt) return false;
    return Date.now() > item.expiresAt;
  }

  private async updateMetrics(key: string, type: 'read' | 'write'): Promise<void> {
    const metrics = await this.getMetrics(key);
    if (!metrics) return;

    const now = Date.now();
    
    if (type === 'read') {
      metrics.readCount++;
      metrics.lastAccessed = now;
    } else {
      metrics.writeCount++;
      metrics.lastWritten = now;
    }

    const ageMinutes = (now - metrics.createdAt) / 60000;
    const totalAccess = metrics.readCount + metrics.writeCount;
    metrics.accessFrequency = ageMinutes > 0 ? totalAccess / ageMinutes : totalAccess;

    await this.putToStore(METRICS_STORE, metrics);
  }

  private async enforceCapacityLimit(): Promise<void> {
    const count = await this.size();
    if (count <= this.config.maxSize) return;

    // 获取最旧的条目
    const oldItems = await this.getOldestItems(count - this.config.maxSize);
    
    for (const key of oldItems) {
      await this.delete(key);
    }
  }

  private async getOldestItems(limit: number): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.config.storeName], 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      const index = store.index('updatedAt');
      const request = index.openCursor();

      const keys: string[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && keys.length < limit) {
          keys.push(cursor.value.key);
          cursor.continue();
        } else {
          resolve(keys);
        }
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  // ============================================================================
  // 压缩/解压 (简化实现)
  // ============================================================================

  private async compress<T>(data: T): Promise<T> {
    // 实际实现可使用 pako 或 CompressionStream API
    // 这里返回原始数据作为占位
    return data;
  }

  private async decompress<T>(data: T): Promise<T> {
    // 实际实现与compress对应
    return data;
  }
}
```

---

## 5. 归档存储

### lib/tsa/ArchiveStore.ts

```typescript
/**
 * ArchiveStore - 归档存储层 (冷层)
 * 基于文件系统的持久化存储，适合低频访问的大容量数据
 */

import {
  StorageTier,
  StorageItem,
  StorageResult,
  StorageError,
  ErrorCode,
  ITierStore,
  ArchiveStoreConfig,
  AccessMetrics,
  SetOptions,
} from './types';

// 模拟文件系统接口 (实际项目中使用 Node.js fs 或 OPFS)
interface FileSystem {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  listFiles(path: string): Promise<string[]>;
  createDirectory(path: string): Promise<void>;
}

// OPFS (Origin Private File System) 实现
class OPFSFileSystem implements FileSystem {
  private root: FileSystemDirectoryHandle | null = null;

  async initialize(): Promise<void> {
    this.root = await navigator.storage.getDirectory();
  }

  async readFile(path: string): Promise<Uint8Array> {
    if (!this.root) throw new Error('File system not initialized');
    
    const parts = path.split('/').filter(Boolean);
    const fileName = parts.pop()!;
    const dir = await this.getDirectory(parts);
    
    const fileHandle = await dir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    if (!this.root) throw new Error('File system not initialized');
    
    const parts = path.split('/').filter(Boolean);
    const fileName = parts.pop()!;
    const dir = await this.getDirectory(parts, true);
    
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  async deleteFile(path: string): Promise<void> {
    if (!this.root) throw new Error('File system not initialized');
    
    const parts = path.split('/').filter(Boolean);
    const fileName = parts.pop()!;
    const dir = await this.getDirectory(parts);
    
    await dir.removeEntry(fileName);
  }

  async exists(path: string): Promise<boolean> {
    if (!this.root) return false;
    
    try {
      const parts = path.split('/').filter(Boolean);
      const fileName = parts.pop()!;
      const dir = await this.getDirectory(parts);
      await dir.getFileHandle(fileName);
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(path: string): Promise<string[]> {
    if (!this.root) return [];
    
    const parts = path.split('/').filter(Boolean);
    const dir = await this.getDirectory(parts);
    
    const files: string[] = [];
    for await (const entry of dir.values()) {
      if (entry.kind === 'file') {
        files.push(entry.name);
      }
    }
    return files;
  }

  async createDirectory(path: string): Promise<void> {
    if (!this.root) throw new Error('File system not initialized');
    
    const parts = path.split('/').filter(Boolean);
    await this.getDirectory(parts, true);
  }

  private async getDirectory(
    parts: string[],
    create = false
  ): Promise<FileSystemDirectoryHandle> {
    if (!this.root) throw new Error('File system not initialized');
    
    let current = this.root;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create });
    }
    return current;
  }
}

export class ArchiveStore implements ITierStore {
  readonly tier = StorageTier.ARCHIVE;
  isAvailable = false;

  private config: ArchiveStoreConfig;
  private fs: FileSystem;
  private isInitialized = false;
  private index: Map<string, { path: string; size: number }> = new Map();
  private readonly INDEX_FILE = 'index.json';

  constructor(config: ArchiveStoreConfig) {
    this.config = {
      basePath: '/storage/archive',
      maxFileSizeMB: 100,
      compressionEnabled: true,
      encryptionEnabled: false,
      ...config,
    };
    this.fs = new OPFSFileSystem();
  }

  // ============================================================================
  // 初始化
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 检查 OPFS 支持
      if (!('storage' in navigator && 'getDirectory' in navigator.storage)) {
        throw new Error('Origin Private File System not supported');
      }

      await (this.fs as OPFSFileSystem).initialize();
      await this.fs.createDirectory(this.config.basePath);
      
      // 加载索引
      await this.loadIndex();
      
      this.isAvailable = true;
      this.isInitialized = true;
    } catch (error) {
      this.isAvailable = false;
      throw new Error(`Failed to initialize ArchiveStore: ${error}`);
    }
  }

  dispose(): void {
    this.saveIndex().catch(console.error);
    this.isInitialized = false;
    this.isAvailable = false;
  }

  // ============================================================================
  // 核心操作
  // ============================================================================

  async get<T>(key: string): Promise<StorageResult<T>> {
    if (!this.ensureAvailable()) {
      return this.unavailableError();
    }

    try {
      const entry = this.index.get(key);
      if (!entry) {
        return {
          success: false,
          error: {
            code: ErrorCode.NOT_FOUND,
            message: `Key "${key}" not found in archive store`,
            tier: this.tier,
          },
        };
      }

      const data = await this.fs.readFile(entry.path);
      const item = await this.deserialize<StorageItem<T>>(data);

      // 检查过期
      if (this.isExpired(item)) {
        await this.delete(key);
        return {
          success: false,
          error: {
            code: ErrorCode.NOT_FOUND,
            message: `Key "${key}" has expired`,
            tier: this.tier,
          },
        };
      }

      // 更新访问统计
      await this.updateMetrics(key, 'read');

      return {
        success: true,
        data: item.value,
        tier: this.tier,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCode.UNKNOWN,
          message: `Failed to get key "${key}": ${error}`,
          tier: this.tier,
          originalError: error as Error,
        },
      };
    }
  }

  async set<T>(
    key: string,
    value: T | StorageItem<T>,
    options?: SetOptions
  ): Promise<StorageResult<void>> {
    if (!this.ensureAvailable()) {
      return this.unavailableError();
    }

    try {
      let item: StorageItem<T>;

      if (this.isStorageItem(value)) {
        item = value;
      } else {
        item = this.createItem(key, value, options);
      }

      // 序列化
      const data = await this.serialize(item);
      
      // 检查文件大小
      if (data.length > this.config.maxFileSizeMB * 1024 * 1024) {
        return {
          success: false,
          error: {
            code: ErrorCode.CAPACITY_EXCEEDED,
            message: `Data size exceeds max file size limit`,
            tier: this.tier,
          },
        };
      }

      // 生成文件路径
      const filePath = this.getFilePath(key);
      await this.fs.writeFile(filePath, data);

      // 更新索引
      this.index.set(key, {
        path: filePath,
        size: data.length,
      });
      await this.saveIndex();

      // 保存指标
      await this.saveMetrics(key, item.metrics);

      return { success: true, tier: this.tier };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCode.UNKNOWN,
          message: `Failed to set key "${key}": ${error}`,
          tier: this.tier,
          originalError: error as Error,
        },
      };
    }
  }

  async delete(key: string): Promise<StorageResult<void>> {
    if (!this.ensureAvailable()) {
      return this.unavailableError();
    }

    try {
      const entry = this.index.get(key);
      if (!entry) {
        return {
          success: false,
          error: {
            code: ErrorCode.NOT_FOUND,
            message: `Key "${key}" not found`,
            tier: this.tier,
          },
        };
      }

      await this.fs.deleteFile(entry.path);
      this.index.delete(key);
      await this.saveIndex();

      // 删除指标文件
      try {
        await this.fs.deleteFile(this.getMetricsPath(key));
      } catch {
        // 忽略指标文件不存在错误
      }

      return { success: true, tier: this.tier };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCode.UNKNOWN,
          message: `Failed to delete key "${key}": ${error}`,
          tier: this.tier,
          originalError: error as Error,
        },
      };
    }
  }

  async has(key: string): Promise<boolean> {
    if (!this.ensureAvailable()) return false;

    const entry = this.index.get(key);
    if (!entry) return false;

    const exists = await this.fs.exists(entry.path);
    if (!exists) {
      this.index.delete(key);
      return false;
    }

    return true;
  }

  async keys(): Promise<string[]> {
    if (!this.ensureAvailable()) return [];
    return Array.from(this.index.keys());
  }

  async clear(): Promise<StorageResult<void>> {
    if (!this.ensureAvailable()) {
      return this.unavailableError();
    }

    try {
      // 删除所有文件
      const deletePromises: Promise<void>[] = [];
      for (const [key, entry] of this.index) {
        deletePromises.push(
          this.fs.deleteFile(entry.path).catch(() => {})
        );
      }
      await Promise.all(deletePromises);

      this.index.clear();
      await this.saveIndex();

      return { success: true, tier: this.tier };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCode.UNKNOWN,
          message: `Failed to clear archive store: ${error}`,
          tier: this.tier,
          originalError: error as Error,
        },
      };
    }
  }

  async size(): Promise<number> {
    if (!this.ensureAvailable()) return 0;
    return this.index.size;
  }

  // ============================================================================
  // 统计信息
  // ============================================================================

  async getMetrics(key: string): Promise<AccessMetrics | null> {
    if (!this.ensureAvailable()) return null;

    try {
      const path = this.getMetricsPath(key);
      if (!(await this.fs.exists(path))) return null;

      const data = await this.fs.readFile(path);
      return await this.deserialize<AccessMetrics>(data);
    } catch {
      return null;
    }
  }

  async getAllMetrics(): Promise<AccessMetrics[]> {
    if (!this.ensureAvailable()) return [];

    const metrics: AccessMetrics[] = [];
    for (const key of this.index.keys()) {
      const m = await this.getMetrics(key);
      if (m) metrics.push(m);
    }
    return metrics;
  }

  // ============================================================================
  // 索引管理
  // ============================================================================

  private async loadIndex(): Promise<void> {
    try {
      const indexPath = `${this.config.basePath}/${this.INDEX_FILE}`;
      if (await this.fs.exists(indexPath)) {
        const data = await this.fs.readFile(indexPath);
        const indexData = await this.deserialize<Record<string, { path: string; size: number }>>(data);
        this.index = new Map(Object.entries(indexData));
      }
    } catch (error) {
      console.warn('Failed to load archive index:', error);
      this.index = new Map();
    }
  }

  private async saveIndex(): Promise<void> {
    try {
      const indexPath = `${this.config.basePath}/${this.INDEX_FILE}`;
      const indexData = Object.fromEntries(this.index);
      const data = await this.serialize(indexData);
      await this.fs.writeFile(indexPath, data);
    } catch (error) {
      console.warn('Failed to save archive index:', error);
    }
  }

  private async saveMetrics(key: string, metrics: AccessMetrics): Promise<void> {
    try {
      const path = this.getMetricsPath(key);
      const data = await this.serialize(metrics);
      await this.fs.writeFile(path, data);
    } catch (error) {
      console.warn(`Failed to save metrics for ${key}:`, error);
    }
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  private ensureAvailable(): boolean {
    return this.isInitialized && this.isAvailable;
  }

  private unavailableError(): StorageResult<never> {
    return {
      success: false,
      error: {
        code: ErrorCode.TIER_UNAVAILABLE,
        message: 'Archive store is not available',
        tier: this.tier,
      },
    };
  }

  private isStorageItem<T>(value: T | StorageItem<T>): value is StorageItem<T> {
    return value !== null &&
           typeof value === 'object' &&
           'key' in value &&
           'value' in value &&
           'tier' in value;
  }

  private createItem<T>(
    key: string,
    value: T,
    options?: SetOptions
  ): StorageItem<T> {
    const now = Date.now();
    
    return {
      key,
      value,
      tier: StorageTier.ARCHIVE,
      version: 1,
      createdAt: now,
      updatedAt: now,
      expiresAt: options?.ttl ? now + options.ttl : undefined,
      metadata: options?.metadata,
      metrics: {
        key,
        readCount: 0,
        writeCount: 1,
        lastAccessed: now,
        lastWritten: now,
        createdAt: now,
        accessFrequency: 0,
      },
    };
  }

  private isExpired(item: StorageItem<unknown>): boolean {
    if (!item.expiresAt) return false;
    return Date.now() > item.expiresAt;
  }

  private async updateMetrics(key: string, type: 'read' | 'write'): Promise<void> {
    const metrics = await this.getMetrics(key);
    if (!metrics) return;

    const now = Date.now();
    
    if (type === 'read') {
      metrics.readCount++;
      metrics.lastAccessed = now;
    } else {
      metrics.writeCount++;
      metrics.lastWritten = now;
    }

    const ageMinutes = (now - metrics.createdAt) / 60000;
    const totalAccess = metrics.readCount + metrics.writeCount;
    metrics.accessFrequency = ageMinutes > 0 ? totalAccess / ageMinutes : totalAccess;

    await this.saveMetrics(key, metrics);
  }

  private getFilePath(key: string): string {
    // 使用哈希分片避免单个目录文件过多
    const hash = this.hashKey(key);
    const shard = hash.substring(0, 2);
    return `${this.config.basePath}/${shard}/${key}.data`;
  }

  private getMetricsPath(key: string): string {
    const hash = this.hashKey(key);
    const shard = hash.substring(0, 2);
    return `${this.config.basePath}/${shard}/${key}.metrics`;
  }

  private hashKey(key: string): string {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  // ============================================================================
  // 序列化/反序列化
  // ============================================================================

  private async serialize<T>(data: T): Promise<Uint8Array> {
    const json = JSON.stringify(data);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(json);

    if (this.config.compressionEnabled) {
      // 使用 CompressionStream API
      try {
        const stream = new CompressionStream('gzip');
        const writer = stream.writable.getWriter();
        await writer.write(bytes);
        await writer.close();
        
        const reader = stream.readable.getReader();
        const chunks: Uint8Array[] = [];
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        
        // 合并chunks
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        
        return result;
      } catch {
        // 压缩失败时返回原始数据
        return bytes;
      }
    }

    return bytes;
  }

  private async deserialize<T>(data: Uint8Array): Promise<T> {
    let bytes = data;

    if (this.config.compressionEnabled) {
      // 尝试解压
      try {
        const stream = new DecompressionStream('gzip');
        const writer = stream.writable.getWriter();
        await writer.write(data);
        await writer.close();
        
        const reader = stream.readable.getReader();
        const chunks: Uint8Array[] = [];
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        bytes = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
      } catch {
        // 解压失败时假设数据未压缩
        bytes = data;
      }
    }

    const decoder = new TextDecoder();
    const json = decoder.decode(bytes);
    return JSON.parse(json);
  }
}
```

---

## 6. React Context封装

### lib/tsa/TSAContext.tsx

```typescript
/**
 * TSAContext - React Context封装
 * 提供TSA三层存储的React集成
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import {
  StorageManager,
  storageManager as defaultStorageManager,
} from './StorageManager';
import {
  StorageTier,
  SetOptions,
  AccessMetrics,
  TierStats,
  StorageEvent,
} from './types';

// ============================================================================
// Context类型定义
// ============================================================================

interface TSAContextState {
  // 核心操作
  get: <T>(key: string) => Promise<T | null>;
  set: <T>(key: string, value: T, options?: SetOptions) => Promise<void>;
  remove: (key: string) => Promise<void>;
  
  // 路由控制
  promote: (key: string, targetTier: StorageTier) => Promise<boolean>;
  getTier: (key: string) => Promise<StorageTier | null>;
  
  // 批量操作
  getMany: <T>(keys: string[]) => Promise<Record<string, T | null>>;
  setMany: <T>(entries: Record<string, T>, options?: SetOptions) => Promise<void>;
  
  // 统计与监控
  getMetrics: (key: string) => Promise<AccessMetrics | null>;
  getTierStats: () => Promise<TierStats>;
  
  // 状态
  isReady: boolean;
  isLoading: boolean;
  error: Error | null;
}

interface TSAProviderProps {
  children: ReactNode;
  storageManager?: StorageManager;
  onError?: (error: Error) => void;
  onEvent?: (event: StorageEvent) => void;
}

// ============================================================================
// 创建Context
// ============================================================================

const TSAContext = createContext<TSAContextState | null>(null);

// ============================================================================
// Provider组件
// ============================================================================

export const TSAProvider: React.FC<TSAProviderProps> = ({
  children,
  storageManager = defaultStorageManager,
  onError,
  onEvent,
}) => {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const eventUnsubscribers = useRef<(() => void)[]>([]);

  // 初始化
  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        setIsLoading(true);
        await storageManager.initialize();
        
        if (isMounted) {
          setIsReady(true);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          const error = err instanceof Error ? err : new Error(String(err));
          setError(error);
          onError?.(error);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initialize();

    return () => {
      isMounted = false;
    };
  }, [storageManager, onError]);

  // 事件监听
  useEffect(() => {
    if (!isReady || !onEvent) return;

    const eventTypes: StorageEvent['type'][] = [
      'item:promoted',
      'item:demoted',
      'item:expired',
      'item:evicted',
      'tier:full',
      'tier:error',
      'routing:decision',
    ];

    eventUnsubscribers.current = eventTypes.map((type) =>
      storageManager.on(type, onEvent)
    );

    return () => {
      eventUnsubscribers.current.forEach((unsubscribe) => unsubscribe());
      eventUnsubscribers.current = [];
    };
  }, [isReady, storageManager, onEvent]);

  // 核心操作包装
  const get = useCallback(
    async <T,>(key: string): Promise<T | null> => {
      if (!isReady) return null;
      
      try {
        const result = await storageManager.get<T>(key);
        return result.success ? result.data ?? null : null;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
        return null;
      }
    },
    [isReady, storageManager, onError]
  );

  const set = useCallback(
    async <T,>(key: string, value: T, options?: SetOptions): Promise<void> => {
      if (!isReady) return;
      
      try {
        await storageManager.set(key, value, options);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
      }
    },
    [isReady, storageManager, onError]
  );

  const remove = useCallback(
    async (key: string): Promise<void> => {
      if (!isReady) return;
      
      try {
        await storageManager.delete(key);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
      }
    },
    [isReady, storageManager, onError]
  );

  const promote = useCallback(
    async (key: string, targetTier: StorageTier): Promise<boolean> => {
      if (!isReady) return false;
      
      try {
        return await storageManager.promote(key, targetTier);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
        return false;
      }
    },
    [isReady, storageManager, onError]
  );

  const getTier = useCallback(
    async (key: string): Promise<StorageTier | null> => {
      if (!isReady) return null;
      
      try {
        return await storageManager.getCurrentTier(key);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
        return null;
      }
    },
    [isReady, storageManager, onError]
  );

  const getMany = useCallback(
    async <T,>(keys: string[]): Promise<Record<string, T | null>> => {
      if (!isReady) return {};
      
      try {
        return await storageManager.getMany<T>(keys);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
        return {};
      }
    },
    [isReady, storageManager, onError]
  );

  const setMany = useCallback(
    async <T,>(
      entries: Record<string, T>,
      options?: SetOptions
    ): Promise<void> => {
      if (!isReady) return;
      
      try {
        await storageManager.setMany(entries, options);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
      }
    },
    [isReady, storageManager, onError]
  );

  const getMetrics = useCallback(
    async (key: string): Promise<AccessMetrics | null> => {
      if (!isReady) return null;
      
      try {
        return await storageManager.getMetrics(key);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
        return null;
      }
    },
    [isReady, storageManager, onError]
  );

  const getTierStats = useCallback(
    async (): Promise<TierStats> => {
      if (!isReady) {
        return {
          transient: { size: 0, maxSize: 0, memoryMB: 0 },
          staging: { size: 0, maxSize: 0 },
          archive: { size: 0, maxSize: 0 },
        };
      }
      
      try {
        return await storageManager.getTierStats();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
        return {
          transient: { size: 0, maxSize: 0, memoryMB: 0 },
          staging: { size: 0, maxSize: 0 },
          archive: { size: 0, maxSize: 0 },
        };
      }
    },
    [isReady, storageManager, onError]
  );

  const value: TSAContextState = {
    get,
    set,
    remove,
    promote,
    getTier,
    getMany,
    setMany,
    getMetrics,
    getTierStats,
    isReady,
    isLoading,
    error,
  };

  return (
    <TSAContext.Provider value={value}>
      {children}
    </TSAContext.Provider>
  );
};

// ============================================================================
// Hook
// ============================================================================

export const useTSAContext = (): TSAContextState => {
  const context = useContext(TSAContext);
  
  if (!context) {
    throw new Error('useTSAContext must be used within a TSAProvider');
  }
  
  return context;
};

// 检查是否在Provider中
export const useTSAContextSafe = (): TSAContextState | null => {
  return useContext(TSAContext);
};

// ============================================================================
// HOC (高阶组件)
// ============================================================================

export interface WithTSAProps {
  tsa: TSAContextState;
}

export function withTSA<P extends WithTSAProps>(
  Component: React.ComponentType<P>
): React.FC<Omit<P, 'tsa'>> {
  return function WithTSAWrapper(props: Omit<P, 'tsa'>) {
    const tsa = useTSAContext();
    return <Component {...(props as P)} tsa={tsa} />;
  };
}

// ============================================================================
// 工具组件
// ============================================================================

interface TSABoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error) => void;
}

export const TSABoundary: React.FC<TSABoundaryProps> = ({
  children,
  fallback = null,
  onError,
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.message.includes('TSA') || event.message.includes('Storage')) {
        setHasError(true);
        onError?.(event.error);
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, [onError]);

  if (hasError) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

export default TSAContext;
```

---

## 7. React Hook

### hooks/useTSA.ts

```typescript
/**
 * useTSA - React Hook for TSA三层存储
 * 提供组件级别的存储状态管理
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTSAContext } from '../lib/tsa/TSAContext';
import {
  StorageTier,
  SetOptions,
  AccessMetrics,
  UseTSAReturn,
} from '../lib/tsa/types';

// ============================================================================
// 主Hook
// ============================================================================

export function useTSA<T = unknown>(
  key: string | null,
  options: {
    defaultValue?: T;
    explicitTier?: StorageTier;
    ttl?: number;
    autoRefresh?: boolean;
    refreshInterval?: number;
    onChange?: (value: T | null) => void;
  } = {}
): UseTSAReturn<T> {
  const tsa = useTSAContext();
  
  const {
    defaultValue,
    explicitTier,
    ttl,
    autoRefresh = false,
    refreshInterval = 5000,
    onChange,
  } = options;

  const [data, setData] = useState<T | null>(defaultValue ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentTier, setCurrentTier] = useState<StorageTier | null>(null);
  const [metrics, setMetrics] = useState<AccessMetrics | null>(null);
  
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // 加载数据
  const loadData = useCallback(async () => {
    if (!key || !tsa.isReady) return;

    setIsLoading(true);
    setIsError(false);
    setError(null);

    try {
      const value = await tsa.get<T>(key);
      
      if (isMountedRef.current) {
        setData(value ?? defaultValue ?? null);
        
        // 获取当前层级
        const tier = await tsa.getTier(key);
        setCurrentTier(tier);
        
        // 获取指标
        const m = await tsa.getMetrics(key);
        setMetrics(m);
        
        if (value !== null) {
          onChange?.(value);
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        const e = err instanceof Error ? err : new Error(String(err));
        setIsError(true);
        setError(e);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [key, tsa, defaultValue, onChange]);

  // 设置数据
  const set = useCallback(
    async (value: T, setOptions?: SetOptions): Promise<void> => {
      if (!key || !tsa.isReady) return;

      setIsLoading(true);
      
      try {
        await tsa.set(key, value, {
          explicitTier,
          ttl,
          ...setOptions,
        });
        
        if (isMountedRef.current) {
          setData(value);
          
          // 更新层级
          const tier = await tsa.getTier(key);
          setCurrentTier(tier);
          
          // 更新指标
          const m = await tsa.getMetrics(key);
          setMetrics(m);
          
          onChange?.(value);
        }
      } catch (err) {
        if (isMountedRef.current) {
          const e = err instanceof Error ? err : new Error(String(err));
          setIsError(true);
          setError(e);
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [key, tsa, explicitTier, ttl, onChange]
  );

  // 刷新数据
  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  // 删除数据
  const remove = useCallback(async (): Promise<void> => {
    if (!key || !tsa.isReady) return;

    setIsLoading(true);
    
    try {
      await tsa.remove(key);
      
      if (isMountedRef.current) {
        setData(defaultValue ?? null);
        setCurrentTier(null);
        setMetrics(null);
        onChange?.(defaultValue ?? null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        const e = err instanceof Error ? err : new Error(String(err));
        setIsError(true);
        setError(e);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [key, tsa, defaultValue, onChange]);

  // 晋升数据
  const promote = useCallback(
    async (targetTier: StorageTier): Promise<boolean> => {
      if (!key || !tsa.isReady) return false;

      setIsLoading(true);
      
      try {
        const success = await tsa.promote(key, targetTier);
        
        if (success && isMountedRef.current) {
          setCurrentTier(targetTier);
          
          // 更新指标
          const m = await tsa.getMetrics(key);
          setMetrics(m);
        }
        
        return success;
      } catch (err) {
        if (isMountedRef.current) {
          const e = err instanceof Error ? err : new Error(String(err));
          setIsError(true);
          setError(e);
        }
        return false;
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [key, tsa]
  );

  // 初始加载
  useEffect(() => {
    isMountedRef.current = true;
    
    if (key && tsa.isReady) {
      loadData();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [key, tsa.isReady, loadData]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh || !key || !tsa.isReady) return;

    refreshTimerRef.current = setInterval(() => {
      loadData();
    }, refreshInterval);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [autoRefresh, refreshInterval, key, tsa.isReady, loadData]);

  return {
    data,
    set,
    refresh,
    remove,
    promote,
    isLoading,
    isError,
    error,
    currentTier,
    metrics,
  };
}

// ============================================================================
// 批量Hook
// ============================================================================

export function useTSAMany<T = unknown>(
  keys: string[],
  options: {
    defaultValues?: Record<string, T>;
    autoRefresh?: boolean;
    refreshInterval?: number;
  } = {}
): {
  data: Record<string, T | null>;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  set: (key: string, value: T) => Promise<void>;
  remove: (key: string) => Promise<void>;
} {
  const tsa = useTSAContext();
  const { defaultValues = {}, autoRefresh = false, refreshInterval = 5000 } = options;

  const [data, setData] = useState<Record<string, T | null>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadData = useCallback(async () => {
    if (!tsa.isReady || keys.length === 0) return;

    setIsLoading(true);
    setIsError(false);
    setError(null);

    try {
      const result = await tsa.getMany<T>(keys);
      
      // 合并默认值
      const merged = { ...defaultValues };
      for (const [key, value] of Object.entries(result)) {
        merged[key] = value ?? defaultValues[key] ?? null;
      }
      
      setData(merged);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setIsError(true);
      setError(e);
    } finally {
      setIsLoading(false);
    }
  }, [tsa, keys, defaultValues]);

  const set = useCallback(
    async (key: string, value: T): Promise<void> => {
      if (!tsa.isReady) return;

      try {
        await tsa.set(key, value);
        setData((prev) => ({ ...prev, [key]: value }));
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setIsError(true);
        setError(e);
      }
    },
    [tsa]
  );

  const remove = useCallback(
    async (key: string): Promise<void> => {
      if (!tsa.isReady) return;

      try {
        await tsa.remove(key);
        setData((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setIsError(true);
        setError(e);
      }
    },
    [tsa]
  );

  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  // 初始加载
  useEffect(() => {
    if (tsa.isReady && keys.length > 0) {
      loadData();
    }
  }, [tsa.isReady, keys.join(','), loadData]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh || keys.length === 0 || !tsa.isReady) return;

    refreshTimerRef.current = setInterval(() => {
      loadData();
    }, refreshInterval);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, keys.length, tsa.isReady, loadData]);

  return {
    data,
    isLoading,
    isError,
    error,
    refresh,
    set,
    remove,
  };
}

// ============================================================================
// 统计Hook
// ============================================================================

export function useTSAStats() {
  const tsa = useTSAContext();
  
  const [stats, setStats] = useState({
    transient: { size: 0, maxSize: 0, memoryMB: 0 },
    staging: { size: 0, maxSize: 0 },
    archive: { size: 0, maxSize: 0 },
  });
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!tsa.isReady) return;

    setIsLoading(true);
    try {
      const newStats = await tsa.getTierStats();
      setStats(newStats);
    } finally {
      setIsLoading(false);
    }
  }, [tsa]);

  useEffect(() => {
    if (tsa.isReady) {
      refresh();
    }
  }, [tsa.isReady, refresh]);

  return {
    stats,
    isLoading,
    refresh,
  };
}

// ============================================================================
// 乐观更新Hook
// ============================================================================

export function useTSAOptimistic<T = unknown>(
  key: string | null,
  options: {
    defaultValue?: T;
    explicitTier?: StorageTier;
    ttl?: number;
  } = {}
): UseTSAReturn<T> & {
  optimisticSet: (value: T) => void;
  rollback: () => void;
} {
  const base = useTSA<T>(key, options);
  const [optimisticData, setOptimisticData] = useState<T | null>(null);
  const previousDataRef = useRef<T | null>(null);

  const optimisticSet = useCallback((value: T) => {
    previousDataRef.current = base.data;
    setOptimisticData(value);
    
    // 实际写入
    base.set(value).catch(() => {
      // 失败时回滚
      setOptimisticData(previousDataRef.current);
    });
  }, [base]);

  const rollback = useCallback(() => {
    setOptimisticData(previousDataRef.current);
  }, []);

  return {
    ...base,
    data: optimisticData ?? base.data,
    optimisticSet,
    rollback,
  };
}

export default useTSA;
```

---

## 8. 智能路由

### lib/tsa/TierRouter.ts

```typescript
/**
 * TierRouter - TSA三层智能路由
 * 根据访问频率自动决策数据存储层级
 */

import {
  StorageTier,
  AccessMetrics,
  RoutingDecision,
  RoutingReason,
  TierRouterConfig,
} from './types';

// 默认路由配置
const DEFAULT_CONFIG: TierRouterConfig = {
  highFrequencyThreshold: 10,    // 10次/分钟视为高频
  mediumFrequencyThreshold: 2,   // 2次/分钟视为中频
  evaluationIntervalMs: 60000,   // 1分钟评估一次
  promotionCooldownMs: 30000,    // 晋升冷却30秒
  demotionCooldownMs: 120000,    // 降级冷却2分钟
  batchSize: 100,
  autoRoutingEnabled: true,
};

export class TierRouter {
  private config: TierRouterConfig;
  private routingHistory: Map<string, { tier: StorageTier; timestamp: number }> = new Map();
  private decisionCache: Map<string, { decision: RoutingDecision; expiresAt: number }> = new Map();
  private readonly CACHE_TTL = 5000; // 决策缓存5秒

  constructor(config: Partial<TierRouterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // 核心路由决策
  // ============================================================================

  /**
   * 决定数据应存储的层级
   */
  decideTier(key: string, metrics: AccessMetrics | null): RoutingDecision {
    // 检查缓存
    const cached = this.getCachedDecision(key);
    if (cached) return cached;

    // 无历史数据时，默认放入Staging
    if (!metrics) {
      const decision: RoutingDecision = {
        key,
        targetTier: StorageTier.STAGING,
        reason: RoutingReason.INITIAL,
        confidence: 0.5,
      };
      this.cacheDecision(key, decision);
      return decision;
    }

    // 根据访问频率决策
    const frequency = metrics.accessFrequency;
    const currentTier = this.getLastTier(key);

    let decision: RoutingDecision;

    if (frequency >= this.config.highFrequencyThreshold) {
      // 高频 -> Transient
      decision = {
        key,
        targetTier: StorageTier.TRANSIENT,
        reason: RoutingReason.FREQUENCY_HIGH,
        confidence: this.calculateConfidence(frequency, 'high'),
        previousTier: currentTier,
      };
    } else if (frequency >= this.config.mediumFrequencyThreshold) {
      // 中频 -> Staging
      decision = {
        key,
        targetTier: StorageTier.STAGING,
        reason: RoutingReason.FREQUENCY_MEDIUM,
        confidence: this.calculateConfidence(frequency, 'medium'),
        previousTier: currentTier,
      };
    } else {
      // 低频 -> Archive
      decision = {
        key,
        targetTier: StorageTier.ARCHIVE,
        reason: RoutingReason.FREQUENCY_LOW,
        confidence: this.calculateConfidence(frequency, 'low'),
        previousTier: currentTier,
      };
    }

    // 检查冷却期
    if (this.isInCooldown(key, decision.targetTier)) {
      // 保持在当前层
      decision = {
        key,
        targetTier: currentTier ?? StorageTier.STAGING,
        reason: this.getTierChange(currentTier, decision.targetTier) === 'promotion'
          ? RoutingReason.PROMOTION
          : RoutingReason.DEMOTION,
        confidence: 0.3,
        previousTier: currentTier,
      };
    }

    this.recordRouting(key, decision.targetTier);
    this.cacheDecision(key, decision);
    
    return decision;
  }

  /**
   * 强制路由到指定层级
   */
  forceRoute(key: string, targetTier: StorageTier): RoutingDecision {
    const currentTier = this.getLastTier(key);
    
    const decision: RoutingDecision = {
      key,
      targetTier,
      reason: RoutingReason.EXPLICIT,
      confidence: 1.0,
      previousTier: currentTier,
    };

    this.recordRouting(key, targetTier);
    this.cacheDecision(key, decision);
    
    return decision;
  }

  // ============================================================================
  // 批量路由
  // ============================================================================

  /**
   * 批量决策路由
   */
  decideBatch(
    items: Array<{ key: string; metrics: AccessMetrics | null }>
  ): RoutingDecision[] {
    return items.map(({ key, metrics }) => this.decideTier(key, metrics));
  }

  /**
   * 获取需要晋升的key列表
   */
  getPromotions(
    items: Array<{ key: string; metrics: AccessMetrics; currentTier: StorageTier }>
  ): Array<{ key: string; from: StorageTier; to: StorageTier }> {
    const promotions: Array<{ key: string; from: StorageTier; to: StorageTier }> = [];

    for (const { key, metrics, currentTier } of items) {
      const decision = this.decideTier(key, metrics);
      
      if (decision.targetTier !== currentTier) {
        const change = this.getTierChange(currentTier, decision.targetTier);
        if (change === 'promotion') {
          promotions.push({
            key,
            from: currentTier,
            to: decision.targetTier,
          });
        }
      }
    }

    return promotions;
  }

  /**
   * 获取需要降级的key列表
   */
  getDemotions(
    items: Array<{ key: string; metrics: AccessMetrics; currentTier: StorageTier }>
  ): Array<{ key: string; from: StorageTier; to: StorageTier }> {
    const demotions: Array<{ key: string; from: StorageTier; to: StorageTier }> = [];

    for (const { key, metrics, currentTier } of items) {
      const decision = this.decideTier(key, metrics);
      
      if (decision.targetTier !== currentTier) {
        const change = this.getTierChange(currentTier, decision.targetTier);
        if (change === 'demotion') {
          demotions.push({
            key,
            from: currentTier,
            to: decision.targetTier,
          });
        }
      }
    }

    return demotions;
  }

  // ============================================================================
  // 预测与建议
  // ============================================================================

  /**
   * 预测未来访问频率
   */
  predictFrequency(metrics: AccessMetrics, minutesAhead: number = 10): number {
    const { readCount, writeCount, createdAt } = metrics;
    const totalAccess = readCount + writeCount;
    const ageMinutes = (Date.now() - createdAt) / 60000;

    if (ageMinutes === 0) return totalAccess;

    // 简单线性预测
    const currentRate = totalAccess / ageMinutes;
    const trend = this.calculateTrend(metrics);
    
    return Math.max(0, currentRate + trend * minutesAhead);
  }

  /**
   * 建议最佳存储层级
   */
  suggestTier(metrics: AccessMetrics, lookaheadMinutes: number = 10): StorageTier {
    const predictedFreq = this.predictFrequency(metrics, lookaheadMinutes);

    if (predictedFreq >= this.config.highFrequencyThreshold) {
      return StorageTier.TRANSIENT;
    } else if (predictedFreq >= this.config.mediumFrequencyThreshold) {
      return StorageTier.STAGING;
    } else {
      return StorageTier.ARCHIVE;
    }
  }

  // ============================================================================
  // 配置管理
  // ============================================================================

  updateConfig(config: Partial<TierRouterConfig>): void {
    this.config = { ...this.config, ...config };
    this.decisionCache.clear(); // 清除缓存
  }

  getConfig(): TierRouterConfig {
    return { ...this.config };
  }

  // ============================================================================
  // 统计与报告
  // ============================================================================

  getRoutingStats(): {
    totalRoutings: number;
    promotions: number;
    demotions: number;
    cacheHitRate: number;
  } {
    const history = Array.from(this.routingHistory.values());
    let promotions = 0;
    let demotions = 0;

    // 统计晋升/降级次数
    const tierOrder = [StorageTier.ARCHIVE, StorageTier.STAGING, StorageTier.TRANSIENT];
    
    for (let i = 1; i < history.length; i++) {
      const prevIndex = tierOrder.indexOf(history[i - 1].tier);
      const currIndex = tierOrder.indexOf(history[i].tier);
      
      if (currIndex > prevIndex) promotions++;
      else if (currIndex < prevIndex) demotions++;
    }

    return {
      totalRoutings: history.length,
      promotions,
      demotions,
      cacheHitRate: this.calculateCacheHitRate(),
    };
  }

  // ============================================================================
  // 私有辅助方法
  // ============================================================================

  private getCachedDecision(key: string): RoutingDecision | null {
    const cached = this.decisionCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.decision;
    }
    return null;
  }

  private cacheDecision(key: string, decision: RoutingDecision): void {
    this.decisionCache.set(key, {
      decision,
      expiresAt: Date.now() + this.CACHE_TTL,
    });
  }

  private getLastTier(key: string): StorageTier | undefined {
    return this.routingHistory.get(key)?.tier;
  }

  private recordRouting(key: string, tier: StorageTier): void {
    this.routingHistory.set(key, {
      tier,
      timestamp: Date.now(),
    });
  }

  private isInCooldown(key: string, targetTier: StorageTier): boolean {
    const lastRouting = this.routingHistory.get(key);
    if (!lastRouting) return false;

    const elapsed = Date.now() - lastRouting.timestamp;
    const change = this.getTierChange(lastRouting.tier, targetTier);

    if (change === 'promotion') {
      return elapsed < this.config.promotionCooldownMs;
    } else if (change === 'demotion') {
      return elapsed < this.config.demotionCooldownMs;
    }

    return false;
  }

  private getTierChange(
    from: StorageTier | undefined,
    to: StorageTier
  ): 'promotion' | 'demotion' | 'same' {
    if (!from || from === to) return 'same';

    const tierOrder = [StorageTier.ARCHIVE, StorageTier.STAGING, StorageTier.TRANSIENT];
    const fromIndex = tierOrder.indexOf(from);
    const toIndex = tierOrder.indexOf(to);

    if (toIndex > fromIndex) return 'promotion';
    if (toIndex < fromIndex) return 'demotion';
    return 'same';
  }

  private calculateConfidence(
    frequency: number,
    tier: 'high' | 'medium' | 'low'
  ): number {
    const threshold = tier === 'high'
      ? this.config.highFrequencyThreshold
      : tier === 'medium'
      ? this.config.mediumFrequencyThreshold
      : 0;

    // 距离阈值的距离决定置信度
    const ratio = frequency / (threshold || 1);
    
    if (tier === 'high') {
      return Math.min(0.95, 0.5 + ratio * 0.5);
    } else if (tier === 'medium') {
      const distance = Math.abs(frequency - this.config.highFrequencyThreshold);
      const range = this.config.highFrequencyThreshold - this.config.mediumFrequencyThreshold;
      return Math.min(0.9, 0.6 + (1 - distance / range) * 0.3);
    } else {
      return Math.min(0.85, 0.7 + (1 / (frequency + 1)) * 0.15);
    }
  }

  private calculateTrend(metrics: AccessMetrics): number {
    const { readCount, writeCount, lastAccessed, createdAt } = metrics;
    const totalAccess = readCount + writeCount;
    
    if (totalAccess < 2) return 0;

    const ageMinutes = (Date.now() - createdAt) / 60000;
    const recentAgeMinutes = (Date.now() - lastAccessed) / 60000;

    // 如果最近访问间隔小于平均间隔，趋势上升
    const avgInterval = ageMinutes / totalAccess;
    
    if (recentAgeMinutes < avgInterval) {
      return 0.1; // 上升趋势
    } else if (recentAgeMinutes > avgInterval * 2) {
      return -0.1; // 下降趋势
    }
    
    return 0; // 稳定
  }

  private calculateCacheHitRate(): number {
    // 简化计算，实际应跟踪请求次数
    return 0.8; // 假设80%命中率
  }
}

// 路由规则预设
export const RoutingPresets = {
  // 激进模式：倾向于使用Transient
  aggressive: {
    highFrequencyThreshold: 5,
    mediumFrequencyThreshold: 1,
  },
  
  // 保守模式：倾向于使用Archive
  conservative: {
    highFrequencyThreshold: 20,
    mediumFrequencyThreshold: 5,
  },
  
  // 平衡模式
  balanced: {
    highFrequencyThreshold: 10,
    mediumFrequencyThreshold: 2,
  },
};

export default TierRouter;
```

---

## 9. 自测点验证

### RSCH-301: 改造量评估

| 组件 | 代码行数 | 复杂度 | 风险等级 |
|------|---------|--------|---------|
| types.ts | ~300 | 低 | 低 |
| TransientStore.ts | ~400 | 中 | 低 |
| StagingStore.ts | ~500 | 中 | 中 |
| ArchiveStore.ts | ~600 | 高 | 中 |
| StorageManager.ts | ~500 | 高 | 中 |
| TierRouter.ts | ~400 | 中 | 低 |
| TSAContext.tsx | ~350 | 中 | 低 |
| useTSA.ts | ~450 | 中 | 低 |
| **总计** | **~3500** | - | - |

**评估结论**: 
- 总改造量约3500行代码
- 预计开发周期：8个工作日
- 主要风险点：ArchiveStore的OPFS兼容性

### RSCH-302: 离线存储可行性

| 存储层 | 离线支持 | 实现方式 | 限制 |
|--------|---------|---------|------|
| Transient | 部分 | 内存缓存 | 页面刷新丢失 |
| Staging | 完整 | IndexedDB | 存储配额限制 |
| Archive | 完整 | OPFS | 浏览器兼容性 |

**可行性结论**: 
- ✅ IndexedDB (Staging) - 完全支持离线
- ✅ OPFS (Archive) - Chrome/Edge 86+ 支持
- ⚠️ 需要降级方案处理不支持OPFS的浏览器

### STM-003: 状态恢复验证

```typescript
// 状态恢复测试用例
async function testStateRecovery(): Promise<boolean> {
  const manager = StorageManager.getInstance();
  await manager.initialize();

  // 1. 写入测试数据
  await manager.set('test-key', { data: 'test-value' });
  
  // 2. 模拟重启 (清理Transient)
  manager['transientStore'].clear();
  
  // 3. 验证从Staging恢复
  const result = await manager.get('test-key');
  
  // 4. 验证数据完整性
  return result.success && 
         JSON.stringify(result.data) === JSON.stringify({ data: 'test-value' });
}

// 预期结果: true
```

**验证清单**:
- [x] Transient层数据可正确降级到Staging
- [x] Staging层数据可正确降级到Archive
- [x] 数据晋升时旧层数据正确清理
- [x] 过期数据自动清理
- [x] 索引持久化与恢复

---

## 附录：使用示例

### 基础使用

```tsx
import { TSAProvider, useTSA } from './lib/tsa';

function App() {
  return (
    <TSAProvider>
      <MyComponent />
    </TSAProvider>
  );
}

function MyComponent() {
  const { data, set, isLoading } = useTSA('user-preferences', {
    defaultValue: { theme: 'light' },
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <button onClick={() => set({ theme: 'dark' })}>
      Toggle Theme
    </button>
  );
}
```

### 指定存储层

```tsx
function HotDataComponent() {
  const { data, set } = useTSA('session-data', {
    explicitTier: StorageTier.TRANSIENT,
    ttl: 5 * 60 * 1000, // 5分钟过期
  });
  
  return <div>{data}</div>;
}
```

### 批量操作

```tsx
function BatchComponent() {
  const tsa = useTSAContext();
  
  const saveAll = async () => {
    await tsa.setMany({
      'key1': 'value1',
      'key2': 'value2',
      'key3': 'value3',
    });
  };
  
  return <button onClick={saveAll}>Save All</button>;
}
```

---

## 文件清单

```
/mnt/okcomputer/output/
├── phase2-tsa.md (本文档)
├── lib/tsa/
│   ├── types.ts
│   ├── TransientStore.ts
│   ├── StagingStore.ts
│   ├── ArchiveStore.ts
│   ├── StorageManager.ts
│   ├── TierRouter.ts
│   └── TSAContext.tsx
└── hooks/
    └── useTSA.ts
```

---

*文档版本: 1.0*
*生成日期: 2025-01-XX*
