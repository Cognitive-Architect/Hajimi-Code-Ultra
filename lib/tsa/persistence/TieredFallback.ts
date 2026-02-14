/**
 * B-05/09: TSA 三层降级韧性 - 分层故障转移管理器
 * 
 * 三层架构：
 * Tier 1: RedisStore（高性能远程存储）
 *    ↓ 失败时降级
 * Tier 2: IndexedDBStore（本地持久化）
 *    ↓ 失败时降级
 * Tier 3: MemoryStore（内存兜底）
 * 
 * 功能特性：
 * - 自动故障检测（捕获Redis/IndexedDB错误）
 * - 自动降级到下一层
 * - 定期尝试恢复（每分钟检测上层服务）
 * - 降级时记录警告日志
 * - 服务恢复时自动升级
 * 
 * 技术债务清偿：DEBT-004 TSA虚假持久化
 */

import { StorageAdapter, SetOptions, DataPriority } from './IndexedDBStore';

// ==================== 类型定义 ====================

export interface FallbackConfig {
  enableAutoFallback: boolean;     // 启用自动降级
  enableAutoRecover: boolean;      // 启用自动恢复
  recoverIntervalMs: number;       // 恢复检测间隔（默认60000ms）
  maxRetries: number;              // 最大重试次数（默认3）
  retryDelayMs: number;            // 重试延迟（默认1000ms）
}

export const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  enableAutoFallback: true,
  enableAutoRecover: true,
  recoverIntervalMs: 60000,  // 1分钟
  maxRetries: 3,
  retryDelayMs: 1000,
};

export enum TierLevel {
  REDIS = 1,       // 第一层：Redis
  INDEXEDDB = 2,   // 第二层：IndexedDB
  MEMORY = 3,      // 第三层：内存
}

export interface TierStatus {
  level: TierLevel;
  name: string;
  isAvailable: boolean;
  isConnected: boolean;
  lastError?: Error;
  lastErrorTime?: number;
  failoverCount: number;
  recoverCount: number;
}

export interface FallbackEvent {
  type: 'failover' | 'recover' | 'degrade' | 'error';
  timestamp: number;
  fromTier: TierLevel;
  toTier: TierLevel;
  reason?: string;
  error?: Error;
}

export type FallbackEventHandler = (event: FallbackEvent) => void;

// ==================== 日志记录器 ====================

interface ILogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

class ConsoleLogger implements ILogger {
  constructor(private prefix: string = '[TieredFallback]') {}

  debug(message: string, ...args: unknown[]): void {
    console.debug(`${this.prefix} ${message}`, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    console.info(`${this.prefix} ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`${this.prefix} ${message}`, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`${this.prefix} ${message}`, ...args);
  }
}

class NoOpLogger implements ILogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

// ==================== 内存存储实现 ====================

interface MemoryStoredItem {
  value: unknown;
  createdAt: number;
  expiresAt?: number;
  priority: DataPriority;
}

class MemoryStore implements StorageAdapter {
  readonly name = 'MemoryStore';
  readonly isAvailable = true;
  
  private store = new Map<string, MemoryStoredItem>();
  private _isConnected = false;
  private logger: ILogger;

  constructor(logger?: ILogger) {
    this.logger = logger ?? new ConsoleLogger('[MemoryStore]');
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  async initialize(): Promise<boolean> {
    this._isConnected = true;
    this.logger.info('Memory store initialized (always available)');
    return true;
  }

  async close(): Promise<void> {
    this.store.clear();
    this._isConnected = false;
    this.logger.info('Memory store closed');
  }

  async healthCheck(): Promise<boolean> {
    return this._isConnected;
  }

  async get<T>(key: string): Promise<T | null> {
    this.checkConnected();

    const item = this.store.get(key);

    if (!item) {
      return null;
    }

    // 检查是否过期
    if (item.expiresAt && item.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }

    return item.value as T;
  }

  async set<T>(key: string, value: T, options?: SetOptions): Promise<void> {
    this.checkConnected();

    const now = Date.now();
    const item: MemoryStoredItem = {
      value,
      createdAt: now,
      expiresAt: options?.ttl ? now + options.ttl : undefined,
      priority: options?.priority ?? DataPriority.MEDIUM,
    };

    this.store.set(key, item);
  }

  async delete(key: string): Promise<void> {
    this.checkConnected();
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    this.checkConnected();

    const item = this.store.get(key);

    if (!item) {
      return false;
    }

    if (item.expiresAt && item.expiresAt < Date.now()) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  async mget<T>(keys: string[]): Promise<Map<string, T>> {
    this.checkConnected();

    const result = new Map<string, T>();
    const now = Date.now();

    for (const key of keys) {
      const item = this.store.get(key);

      if (item && (!item.expiresAt || item.expiresAt >= now)) {
        result.set(key, item.value as T);
      }
    }

    return result;
  }

  async mset<T>(entries: Array<{ key: string; value: T }>, options?: SetOptions): Promise<void> {
    this.checkConnected();

    const now = Date.now();

    for (const { key, value } of entries) {
      const item: MemoryStoredItem = {
        value,
        createdAt: now,
        expiresAt: options?.ttl ? now + options.ttl : undefined,
        priority: options?.priority ?? DataPriority.MEDIUM,
      };

      this.store.set(key, item);
    }
  }

  async mdelete(keys: string[]): Promise<void> {
    this.checkConnected();

    for (const key of keys) {
      this.store.delete(key);
    }
  }

  async keys(pattern?: string): Promise<string[]> {
    this.checkConnected();

    const allKeys = Array.from(this.store.keys());

    if (!pattern || pattern === '*') {
      return allKeys;
    }

    const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
    return allKeys.filter(key => regex.test(key));
  }

  async clear(): Promise<void> {
    this.checkConnected();
    this.store.clear();
  }

  async cleanup(): Promise<number> {
    this.checkConnected();

    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, item] of this.store.entries()) {
      if (item.expiresAt && item.expiresAt < now) {
        this.store.delete(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  private checkConnected(): void {
    if (!this._isConnected) {
      throw new Error('Memory store is not connected');
    }
  }
}

// ==================== 三层韧性管理器 ====================

export class TieredFallback implements StorageAdapter {
  readonly name = 'TieredFallback';

  private tiers: Map<TierLevel, StorageAdapter> = new Map();
  private tierStatus: Map<TierLevel, TierStatus> = new Map();
  private currentTier: TierLevel = TierLevel.REDIS;
  private config: FallbackConfig;
  private logger: ILogger;
  private recoverTimer: number | null = null;
  private eventHandlers: FallbackEventHandler[] = [];
  private _isConnected = false;

  // 重试计数器
  private retryCounts: Map<TierLevel, number> = new Map();

  constructor(
    redisStore?: StorageAdapter,
    indexedDBStore?: StorageAdapter,
    config?: Partial<FallbackConfig>,
    logger?: ILogger
  ) {
    this.config = { ...DEFAULT_FALLBACK_CONFIG, ...config };
    this.logger = logger ?? (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'
      ? new NoOpLogger()
      : new ConsoleLogger());

    // 初始化存储层
    this.tiers.set(TierLevel.REDIS, redisStore ?? new MemoryStore(this.logger));
    this.tiers.set(TierLevel.INDEXEDDB, indexedDBStore ?? new MemoryStore(this.logger));
    this.tiers.set(TierLevel.MEMORY, new MemoryStore(this.logger));

    // 初始化状态
    for (const level of [TierLevel.REDIS, TierLevel.INDEXEDDB, TierLevel.MEMORY]) {
      this.tierStatus.set(level, {
        level,
        name: this.getTierName(level),
        isAvailable: false,
        isConnected: false,
        failoverCount: 0,
        recoverCount: 0,
      });
      this.retryCounts.set(level, 0);
    }
  }

  // ==================== 属性访问器 ====================

  get isAvailable(): boolean {
    // 至少内存层总是可用
    return true;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  get currentTierLevel(): TierLevel {
    return this.currentTier;
  }

  get currentTierName(): string {
    return this.getTierName(this.currentTier);
  }

  // ==================== 生命周期方法 ====================

  async initialize(): Promise<boolean> {
    this.logger.info('Initializing TieredFallback manager...');

    // 初始化所有层（从最高层开始）
    for (const level of [TierLevel.REDIS, TierLevel.INDEXEDDB, TierLevel.MEMORY]) {
      const store = this.tiers.get(level)!;
      const status = this.tierStatus.get(level)!;

      try {
        const initialized = await store.initialize();
        status.isAvailable = store.isAvailable;
        status.isConnected = initialized;

        if (initialized) {
          this.logger.info(`${status.name} initialized successfully`);
        } else {
          this.logger.warn(`${status.name} initialization failed`);
        }
      } catch (error) {
        status.isAvailable = false;
        status.isConnected = false;
        status.lastError = error as Error;
        status.lastErrorTime = Date.now();
        this.logger.error(`${status.name} initialization error:`, error);
      }
    }

    // 确定当前使用哪一层
    await this.determineCurrentTier();

    // 启动自动恢复任务
    if (this.config.enableAutoRecover) {
      this.startRecoverTask();
    }

    this._isConnected = true;
    this.logger.info(`TieredFallback initialized, current tier: ${this.currentTierName}`);
    return true;
  }

  async close(): Promise<void> {
    this.logger.info('Closing TieredFallback manager...');

    // 停止恢复任务
    this.stopRecoverTask();

    // 关闭所有存储层
    for (const level of [TierLevel.REDIS, TierLevel.INDEXEDDB, TierLevel.MEMORY]) {
      const store = this.tiers.get(level)!;
      try {
        await store.close();
        const status = this.tierStatus.get(level)!;
        status.isConnected = false;
      } catch (error) {
        this.logger.warn(`Error closing ${this.getTierName(level)}:`, error);
      }
    }

    this._isConnected = false;
    this.logger.info('TieredFallback closed');
  }

  async healthCheck(): Promise<boolean> {
    // 检查当前层的健康状态
    const currentStore = this.tiers.get(this.currentTier)!;
    return await currentStore.healthCheck();
  }

  // ==================== CRUD 操作（带故障转移） ====================

  async get<T>(key: string): Promise<T | null> {
    return this.executeWithFallback<T | null>(
      async (store) => await store.get<T>(key),
      null,
      `get("${key}")`
    );
  }

  async set<T>(key: string, value: T, options?: SetOptions): Promise<void> {
    return this.executeWithFallback<void>(
      async (store) => await store.set(key, value, options),
      undefined,
      `set("${key}")`
    );
  }

  async delete(key: string): Promise<void> {
    return this.executeWithFallback<void>(
      async (store) => await store.delete(key),
      undefined,
      `delete("${key}")`
    );
  }

  async exists(key: string): Promise<boolean> {
    return this.executeWithFallback<boolean>(
      async (store) => await store.exists(key),
      false,
      `exists("${key}")`
    );
  }

  // ==================== 批量操作（带故障转移） ====================

  async mget<T>(keys: string[]): Promise<Map<string, T>> {
    return this.executeWithFallback<Map<string, T>>(
      async (store) => await store.mget<T>(keys),
      new Map(),
      `mget([${keys.length} keys])`
    );
  }

  async mset<T>(entries: Array<{ key: string; value: T }>, options?: SetOptions): Promise<void> {
    return this.executeWithFallback<void>(
      async (store) => await store.mset(entries, options),
      undefined,
      `mset([${entries.length} entries])`
    );
  }

  async mdelete(keys: string[]): Promise<void> {
    return this.executeWithFallback<void>(
      async (store) => await store.mdelete(keys),
      undefined,
      `mdelete([${keys.length} keys])`
    );
  }

  // ==================== 查询和清理 ====================

  async keys(pattern?: string): Promise<string[]> {
    return this.executeWithFallback<string[]>(
      async (store) => await store.keys(pattern),
      [],
      `keys(${pattern ?? '*'})`
    );
  }

  async clear(): Promise<void> {
    return this.executeWithFallback<void>(
      async (store) => await store.clear(),
      undefined,
      'clear()'
    );
  }

  async cleanup(): Promise<number> {
    return this.executeWithFallback<number>(
      async (store) => await store.cleanup(),
      0,
      'cleanup()'
    );
  }

  // ==================== 事件处理 ====================

  on(event: 'failover' | 'recover' | 'degrade' | 'error', handler: FallbackEventHandler): void {
    this.eventHandlers.push(handler);
  }

  off(event: 'failover' | 'recover' | 'degrade' | 'error', handler: FallbackEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index > -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  // ==================== 状态查询 ====================

  getTierStatuses(): TierStatus[] {
    return Array.from(this.tierStatus.values());
  }

  getTierStatus(level: TierLevel): TierStatus | undefined {
    return this.tierStatus.get(level);
  }

  // ==================== 内部方法 ====================

  private async executeWithFallback<T>(
    operation: (store: StorageAdapter) => Promise<T>,
    defaultValue: T,
    operationName: string
  ): Promise<T> {
    let currentLevel = this.currentTier;
    let lastError: Error | undefined;

    // 尝试从当前层开始，逐层降级
    while (currentLevel <= TierLevel.MEMORY) {
      const store = this.tiers.get(currentLevel)!;
      const status = this.tierStatus.get(currentLevel)!;

      try {
        // 检查存储是否可用
        if (!status.isConnected) {
          throw new Error(`${status.name} is not connected`);
        }

        const result = await operation(store);

        // 操作成功，重置重试计数
        this.retryCounts.set(currentLevel, 0);

        // 如果是降级操作后的恢复，尝试升级
        if (currentLevel < this.currentTier && this.config.enableAutoFallback) {
          this.logger.info(`Upper tier ${this.getTierName(this.currentTier)} seems recovered, but staying at ${status.name} for now`);
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        status.lastError = lastError;
        status.lastErrorTime = Date.now();

        // 增加重试计数
        const retryCount = (this.retryCounts.get(currentLevel) ?? 0) + 1;
        this.retryCounts.set(currentLevel, retryCount);

        this.logger.warn(
          `${operationName} failed on ${status.name} (attempt ${retryCount}/${this.config.maxRetries}):`,
          error
        );

        // 如果超过最大重试次数，执行降级
        if (retryCount >= this.config.maxRetries) {
          if (this.config.enableAutoFallback && currentLevel < TierLevel.MEMORY) {
            const nextLevel = currentLevel + 1 as TierLevel;
            await this.failover(currentLevel, nextLevel, lastError);
            currentLevel = nextLevel;
            continue;
          }
        }

        // 如果已经是最底层（内存），或者禁用了自动降级，抛出错误
        if (currentLevel === TierLevel.MEMORY || !this.config.enableAutoFallback) {
          this.emitEvent({
            type: 'error',
            timestamp: Date.now(),
            fromTier: currentLevel,
            toTier: currentLevel,
            reason: `Operation failed after ${retryCount} attempts`,
            error: lastError,
          });
          break;
        }

        // 等待后重试
        await this.delay(this.config.retryDelayMs);
      }
    }

    // 所有层都失败，返回默认值
    this.logger.error(`${operationName} failed on all tiers, returning default value`);
    return defaultValue;
  }

  private async failover(fromTier: TierLevel, toTier: TierLevel, error: Error): Promise<void> {
    const fromStatus = this.tierStatus.get(fromTier)!;
    const toStatus = this.tierStatus.get(toTier)!;

    fromStatus.failoverCount++;
    fromStatus.isConnected = false;

    this.currentTier = toTier;
    this.retryCounts.set(fromTier, 0);

    this.logger.warn(
      `FAILOVER: ${fromStatus.name} → ${toStatus.name} due to error: ${error.message}`
    );

    this.emitEvent({
      type: 'failover',
      timestamp: Date.now(),
      fromTier,
      toTier,
      reason: error.message,
      error,
    });
  }

  private async attemptRecover(): Promise<void> {
    if (this.currentTier === TierLevel.REDIS) {
      return; // 已经在最高层
    }

    // 尝试恢复上一层
    const upperLevel = this.currentTier - 1 as TierLevel;
    const upperStore = this.tiers.get(upperLevel)!;
    const upperStatus = this.tierStatus.get(upperLevel)!;

    try {
      this.logger.debug(`Attempting to recover ${upperStatus.name}...`);

      const healthy = await upperStore.healthCheck();

      if (healthy) {
        upperStatus.isConnected = true;
        upperStatus.recoverCount++;
        upperStatus.lastError = undefined;
        upperStatus.lastErrorTime = undefined;

        const previousTier = this.currentTier;
        this.currentTier = upperLevel;

        this.logger.info(`RECOVER: ${upperStatus.name} is back online, tier upgraded from ${this.getTierName(previousTier)}`);

        this.emitEvent({
          type: 'recover',
          timestamp: Date.now(),
          fromTier: previousTier,
          toTier: upperLevel,
          reason: 'Health check passed',
        });

        // 递归尝试更高层
        await this.attemptRecover();
      }
    } catch (error) {
      this.logger.debug(`${upperStatus.name} is still unavailable:`, error);
    }
  }

  private async determineCurrentTier(): Promise<void> {
    // 从最高层开始，找到第一个可用的层
    for (const level of [TierLevel.REDIS, TierLevel.INDEXEDDB, TierLevel.MEMORY]) {
      const status = this.tierStatus.get(level)!;
      if (status.isConnected) {
        this.currentTier = level;
        return;
      }
    }

    // 如果都没有连接，至少使用内存层
    this.currentTier = TierLevel.MEMORY;
    const memoryStatus = this.tierStatus.get(TierLevel.MEMORY)!;
    memoryStatus.isConnected = true;
  }

  private startRecoverTask(): void {
    if (this.recoverTimer) {
      return;
    }

    this.recoverTimer = window.setInterval(() => {
      this.attemptRecover().catch(error => {
        this.logger.warn('Recover task error:', error);
      });
    }, this.config.recoverIntervalMs);

    this.logger.debug(`Recover task started (interval: ${this.config.recoverIntervalMs}ms)`);
  }

  private stopRecoverTask(): void {
    if (this.recoverTimer) {
      clearInterval(this.recoverTimer);
      this.recoverTimer = null;
      this.logger.debug('Recover task stopped');
    }
  }

  private emitEvent(event: FallbackEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        this.logger.warn('Event handler error:', error);
      }
    }
  }

  private getTierName(level: TierLevel): string {
    switch (level) {
      case TierLevel.REDIS:
        return 'RedisStore';
      case TierLevel.INDEXEDDB:
        return 'IndexedDBStore';
      case TierLevel.MEMORY:
        return 'MemoryStore';
      default:
        return 'Unknown';
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ==================== 导出 ====================

export { MemoryStore };
export type { ILogger };
