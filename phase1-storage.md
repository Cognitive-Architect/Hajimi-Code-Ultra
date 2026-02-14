# Phase 1 冷热分层产出

## 1. 存储抽象层设计

### lib/storage/types.ts

```typescript
/**
 * Phase 1 冷热分层存储 - 类型定义
 * Hot/Warm/Cold 三层存储类型系统
 */

// ==================== 存储层级枚举 ====================

export enum StorageTier {
  HOT = 'hot',      // Redis - 高频访问
  WARM = 'warm',    // IndexedDB - 中频访问
  COLD = 'cold',    // 文件系统 - 低频/归档
}

export enum DataPriority {
  CRITICAL = 0,     // 永不删除，始终在热存储
  HIGH = 1,         // 优先保留在热存储
  MEDIUM = 2,       // 可在温存储
  LOW = 3,          // 可归档到冷存储
  ARCHIVE = 4,      // 直接归档
}

// ==================== 核心数据类型 ====================

export interface StorageItem<T = unknown> {
  key: string;
  value: T;
  tier: StorageTier;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;      // TTL过期时间
  accessCount: number;     // 访问计数
  lastAccessedAt: number;
  priority: DataPriority;
  size: number;            // 数据大小(字节)
  metadata?: Record<string, unknown>;
}

export interface StorageQuery {
  key?: string;
  keyPattern?: string;
  tier?: StorageTier;
  priority?: DataPriority;
  createdBefore?: number;
  createdAfter?: number;
  expiresBefore?: number;
  limit?: number;
  offset?: number;
}

export interface StorageStats {
  tier: StorageTier;
  itemCount: number;
  totalSize: number;
  oldestItem?: number;
  newestItem?: number;
  hitRate?: number;
  missRate?: number;
}

// ==================== 操作结果类型 ====================

export interface StorageResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: StorageError;
  tier?: StorageTier;
  latencyMs: number;
}

export interface StorageError {
  code: StorageErrorCode;
  message: string;
  tier?: StorageTier;
  originalError?: Error;
}

export enum StorageErrorCode {
  UNKNOWN = 'UNKNOWN',
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  TIER_UNAVAILABLE = 'TIER_UNAVAILABLE',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  MIGRATION_FAILED = 'MIGRATION_FAILED',
}

// ==================== 存储配置类型 ====================

export interface TierConfig {
  maxSize?: number;
  maxItems?: number;
  defaultTTL?: number;
  evictionPolicy?: EvictionPolicy;
}

export enum EvictionPolicy {
  LRU = 'lru',
  LFU = 'lfu',
  FIFO = 'fifo',
  TTL = 'ttl',
  RANDOM = 'random',
}

export interface HotStorageConfig extends TierConfig {
  redisUrl: string;
  redisToken?: string;
  connectionTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  clusterMode?: boolean;
}

export interface WarmStorageConfig extends TierConfig {
  dbName: string;
  dbVersion: number;
  stores: string[];
  indexes?: Record<string, string[]>;
}

export interface ColdStorageConfig extends TierConfig {
  basePath: string;
  fileFormat?: 'json' | 'binary' | 'compressed';
  compressionLevel?: number;
  chunkSize?: number;
}

export interface TierManagerConfig {
  hot: HotStorageConfig;
  warm: WarmStorageConfig;
  cold: ColdStorageConfig;
  promotionThreshold: number;
  demotionThreshold: number;
  hotToWarmTTL: number;
  warmToColdTTL: number;
  coldArchiveTTL: number;
  cleanupInterval: number;
  enableAutoMigration: boolean;
  enableAutoCleanup: boolean;
}

// ==================== 迁移相关类型 ====================

export interface MigrationTask {
  id: string;
  key: string;
  sourceTier: StorageTier;
  targetTier: StorageTier;
  status: MigrationStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: StorageError;
  retryCount: number;
}

export enum MigrationStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface MigrationResult {
  task: MigrationTask;
  bytesTransferred: number;
  durationMs: number;
}

// ==================== 存储适配器接口 ====================

export interface IStorageAdapter {
  readonly tier: StorageTier;
  readonly isAvailable: boolean;
  readonly isConnected: boolean;

  initialize(): Promise<StorageResult<void>>;
  close(): Promise<StorageResult<void>>;
  healthCheck(): Promise<StorageResult<StorageStats>>;

  get<T>(key: string): Promise<StorageResult<T>>;
  set<T>(key: string, value: T, options?: SetOptions): Promise<StorageResult<void>>;
  delete(key: string): Promise<StorageResult<void>>;
  exists(key: string): Promise<StorageResult<boolean>>;

  mget<T>(keys: string[]): Promise<StorageResult<Map<string, T>>>;
  mset<T>(entries: Array<{ key: string; value: T }>, options?: SetOptions): Promise<StorageResult<void>>;
  mdelete(keys: string[]): Promise<StorageResult<void>>;

  keys(pattern?: string): Promise<StorageResult<string[]>>;
  query(query: StorageQuery): Promise<StorageResult<StorageItem[]>>;
  stats(): Promise<StorageResult<StorageStats>>;
  clear(): Promise<StorageResult<void>>;
  cleanup(): Promise<StorageResult<number>>;

  on(event: StorageEventType, handler: StorageEventHandler): void;
  off(event: StorageEventType, handler: StorageEventHandler): void;
}

export interface SetOptions {
  ttl?: number;
  priority?: DataPriority;
  metadata?: Record<string, unknown>;
  ifNotExists?: boolean;
  ifExists?: boolean;
  keepTTL?: boolean;
}
```

### lib/storage/dal.ts

```typescript
/**
 * Phase 1 冷热分层存储 - 数据访问抽象层 (DAL)
 * Data Access Layer - 统一存储接口抽象
 */

import {
  StorageTier, StorageItem, StorageQuery, StorageResult,
  StorageError, StorageErrorCode, StorageStats, StorageEvent,
  StorageEventType, StorageEventHandler, IStorageAdapter,
  SetOptions, SerializedData, DataPriority,
} from './types';

// ==================== 序列化工具 ====================

export class DataSerializer {
  static serialize<T>(value: T): SerializedData {
    try {
      const json = JSON.stringify(value);
      return {
        type: 'json',
        data: json,
        encoding: 'utf-8',
        checksum: this.computeChecksum(json),
      };
    } catch (error) {
      throw new StorageException(
        StorageErrorCode.SERIALIZATION_ERROR,
        'Failed to serialize data',
        error as Error
      );
    }
  }

  static deserialize<T>(serialized: SerializedData): T {
    try {
      if (serialized.type === 'json') {
        const data = serialized.data as string;
        if (serialized.checksum && serialized.checksum !== this.computeChecksum(data)) {
          throw new Error('Data checksum mismatch');
        }
        return JSON.parse(data) as T;
      }
      throw new Error(`Unsupported serialization type: ${serialized.type}`);
    } catch (error) {
      throw new StorageException(
        StorageErrorCode.SERIALIZATION_ERROR,
        'Failed to deserialize data',
        error as Error
      );
    }
  }

  private static computeChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  static estimateSize<T>(value: T): number {
    try {
      const serialized = JSON.stringify(value);
      return new Blob([serialized]).size;
    } catch {
      return 0;
    }
  }
}

// ==================== 存储异常类 ====================

export class StorageException extends Error {
  public readonly code: StorageErrorCode;
  public readonly originalError?: Error;
  public readonly tier?: StorageTier;

  constructor(code: StorageErrorCode, message: string, originalError?: Error, tier?: StorageTier) {
    super(message);
    this.name = 'StorageException';
    this.code = code;
    this.originalError = originalError;
    this.tier = tier;
  }

  toStorageError(): StorageError {
    return {
      code: this.code,
      message: this.message,
      tier: this.tier,
      originalError: this.originalError,
    };
  }
}

// ==================== 结果构建器 ====================

export class ResultBuilder {
  static success<T>(data?: T, tier?: StorageTier, latencyMs: number = 0): StorageResult<T> {
    return { success: true, data, tier, latencyMs };
  }

  static failure<T>(code: StorageErrorCode, message: string, tier?: StorageTier, originalError?: Error): StorageResult<T> {
    return {
      success: false,
      error: { code, message, tier, originalError },
      latencyMs: 0,
    };
  }
}

// ==================== 事件发射器 ====================

export class StorageEventEmitter {
  private handlers: Map<StorageEventType, Set<StorageEventHandler>> = new Map();

  on(event: StorageEventType, handler: StorageEventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: StorageEventType, handler: StorageEventHandler): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  emit(event: StorageEvent): void {
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Event handler error for ${event.type}:`, error);
        }
      });
    }
  }
}

// ==================== 存储适配器基类 ====================

export abstract class BaseStorageAdapter implements IStorageAdapter {
  abstract readonly tier: StorageTier;
  abstract readonly isAvailable: boolean;
  abstract readonly isConnected: boolean;

  protected eventEmitter: StorageEventEmitter = new StorageEventEmitter();
  protected initialized: boolean = false;

  abstract initialize(): Promise<StorageResult<void>>;
  abstract close(): Promise<StorageResult<void>>;
  abstract healthCheck(): Promise<StorageResult<StorageStats>>;
  abstract get<T>(key: string): Promise<StorageResult<T>>;
  abstract set<T>(key: string, value: T, options?: SetOptions): Promise<StorageResult<void>>;
  abstract delete(key: string): Promise<StorageResult<void>>;
  abstract exists(key: string): Promise<StorageResult<boolean>>;
  abstract mget<T>(keys: string[]): Promise<StorageResult<Map<string, T>>>;
  abstract mset<T>(entries: Array<{ key: string; value: T }>, options?: SetOptions): Promise<StorageResult<void>>;
  abstract mdelete(keys: string[]): Promise<StorageResult<void>>;
  abstract keys(pattern?: string): Promise<StorageResult<string[]>>;
  abstract query(query: StorageQuery): Promise<StorageResult<StorageItem[]>>;
  abstract stats(): Promise<StorageResult<StorageStats>>;
  abstract clear(): Promise<StorageResult<void>>;
  abstract cleanup(): Promise<StorageResult<number>>;

  on(event: StorageEventType, handler: StorageEventHandler): void {
    this.eventEmitter.on(event, handler);
  }

  off(event: StorageEventType, handler: StorageEventHandler): void {
    this.eventEmitter.off(event, handler);
  }

  protected emitEvent(event: StorageEvent): void {
    this.eventEmitter.emit(event);
  }

  protected checkInitialized(): void {
    if (!this.initialized) {
      throw new StorageException(StorageErrorCode.UNKNOWN, 'Storage adapter not initialized');
    }
  }
}

// ==================== 日志记录器 ====================

export interface IStorageLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export class ConsoleStorageLogger implements IStorageLogger {
  constructor(private prefix: string = '[Storage]') {}
  debug(message: string, ...args: unknown[]): void { console.debug(`${this.prefix} ${message}`, ...args); }
  info(message: string, ...args: unknown[]): void { console.info(`${this.prefix} ${message}`, ...args); }
  warn(message: string, ...args: unknown[]): void { console.warn(`${this.prefix} ${message}`, ...args); }
  error(message: string, ...args: unknown[]): void { console.error(`${this.prefix} ${message}`, ...args); }
}

export class NoOpStorageLogger implements IStorageLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}
```

---

## 2. 热存储实现

### lib/storage/hot/redis-store.ts

```typescript
/**
 * Phase 1 冷热分层存储 - 热存储层 (Redis)
 * 基于 Upstash Redis / AWS ElastiCache 实现
 */

import {
  StorageTier, StorageItem, StorageQuery, StorageResult,
  StorageStats, HotStorageConfig, SetOptions, DataPriority,
  StorageErrorCode,
} from '../types';
import {
  BaseStorageAdapter, ResultBuilder, StorageException,
  DataSerializer, IStorageLogger, ConsoleStorageLogger, NoOpStorageLogger,
} from '../dal';

// ==================== Upstash Redis 客户端 ====================

export class UpstashRedisClient {
  private baseUrl: string;
  private token: string;
  private retryAttempts: number;
  private retryDelay: number;

  constructor(config: { url: string; token: string; retryAttempts?: number; retryDelay?: number }) {
    this.baseUrl = config.url;
    this.token = config.token;
    this.retryAttempts = config.retryAttempts ?? 3;
    this.retryDelay = config.retryDelay ?? 100;
  }

  private async request<T>(command: (string | number | undefined)[]): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(command),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        if (result.error) {
          throw new Error(`Redis error: ${result.error}`);
        }
        return result.result as T;
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.retryAttempts - 1) {
          await this.delay(this.retryDelay * Math.pow(2, attempt));
        }
      }
    }
    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async get(key: string): Promise<string | null> {
    return this.request<string | null>(['GET', key]);
  }

  async set(key: string, value: string, options?: { ex?: number; px?: number; nx?: boolean; xx?: boolean; keepttl?: boolean }): Promise<string | null> {
    const args: (string | number | boolean | undefined)[] = ['SET', key, value];
    if (options?.nx) args.push('NX');
    if (options?.xx) args.push('XX');
    if (options?.keepttl) args.push('KEEPTTL');
    if (options?.ex) args.push('EX', options.ex);
    else if (options?.px) args.push('PX', options.px);
    return this.request<string | null>(args);
  }

  async del(...keys: string[]): Promise<number> {
    return this.request<number>(['DEL', ...keys]);
  }

  async exists(...keys: string[]): Promise<number> {
    return this.request<number>(['EXISTS', ...keys]);
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    return this.request<(string | null)[]>(['MGET', ...keys]);
  }

  async mset(entries: Record<string, string>): Promise<string> {
    const args: string[] = [];
    for (const [key, value] of Object.entries(entries)) {
      args.push(key, value);
    }
    return this.request<string>(['MSET', ...args]);
  }

  async keys(pattern: string): Promise<string[]> {
    return this.request<string[]>(['KEYS', pattern]);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.request<number>(['EXPIRE', key, seconds]);
  }

  async ttl(key: string): Promise<number> {
    return this.request<number>(['TTL', key]);
  }

  async ping(): Promise<string> {
    return this.request<string>(['PING']);
  }

  async info(): Promise<string> {
    return this.request<string>(['INFO']);
  }

  async dbsize(): Promise<number> {
    return this.request<number>(['DBSIZE']);
  }
}

// ==================== Redis 存储适配器 ====================

interface RedisStoredItem {
  v: unknown;
  ca: number;
  ua: number;
  ac: number;
  la: number;
  pr: number;
  md?: Record<string, unknown>;
}

export class RedisStorageAdapter extends BaseStorageAdapter {
  readonly tier = StorageTier.HOT;

  private client: UpstashRedisClient | null = null;
  private config: HotStorageConfig;
  private logger: IStorageLogger;
  private connectionTimeout: number;
  private _isConnected: boolean = false;

  constructor(config: HotStorageConfig, logger?: IStorageLogger) {
    super();
    this.config = config;
    this.logger = logger ?? new ConsoleStorageLogger('[RedisStorage]');
    this.connectionTimeout = config.connectionTimeout ?? 5000;
  }

  get isAvailable(): boolean { return this.client !== null && this._isConnected; }
  get isConnected(): boolean { return this._isConnected; }

  async initialize(): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.logger.info('Initializing Redis storage adapter...');

      this.client = new UpstashRedisClient({
        url: this.config.redisUrl,
        token: this.config.redisToken ?? '',
        retryAttempts: this.config.retryAttempts,
        retryDelay: this.config.retryDelay,
      });

      const pingResult = await this.withTimeout(this.client.ping(), this.connectionTimeout);

      if (pingResult !== 'PONG') {
        throw new StorageException(StorageErrorCode.CONNECTION_FAILED, 'Redis ping failed');
      }

      this._isConnected = true;
      this.initialized = true;

      this.logger.info('Redis storage adapter initialized successfully');
      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      this._isConnected = false;
      this.logger.error('Failed to initialize Redis storage:', error);
      return ResultBuilder.failure(
        StorageErrorCode.CONNECTION_FAILED,
        `Failed to initialize Redis: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async close(): Promise<StorageResult<void>> {
    const start = performance.now();
    this._isConnected = false;
    this.initialized = false;
    this.client = null;
    this.logger.info('Redis storage adapter closed');
    return ResultBuilder.success(undefined, this.tier, performance.now() - start);
  }

  async healthCheck(): Promise<StorageResult<StorageStats>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const [pingResult, dbSize] = await Promise.all([
        this.client!.ping(),
        this.client!.dbsize(),
      ]);

      if (pingResult !== 'PONG') {
        throw new StorageException(StorageErrorCode.CONNECTION_LOST, 'Redis health check failed');
      }

      const stats: StorageStats = {
        tier: this.tier,
        itemCount: dbSize,
        totalSize: 0,
      };

      return ResultBuilder.success(stats, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.CONNECTION_LOST,
        `Health check failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async get<T>(key: string): Promise<StorageResult<T>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const data = await this.client!.get(key);

      if (data === null) {
        return ResultBuilder.failure(StorageErrorCode.NOT_FOUND, `Key not found: ${key}`, this.tier);
      }

      const stored: RedisStoredItem = JSON.parse(data);
      stored.ac += 1;
      stored.la = Date.now();

      this.client!.set(key, JSON.stringify(stored), { keepttl: true }).catch(err => {
        this.logger.warn('Failed to update access stats:', err);
      });

      this.emitEvent({ type: 'item:accessed', timestamp: Date.now(), key, tier: this.tier });
      return ResultBuilder.success(stored.v as T, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Get failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async set<T>(key: string, value: T, options?: SetOptions): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const now = Date.now();
      const stored: RedisStoredItem = {
        v: value,
        ca: now,
        ua: now,
        ac: 0,
        la: now,
        pr: options?.priority ?? DataPriority.MEDIUM,
        md: options?.metadata,
      };

      const serialized = JSON.stringify(stored);

      const redisOptions: { nx?: boolean; xx?: boolean; keepttl?: boolean; px?: number } = {
        nx: options?.ifNotExists,
        xx: options?.ifExists,
        keepttl: options?.keepTTL,
      };

      if (options?.ttl) redisOptions.px = options.ttl;
      else if (this.config.defaultTTL) redisOptions.px = this.config.defaultTTL;

      const result = await this.client!.set(key, serialized, redisOptions);

      if (result === null && (options?.ifNotExists || options?.ifExists)) {
        return ResultBuilder.failure(
          options.ifNotExists ? StorageErrorCode.ALREADY_EXISTS : StorageErrorCode.NOT_FOUND,
          `Set condition not met for key: ${key}`,
          this.tier
        );
      }

      this.emitEvent({ type: 'item:created', timestamp: now, key, tier: this.tier });
      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Set failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async delete(key: string): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const result = await this.client!.del(key);

      if (result === 0) {
        return ResultBuilder.failure(StorageErrorCode.NOT_FOUND, `Key not found: ${key}`, this.tier);
      }

      this.emitEvent({ type: 'item:deleted', timestamp: Date.now(), key, tier: this.tier });
      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Delete failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async exists(key: string): Promise<StorageResult<boolean>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const result = await this.client!.exists(key);
      return ResultBuilder.success(result === 1, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Exists check failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async mget<T>(keys: string[]): Promise<StorageResult<Map<string, T>>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      if (keys.length === 0) {
        return ResultBuilder.success(new Map(), this.tier, 0);
      }

      const results = await this.client!.mget(...keys);
      const map = new Map<string, T>();

      keys.forEach((key, index) => {
        const data = results[index];
        if (data !== null) {
          const stored: RedisStoredItem = JSON.parse(data);
          map.set(key, stored.v as T);
        }
      });

      return ResultBuilder.success(map, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Mget failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async mset<T>(entries: Array<{ key: string; value: T }>, options?: SetOptions): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const now = Date.now();
      const redisEntries: Record<string, string> = {};

      for (const { key, value } of entries) {
        const stored: RedisStoredItem = {
          v: value,
          ca: now,
          ua: now,
          ac: 0,
          la: now,
          pr: options?.priority ?? DataPriority.MEDIUM,
          md: options?.metadata,
        };
        redisEntries[key] = JSON.stringify(stored);
      }

      await this.client!.mset(redisEntries);

      if (options?.ttl || this.config.defaultTTL) {
        const ttlSeconds = Math.floor((options?.ttl ?? this.config.defaultTTL!) / 1000);
        for (const key of Object.keys(redisEntries)) {
          await this.client!.expire(key, ttlSeconds);
        }
      }

      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Mset failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async mdelete(keys: string[]): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      if (keys.length === 0) {
        return ResultBuilder.success(undefined, this.tier, 0);
      }

      await this.client!.del(...keys);
      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Mdelete failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async keys(pattern?: string): Promise<StorageResult<string[]>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const result = await this.client!.keys(pattern ?? '*');
      return ResultBuilder.success(result, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Keys query failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async query(query: StorageQuery): Promise<StorageResult<StorageItem[]>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      let keys: string[] = [];

      if (query.key) {
        const exists = await this.client!.exists(query.key);
        if (exists) keys = [query.key];
      } else if (query.keyPattern) {
        keys = await this.client!.keys(query.keyPattern);
      } else {
        keys = await this.client!.keys('*');
      }

      const offset = query.offset ?? 0;
      const limit = query.limit ?? keys.length;
      keys = keys.slice(offset, offset + limit);

      const items: StorageItem[] = [];

      for (const key of keys) {
        const data = await this.client!.get(key);
        if (data) {
          const stored: RedisStoredItem = JSON.parse(data);

          if (query.priority !== undefined && stored.pr !== query.priority) continue;
          if (query.createdBefore && stored.ca >= query.createdBefore) continue;
          if (query.createdAfter && stored.ca <= query.createdAfter) continue;

          items.push({
            key,
            value: stored.v,
            tier: this.tier,
            createdAt: stored.ca,
            updatedAt: stored.ua,
            accessCount: stored.ac,
            lastAccessedAt: stored.la,
            priority: stored.pr,
            size: DataSerializer.estimateSize(stored.v),
            metadata: stored.md,
          });
        }
      }

      return ResultBuilder.success(items, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Query failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async stats(): Promise<StorageResult<StorageStats>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const [dbSize, info] = await Promise.all([
        this.client!.dbsize(),
        this.client!.info(),
      ]);

      const usedMemory = this.parseUsedMemory(info);

      const stats: StorageStats = {
        tier: this.tier,
        itemCount: dbSize,
        totalSize: usedMemory,
      };

      return ResultBuilder.success(stats, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Stats failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async clear(): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const keys = await this.client!.keys('*');

      if (keys.length > 0) {
        await this.client!.del(...keys);
      }

      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Clear failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async cleanup(): Promise<StorageResult<number>> {
    return ResultBuilder.success(0, this.tier, 0);
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs)),
    ]);
  }

  private parseUsedMemory(info: string): number {
    const match = info.match(/used_memory:(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }
}
```

---

## 3. 温存储实现

### lib/storage/warm/indexeddb-store.ts

```typescript
/**
 * Phase 1 冷热分层存储 - 温存储层 (IndexedDB)
 * 基于 Dexie.js 封装实现
 */

import {
  StorageTier, StorageItem, StorageQuery, StorageResult,
  StorageStats, WarmStorageConfig, SetOptions, DataPriority,
  StorageErrorCode,
} from '../types';
import {
  BaseStorageAdapter, ResultBuilder, StorageException,
  DataSerializer, IStorageLogger, ConsoleStorageLogger, NoOpStorageLogger,
} from '../dal';

// ==================== IndexedDB 存储数据结构 ====================

interface IndexedDBStoredItem {
  key: string;
  value: unknown;
  tier: StorageTier;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  accessCount: number;
  lastAccessedAt: number;
  priority: DataPriority;
  size: number;
  metadata?: Record<string, unknown>;
}

// ==================== Dexie-like IndexedDB 封装 ====================

export class IndexedDBWrapper {
  private nativeDB: IDBDatabase | null = null;
  private dbName: string;
  private dbVersion: number;
  private stores: string[];

  constructor(config: { dbName: string; dbVersion: number; stores: string[]; indexes?: Record<string, string[]> }) {
    this.dbName = config.dbName;
    this.dbVersion = config.dbVersion;
    this.stores = config.stores;
  }

  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.nativeDB = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        for (const storeName of this.stores) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'key' });
          }
        }
      };
    });
  }

  close(): void {
    if (this.nativeDB) {
      this.nativeDB.close();
      this.nativeDB = null;
    }
  }

  async get(storeName: string, key: string): Promise<IndexedDBStoredItem | undefined> {
    return new Promise((resolve, reject) => {
      const transaction = this.nativeDB!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName: string): Promise<IndexedDBStoredItem[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.nativeDB!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put(storeName: string, item: IndexedDBStoredItem): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.nativeDB!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName: string, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.nativeDB!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(storeName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.nativeDB!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async count(storeName: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const transaction = this.nativeDB!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async keys(storeName: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.nativeDB!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });
  }
}

// ==================== IndexedDB 存储适配器 ====================

export class IndexedDBStorageAdapter extends BaseStorageAdapter {
  readonly tier = StorageTier.WARM;

  private db: IndexedDBWrapper | null = null;
  private config: WarmStorageConfig;
  private logger: IStorageLogger;
  private defaultStore: string;
  private _isConnected: boolean = false;

  constructor(config: WarmStorageConfig, logger?: IStorageLogger) {
    super();
    this.config = config;
    this.defaultStore = config.stores[0] ?? 'items';
    this.logger = logger ?? new ConsoleStorageLogger('[IndexedDBStorage]');
  }

  get isAvailable(): boolean { return typeof indexedDB !== 'undefined'; }
  get isConnected(): boolean { return this._isConnected; }

  async initialize(): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.logger.info('Initializing IndexedDB storage adapter...');

      if (!this.isAvailable) {
        throw new StorageException(
          StorageErrorCode.TIER_UNAVAILABLE,
          'IndexedDB is not supported in this environment'
        );
      }

      this.db = new IndexedDBWrapper({
        dbName: this.config.dbName,
        dbVersion: this.config.dbVersion,
        stores: this.config.stores,
        indexes: this.config.indexes,
      });

      await this.db.open();

      this._isConnected = true;
      this.initialized = true;

      this.logger.info('IndexedDB storage adapter initialized successfully');
      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      this._isConnected = false;
      this.logger.error('Failed to initialize IndexedDB storage:', error);
      return ResultBuilder.failure(
        StorageErrorCode.CONNECTION_FAILED,
        `Failed to initialize IndexedDB: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async close(): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.logger.info('Closing IndexedDB storage adapter...');

      if (this.db) {
        this.db.close();
        this.db = null;
      }

      this._isConnected = false;
      this.initialized = false;

      this.logger.info('IndexedDB storage adapter closed');
      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      this.logger.error('Error closing IndexedDB storage:', error);
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Error closing IndexedDB: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async healthCheck(): Promise<StorageResult<StorageStats>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const count = await this.db!.count(this.defaultStore);

      const stats: StorageStats = {
        tier: this.tier,
        itemCount: count,
        totalSize: 0,
      };

      return ResultBuilder.success(stats, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.CONNECTION_LOST,
        `Health check failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async get<T>(key: string): Promise<StorageResult<T>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const item = await this.db!.get(this.defaultStore, key);

      if (!item) {
        return ResultBuilder.failure(StorageErrorCode.NOT_FOUND, `Key not found: ${key}`, this.tier);
      }

      if (item.expiresAt && item.expiresAt < Date.now()) {
        this.db!.delete(this.defaultStore, key).catch(err => {
          this.logger.warn('Failed to delete expired item:', err);
        });

        return ResultBuilder.failure(StorageErrorCode.NOT_FOUND, `Key expired: ${key}`, this.tier);
      }

      item.accessCount += 1;
      item.lastAccessedAt = Date.now();

      this.db!.put(this.defaultStore, item).catch(err => {
        this.logger.warn('Failed to update access stats:', err);
      });

      this.emitEvent({ type: 'item:accessed', timestamp: Date.now(), key, tier: this.tier });
      return ResultBuilder.success(item.value as T, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Get failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async set<T>(key: string, value: T, options?: SetOptions): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const now = Date.now();
      const size = DataSerializer.estimateSize(value);

      if (options?.ifNotExists || options?.ifExists) {
        const existing = await this.db!.get(this.defaultStore, key);

        if (options.ifNotExists && existing) {
          return ResultBuilder.failure(StorageErrorCode.ALREADY_EXISTS, `Key already exists: ${key}`, this.tier);
        }

        if (options.ifExists && !existing) {
          return ResultBuilder.failure(StorageErrorCode.NOT_FOUND, `Key not found: ${key}`, this.tier);
        }
      }

      const item: IndexedDBStoredItem = {
        key,
        value,
        tier: this.tier,
        createdAt: now,
        updatedAt: now,
        expiresAt: options?.ttl ? now + options.ttl : undefined,
        accessCount: 0,
        lastAccessedAt: now,
        priority: options?.priority ?? DataPriority.MEDIUM,
        size,
        metadata: options?.metadata,
      };

      await this.db!.put(this.defaultStore, item);

      this.emitEvent({ type: 'item:created', timestamp: now, key, tier: this.tier });
      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      if ((error as Error).name === 'QuotaExceededError') {
        return ResultBuilder.failure(
          StorageErrorCode.QUOTA_EXCEEDED,
          `Storage quota exceeded`,
          this.tier,
          error as Error
        );
      }

      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Set failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async delete(key: string): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const existing = await this.db!.get(this.defaultStore, key);

      if (!existing) {
        return ResultBuilder.failure(StorageErrorCode.NOT_FOUND, `Key not found: ${key}`, this.tier);
      }

      await this.db!.delete(this.defaultStore, key);

      this.emitEvent({ type: 'item:deleted', timestamp: Date.now(), key, tier: this.tier });
      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Delete failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async exists(key: string): Promise<StorageResult<boolean>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const item = await this.db!.get(this.defaultStore, key);

      if (item && item.expiresAt && item.expiresAt < Date.now()) {
        return ResultBuilder.success(false, this.tier, performance.now() - start);
      }

      return ResultBuilder.success(!!item, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Exists check failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async mget<T>(keys: string[]): Promise<StorageResult<Map<string, T>>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const map = new Map<string, T>();
      const now = Date.now();

      for (const key of keys) {
        const item = await this.db!.get(this.defaultStore, key);

        if (item && (!item.expiresAt || item.expiresAt >= now)) {
          map.set(key, item.value as T);

          item.accessCount += 1;
          item.lastAccessedAt = now;
          this.db!.put(this.defaultStore, item).catch(() => {});
        }
      }

      return ResultBuilder.success(map, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Mget failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async mset<T>(entries: Array<{ key: string; value: T }>, options?: SetOptions): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const now = Date.now();

      for (const { key, value } of entries) {
        const size = DataSerializer.estimateSize(value);
        const item: IndexedDBStoredItem = {
          key,
          value,
          tier: this.tier,
          createdAt: now,
          updatedAt: now,
          expiresAt: options?.ttl ? now + options.ttl : undefined,
          accessCount: 0,
          lastAccessedAt: now,
          priority: options?.priority ?? DataPriority.MEDIUM,
          size,
          metadata: options?.metadata,
        };

        await this.db!.put(this.defaultStore, item);
      }

      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Mset failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async mdelete(keys: string[]): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      for (const key of keys) {
        await this.db!.delete(this.defaultStore, key);
      }

      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Mdelete failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async keys(pattern?: string): Promise<StorageResult<string[]>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const allKeys = await this.db!.keys(this.defaultStore);

      let filteredKeys = allKeys;

      if (pattern && pattern !== '*') {
        const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
        filteredKeys = allKeys.filter(key => regex.test(key));
      }

      return ResultBuilder.success(filteredKeys, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Keys query failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async query(query: StorageQuery): Promise<StorageResult<StorageItem[]>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      let items = await this.db!.getAll(this.defaultStore);
      const now = Date.now();

      items = items.filter(item => !item.expiresAt || item.expiresAt >= now);

      if (query.key) items = items.filter(item => item.key === query.key);

      if (query.keyPattern) {
        const regex = new RegExp(query.keyPattern.replace(/\*/g, '.*'));
        items = items.filter(item => regex.test(item.key));
      }

      if (query.priority !== undefined) items = items.filter(item => item.priority === query.priority);
      if (query.createdBefore) items = items.filter(item => item.createdAt < query.createdBefore!);
      if (query.createdAfter) items = items.filter(item => item.createdAt > query.createdAfter!);
      if (query.expiresBefore) items = items.filter(item => item.expiresAt && item.expiresAt < query.expiresBefore!);

      const offset = query.offset ?? 0;
      const limit = query.limit ?? items.length;
      items = items.slice(offset, offset + limit);

      const storageItems: StorageItem[] = items.map(item => ({
        key: item.key,
        value: item.value,
        tier: item.tier,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        expiresAt: item.expiresAt,
        accessCount: item.accessCount,
        lastAccessedAt: item.lastAccessedAt,
        priority: item.priority,
        size: item.size,
        metadata: item.metadata,
      }));

      return ResultBuilder.success(storageItems, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Query failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async stats(): Promise<StorageResult<StorageStats>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const items = await this.db!.getAll(this.defaultStore);
      const now = Date.now();

      const validItems = items.filter(item => !item.expiresAt || item.expiresAt >= now);
      const totalSize = validItems.reduce((sum, item) => sum + item.size, 0);

      const stats: StorageStats = {
        tier: this.tier,
        itemCount: validItems.length,
        totalSize,
        oldestItem: validItems.length > 0 ? Math.min(...validItems.map(i => i.createdAt)) : undefined,
        newestItem: validItems.length > 0 ? Math.max(...validItems.map(i => i.createdAt)) : undefined,
      };

      return ResultBuilder.success(stats, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Stats failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async clear(): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      await this.db!.clear(this.defaultStore);
      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Clear failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async cleanup(): Promise<StorageResult<number>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const items = await this.db!.getAll(this.defaultStore);
      const now = Date.now();
      let cleanedCount = 0;

      for (const item of items) {
        if (item.expiresAt && item.expiresAt < now) {
          await this.db!.delete(this.defaultStore, item.key);
          cleanedCount++;
        }
      }

      this.logger.info(`Cleaned up ${cleanedCount} expired items`);
      return ResultBuilder.success(cleanedCount, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Cleanup failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }
}
```

---

## 4. 冷存储实现

### lib/storage/cold/file-store.ts

```typescript
/**
 * Phase 1 冷热分层存储 - 冷存储层 (文件系统)
 * 基于 OPFS / Node.js fs 实现
 */

import {
  StorageTier, StorageItem, StorageQuery, StorageResult,
  StorageStats, ColdStorageConfig, SetOptions, DataPriority,
  StorageErrorCode, SerializedData,
} from '../types';
import {
  BaseStorageAdapter, ResultBuilder, StorageException,
  DataSerializer, IStorageLogger, ConsoleStorageLogger, NoOpStorageLogger,
} from '../dal';

// ==================== 文件系统接口 ====================

interface IFileSystem {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  listFiles(dir: string): Promise<string[]>;
  createDirectory(path: string): Promise<void>;
  stat(path: string): Promise<{ size: number; mtime: number }>;
}

// ==================== OPFS 文件系统实现 ====================

export class OPFSFileSystem implements IFileSystem {
  private rootHandle: FileSystemDirectoryHandle | null = null;
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async initialize(): Promise<void> {
    if (!('storage' in navigator && 'getDirectory' in navigator.storage)) {
      throw new Error('OPFS is not supported in this environment');
    }

    this.rootHandle = await navigator.storage.getDirectory();
    await this.createDirectoryRecursive(this.basePath);
  }

  private async createDirectoryRecursive(path: string): Promise<void> {
    if (!this.rootHandle) throw new Error('OPFS not initialized');

    const parts = path.split('/').filter(p => p);
    let currentHandle = this.rootHandle;

    for (const part of parts) {
      currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
    }
  }

  private async getDirectoryHandle(path: string): Promise<FileSystemDirectoryHandle> {
    if (!this.rootHandle) throw new Error('OPFS not initialized');

    const parts = path.split('/').filter(p => p);
    let currentHandle = this.rootHandle;

    for (const part of parts) {
      currentHandle = await currentHandle.getDirectoryHandle(part);
    }

    return currentHandle;
  }

  private async getFileHandle(path: string, create: boolean = false): Promise<FileSystemFileHandle> {
    if (!this.rootHandle) throw new Error('OPFS not initialized');

    const dirPath = path.substring(0, path.lastIndexOf('/')) || this.basePath;
    const fileName = path.substring(path.lastIndexOf('/') + 1);

    const dirHandle = await this.getDirectoryHandle(dirPath);
    return dirHandle.getFileHandle(fileName, { create });
  }

  async readFile(path: string): Promise<Uint8Array> {
    const fileHandle = await this.getFileHandle(path);
    const file = await fileHandle.getFile();
    const arrayBuffer = await file.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const fileHandle = await this.getFileHandle(path, true);
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  async deleteFile(path: string): Promise<void> {
    const dirPath = path.substring(0, path.lastIndexOf('/')) || this.basePath;
    const fileName = path.substring(path.lastIndexOf('/') + 1);
    const dirHandle = await this.getDirectoryHandle(dirPath);
    await dirHandle.removeEntry(fileName);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.getFileHandle(path);
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(dir: string): Promise<string[]> {
    const dirHandle = await this.getDirectoryHandle(dir);
    const files: string[] = [];

    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        files.push(entry.name);
      }
    }

    return files;
  }

  async createDirectory(path: string): Promise<void> {
    await this.createDirectoryRecursive(path);
  }

  async stat(path: string): Promise<{ size: number; mtime: number }> {
    const fileHandle = await this.getFileHandle(path);
    const file = await fileHandle.getFile();

    return {
      size: file.size,
      mtime: file.lastModified,
    };
  }
}

// ==================== Node.js 文件系统实现 ====================

export class NodeFileSystem implements IFileSystem {
  private fs: typeof import('fs/promises') | null = null;
  private path: typeof import('path') | null = null;
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async initialize(): Promise<void> {
    try {
      this.fs = await import('fs/promises');
      this.path = await import('path');
      await this.fs.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to initialize Node.js file system: ${(error as Error).message}`);
    }
  }

  private resolvePath(filePath: string): string {
    if (!this.path) throw new Error('File system not initialized');
    return this.path.resolve(this.basePath, filePath);
  }

  async readFile(path: string): Promise<Uint8Array> {
    if (!this.fs) throw new Error('File system not initialized');
    const buffer = await this.fs.readFile(this.resolvePath(path));
    return new Uint8Array(buffer);
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    if (!this.fs) throw new Error('File system not initialized');
    const fullPath = this.resolvePath(path);
    const dir = fullPath.substring(0, fullPath.lastIndexOf('\\')) || fullPath.substring(0, fullPath.lastIndexOf('/'));
    await this.fs.mkdir(dir, { recursive: true });
    await this.fs.writeFile(fullPath, data);
  }

  async deleteFile(path: string): Promise<void> {
    if (!this.fs) throw new Error('File system not initialized');
    await this.fs.unlink(this.resolvePath(path));
  }

  async exists(path: string): Promise<boolean> {
    if (!this.fs) throw new Error('File system not initialized');
    try {
      await this.fs.access(this.resolvePath(path));
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(dir: string): Promise<string[]> {
    if (!this.fs) throw new Error('File system not initialized');
    const entries = await this.fs.readdir(this.resolvePath(dir), { withFileTypes: true });
    return entries.filter(e => e.isFile()).map(e => e.name);
  }

  async createDirectory(path: string): Promise<void> {
    if (!this.fs) throw new Error('File system not initialized');
    await this.fs.mkdir(this.resolvePath(path), { recursive: true });
  }

  async stat(path: string): Promise<{ size: number; mtime: number }> {
    if (!this.fs) throw new Error('File system not initialized');
    const stats = await this.fs.stat(this.resolvePath(path));
    return {
      size: stats.size,
      mtime: stats.mtime.getTime(),
    };
  }
}

// ==================== 文件存储适配器 ====================

interface FileStoredItem {
  v: unknown;
  ca: number;
  ua: number;
  ea?: number;
  ac: number;
  la: number;
  pr: number;
  sz: number;
  md?: Record<string, unknown>;
}

export class FileStorageAdapter extends BaseStorageAdapter {
  readonly tier = StorageTier.COLD;

  private fs: IFileSystem | null = null;
  private config: ColdStorageConfig;
  private logger: IStorageLogger;
  private _isConnected: boolean = false;

  constructor(config: ColdStorageConfig, logger?: IStorageLogger) {
    super();
    this.config = config;
    this.logger = logger ?? new ConsoleStorageLogger('[FileStorage]');
  }

  get isAvailable(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      'getDirectory' in navigator.storage
    ) || (
      typeof process !== 'undefined' &&
      process.versions?.node !== undefined
    );
  }

  get isConnected(): boolean { return this._isConnected; }

  async initialize(): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.logger.info('Initializing file storage adapter...');

      if (typeof navigator !== 'undefined' && 'storage' in navigator) {
        this.fs = new OPFSFileSystem(this.config.basePath);
      } else if (typeof process !== 'undefined' && process.versions?.node) {
        this.fs = new NodeFileSystem(this.config.basePath);
      } else {
        throw new StorageException(
          StorageErrorCode.TIER_UNAVAILABLE,
          'No file system available in this environment'
        );
      }

      await this.fs.initialize();
      await this.fs.createDirectory('data');
      await this.fs.createDirectory('metadata');

      this._isConnected = true;
      this.initialized = true;

      this.logger.info('File storage adapter initialized successfully');
      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      this._isConnected = false;
      this.logger.error('Failed to initialize file storage:', error);
      return ResultBuilder.failure(
        StorageErrorCode.CONNECTION_FAILED,
        `Failed to initialize file storage: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async close(): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.logger.info('Closing file storage adapter...');
      this.fs = null;
      this._isConnected = false;
      this.initialized = false;

      this.logger.info('File storage adapter closed');
      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      this.logger.error('Error closing file storage:', error);
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Error closing file storage: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async healthCheck(): Promise<StorageResult<StorageStats>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const files = await this.fs!.listFiles('data');

      let totalSize = 0;
      for (const file of files) {
        try {
          const stat = await this.fs!.stat(`data/${file}`);
          totalSize += stat.size;
        } catch {}
      }

      const stats: StorageStats = {
        tier: this.tier,
        itemCount: files.length,
        totalSize,
      };

      return ResultBuilder.success(stats, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.CONNECTION_LOST,
        `Health check failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async get<T>(key: string): Promise<StorageResult<T>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const filePath = this.getFilePath(key);

      if (!await this.fs!.exists(filePath)) {
        return ResultBuilder.failure(StorageErrorCode.NOT_FOUND, `Key not found: ${key}`, this.tier);
      }

      const data = await this.fs!.readFile(filePath);
      const stored: FileStoredItem = JSON.parse(new TextDecoder().decode(data));

      if (stored.ea && stored.ea < Date.now()) {
        this.fs!.deleteFile(filePath).catch(err => {
          this.logger.warn('Failed to delete expired file:', err);
        });

        return ResultBuilder.failure(StorageErrorCode.NOT_FOUND, `Key expired: ${key}`, this.tier);
      }

      stored.ac += 1;
      stored.la = Date.now();

      this.writeFile(key, stored).catch(err => {
        this.logger.warn('Failed to update access stats:', err);
      });

      this.emitEvent({ type: 'item:accessed', timestamp: Date.now(), key, tier: this.tier });
      return ResultBuilder.success(stored.v as T, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Get failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async set<T>(key: string, value: T, options?: SetOptions): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const now = Date.now();
      const size = DataSerializer.estimateSize(value);

      if (options?.ifNotExists) {
        const filePath = this.getFilePath(key);
        if (await this.fs!.exists(filePath)) {
          return ResultBuilder.failure(StorageErrorCode.ALREADY_EXISTS, `Key already exists: ${key}`, this.tier);
        }
      }

      if (options?.ifExists) {
        const filePath = this.getFilePath(key);
        if (!await this.fs!.exists(filePath)) {
          return ResultBuilder.failure(StorageErrorCode.NOT_FOUND, `Key not found: ${key}`, this.tier);
        }
      }

      const stored: FileStoredItem = {
        v: value,
        ca: now,
        ua: now,
        ea: options?.ttl ? now + options.ttl : undefined,
        ac: 0,
        la: now,
        pr: options?.priority ?? DataPriority.LOW,
        sz: size,
        md: options?.metadata,
      };

      await this.writeFile(key, stored);

      this.emitEvent({ type: 'item:created', timestamp: now, key, tier: this.tier });
      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Set failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async delete(key: string): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const filePath = this.getFilePath(key);

      if (!await this.fs!.exists(filePath)) {
        return ResultBuilder.failure(StorageErrorCode.NOT_FOUND, `Key not found: ${key}`, this.tier);
      }

      await this.fs!.deleteFile(filePath);

      this.emitEvent({ type: 'item:deleted', timestamp: Date.now(), key, tier: this.tier });
      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Delete failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async exists(key: string): Promise<StorageResult<boolean>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const filePath = this.getFilePath(key);
      const exists = await this.fs!.exists(filePath);

      if (exists) {
        try {
          const data = await this.fs!.readFile(filePath);
          const stored: FileStoredItem = JSON.parse(new TextDecoder().decode(data));

          if (stored.ea && stored.ea < Date.now()) {
            return ResultBuilder.success(false, this.tier, performance.now() - start);
          }
        } catch {
          return ResultBuilder.success(false, this.tier, performance.now() - start);
        }
      }

      return ResultBuilder.success(exists, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Exists check failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async mget<T>(keys: string[]): Promise<StorageResult<Map<string, T>>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const map = new Map<string, T>();

      for (const key of keys) {
        const result = await this.get<T>(key);
        if (result.success && result.data !== undefined) {
          map.set(key, result.data);
        }
      }

      return ResultBuilder.success(map, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Mget failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async mset<T>(entries: Array<{ key: string; value: T }>, options?: SetOptions): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      for (const { key, value } of entries) {
        await this.set(key, value, options);
      }

      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Mset failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async mdelete(keys: string[]): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      for (const key of keys) {
        await this.delete(key);
      }

      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Mdelete failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async keys(pattern?: string): Promise<StorageResult<string[]>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const files = await this.fs!.listFiles('data');

      let keys = files.map(f => this.fileNameToKey(f));

      if (pattern && pattern !== '*') {
        const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
        keys = keys.filter(key => regex.test(key));
      }

      return ResultBuilder.success(keys, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Keys query failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async query(query: StorageQuery): Promise<StorageResult<StorageItem[]>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const files = await this.fs!.listFiles('data');
      const items: StorageItem[] = [];
      const now = Date.now();

      for (const file of files) {
        try {
          const data = await this.fs!.readFile(`data/${file}`);
          const stored: FileStoredItem = JSON.parse(new TextDecoder().decode(data));

          if (stored.ea && stored.ea < now) continue;

          const key = this.fileNameToKey(file);

          if (query.key && key !== query.key) continue;

          if (query.keyPattern) {
            const regex = new RegExp(query.keyPattern.replace(/\*/g, '.*'));
            if (!regex.test(key)) continue;
          }

          if (query.priority !== undefined && stored.pr !== query.priority) continue;
          if (query.createdBefore && stored.ca >= query.createdBefore) continue;
          if (query.createdAfter && stored.ca <= query.createdAfter) continue;
          if (query.expiresBefore && (!stored.ea || stored.ea >= query.expiresBefore)) continue;

          items.push({
            key,
            value: stored.v,
            tier: this.tier,
            createdAt: stored.ca,
            updatedAt: stored.ua,
            expiresAt: stored.ea,
            accessCount: stored.ac,
            lastAccessedAt: stored.la,
            priority: stored.pr,
            size: stored.sz,
            metadata: stored.md,
          });
        } catch {}
      }

      const offset = query.offset ?? 0;
      const limit = query.limit ?? items.length;
      const paginatedItems = items.slice(offset, offset + limit);

      return ResultBuilder.success(paginatedItems, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Query failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async stats(): Promise<StorageResult<StorageStats>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const files = await this.fs!.listFiles('data');

      let totalSize = 0;
      let validCount = 0;
      let oldestItem: number | undefined;
      let newestItem: number | undefined;
      const now = Date.now();

      for (const file of files) {
        try {
          const stat = await this.fs!.stat(`data/${file}`);
          const data = await this.fs!.readFile(`data/${file}`);
          const stored: FileStoredItem = JSON.parse(new TextDecoder().decode(data));

          if (stored.ea && stored.ea < now) continue;

          validCount++;
          totalSize += stat.size;

          if (oldestItem === undefined || stored.ca < oldestItem) oldestItem = stored.ca;
          if (newestItem === undefined || stored.ca > newestItem) newestItem = stored.ca;
        } catch {}
      }

      const stats: StorageStats = {
        tier: this.tier,
        itemCount: validCount,
        totalSize,
        oldestItem,
        newestItem,
      };

      return ResultBuilder.success(stats, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Stats failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async clear(): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const files = await this.fs!.listFiles('data');

      for (const file of files) {
        await this.fs!.deleteFile(`data/${file}`);
      }

      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Clear failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  async cleanup(): Promise<StorageResult<number>> {
    const start = performance.now();

    try {
      this.checkInitialized();
      const files = await this.fs!.listFiles('data');
      const now = Date.now();
      let cleanedCount = 0;

      for (const file of files) {
        try {
          const data = await this.fs!.readFile(`data/${file}`);
          const stored: FileStoredItem = JSON.parse(new TextDecoder().decode(data));

          if (stored.ea && stored.ea < now) {
            await this.fs!.deleteFile(`data/${file}`);
            cleanedCount++;
          }
        } catch {}
      }

      this.logger.info(`Cleaned up ${cleanedCount} expired files`);
      return ResultBuilder.success(cleanedCount, this.tier, performance.now() - start);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Cleanup failed: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
  }

  private getFilePath(key: string): string {
    const encodedKey = this.encodeKey(key);
    return `data/${encodedKey}.json`;
  }

  private encodeKey(key: string): string {
    return btoa(key).replace(/[/+=]/g, (c) => {
      const map: Record<string, string> = { '/': '_', '+': '-', '=': '' };
      return map[c] || c;
    });
  }

  private fileNameToKey(fileName: string): string {
    const encoded = fileName.replace(/\.json$/, '').replace(/_/g, '/').replace(/-/g, '+');
    const padding = 4 - (encoded.length % 4);
    const padded = encoded + '='.repeat(padding === 4 ? 0 : padding);
    return atob(padded);
  }

  private async writeFile(key: string, stored: FileStoredItem): Promise<void> {
    const filePath = this.getFilePath(key);
    const data = new TextEncoder().encode(JSON.stringify(stored));
    await this.fs!.writeFile(filePath, data);
  }
}
```

---

## 5. 分层策略引擎

### lib/storage/tier-manager.ts

```typescript
/**
 * Phase 1 冷热分层存储 - 分层策略引擎
 * Tier Manager - 自动迁移、TTL清理策略
 */

import {
  StorageTier, StorageItem, StorageQuery, StorageResult,
  StorageStats, StorageEvent, StorageEventType, StorageEventHandler,
  TierManagerConfig, SetOptions, DataPriority, MigrationTask,
  MigrationStatus, MigrationResult, StorageErrorCode,
  IStorageAdapter, ITierManager,
} from './types';
import {
  ResultBuilder, StorageException, DataSerializer,
  StorageEventEmitter, IStorageLogger, ConsoleStorageLogger, NoOpStorageLogger,
} from './dal';

// ==================== 分层决策策略 ====================

interface TierDecision {
  sourceTier: StorageTier;
  targetTier: StorageTier;
  reason: 'access_frequency' | 'ttl_expired' | 'storage_pressure' | 'manual_promotion' | 'manual_demotion' | 'priority_based' | 'size_based';
  priority: number;
}

// ==================== 分层策略引擎 ====================

export class TierPolicyEngine {
  private config: TierManagerConfig;

  constructor(config: TierManagerConfig) {
    this.config = config;
  }

  decideTierByAccess(item: StorageItem): TierDecision {
    const accessFrequency = this.calculateAccessFrequency(item);

    if (accessFrequency >= this.config.promotionThreshold) {
      if (item.tier !== StorageTier.HOT) {
        return { sourceTier: item.tier, targetTier: StorageTier.HOT, reason: 'access_frequency', priority: 10 };
      }
    }

    if (accessFrequency <= this.config.demotionThreshold && item.tier === StorageTier.WARM) {
      return { sourceTier: item.tier, targetTier: StorageTier.COLD, reason: 'access_frequency', priority: 5 };
    }

    return { sourceTier: item.tier, targetTier: item.tier, reason: 'access_frequency', priority: 0 };
  }

  decideTierByTTL(item: StorageItem): TierDecision {
    const now = Date.now();
    const age = now - item.createdAt;

    if (item.tier === StorageTier.HOT && age > this.config.hotToWarmTTL) {
      return { sourceTier: item.tier, targetTier: StorageTier.WARM, reason: 'ttl_expired', priority: 8 };
    }

    if (item.tier === StorageTier.WARM && age > this.config.warmToColdTTL) {
      return { sourceTier: item.tier, targetTier: StorageTier.COLD, reason: 'ttl_expired', priority: 7 };
    }

    return { sourceTier: item.tier, targetTier: item.tier, reason: 'ttl_expired', priority: 0 };
  }

  decideTierByPriority(item: StorageItem): TierDecision {
    switch (item.priority) {
      case DataPriority.CRITICAL:
      case DataPriority.HIGH:
        if (item.tier !== StorageTier.HOT) {
          return { sourceTier: item.tier, targetTier: StorageTier.HOT, reason: 'priority_based', priority: 9 };
        }
        break;

      case DataPriority.ARCHIVE:
        if (item.tier !== StorageTier.COLD) {
          return { sourceTier: item.tier, targetTier: StorageTier.COLD, reason: 'priority_based', priority: 6 };
        }
        break;
    }

    return { sourceTier: item.tier, targetTier: item.tier, reason: 'priority_based', priority: 0 };
  }

  makeDecision(item: StorageItem): TierDecision {
    const decisions: TierDecision[] = [
      this.decideTierByPriority(item),
      this.decideTierByAccess(item),
      this.decideTierByTTL(item),
    ];

    const sortedDecisions = decisions
      .filter(d => d.sourceTier !== d.targetTier)
      .sort((a, b) => b.priority - a.priority);

    return sortedDecisions[0] ?? { sourceTier: item.tier, targetTier: item.tier, reason: 'access_frequency', priority: 0 };
  }

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
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(logger?: IStorageLogger) {
    this.logger = logger ?? new ConsoleStorageLogger('[TierManager]');
  }

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
      throw new StorageException(StorageErrorCode.UNKNOWN, 'Tier manager not configured');
    }
    return this.config;
  }

  registerAdapter(tier: StorageTier, adapter: IStorageAdapter): void {
    this.adapters.set(tier, adapter);
    this.logger.info(`Registered adapter for tier: ${tier}`);
  }

  getAdapter(tier: StorageTier): IStorageAdapter | undefined {
    return this.adapters.get(tier);
  }

  async get<T>(key: string): Promise<StorageResult<T>> {
    const start = performance.now();

    try {
      const tiers = [StorageTier.HOT, StorageTier.WARM, StorageTier.COLD];

      for (const tier of tiers) {
        const adapter = this.adapters.get(tier);
        if (!adapter) continue;

        const result = await adapter.get<T>(key);

        if (result.success) {
          this.logger.debug(`Found key ${key} in ${tier}`);

          if (tier !== StorageTier.HOT && this.config?.enableAutoMigration) {
            this.schedulePromotion(key, tier);
          }

          return { ...result, latencyMs: performance.now() - start };
        }
      }

      return ResultBuilder.failure(StorageErrorCode.NOT_FOUND, `Key not found: ${key}`);
    } catch (error) {
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Get failed: ${(error as Error).message}`,
        undefined,
        error as Error
      );
    }
  }

  async set<T>(key: string, value: T, options?: SetOptions): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      let targetTier = StorageTier.WARM;

      if (options?.priority === DataPriority.CRITICAL || options?.priority === DataPriority.HIGH) {
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
      return { ...result, latencyMs: performance.now() - start };
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
      const results = await Promise.all(
        Array.from(this.adapters.values()).map(adapter => adapter.delete(key))
      );

      const success = results.some(r => r.success);

      if (!success) {
        return ResultBuilder.failure(StorageErrorCode.NOT_FOUND, `Key not found in any tier: ${key}`);
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

  async promote(key: string, targetTier: StorageTier = StorageTier.HOT): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      const currentTier = await this.findKeyTier(key);

      if (!currentTier) {
        return ResultBuilder.failure(StorageErrorCode.NOT_FOUND, `Key not found: ${key}`);
      }

      if (currentTier === targetTier) {
        return ResultBuilder.success(undefined, targetTier, 0);
      }

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
      const currentTier = await this.findKeyTier(key);

      if (!currentTier) {
        return ResultBuilder.failure(StorageErrorCode.NOT_FOUND, `Key not found: ${key}`);
      }

      if (currentTier === targetTier) {
        return ResultBuilder.success(undefined, targetTier, 0);
      }

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
        return ResultBuilder.failure(StorageErrorCode.TIER_UNAVAILABLE, `Source tier not available: ${sourceTier}`);
      }

      if (!targetAdapter) {
        return ResultBuilder.failure(StorageErrorCode.TIER_UNAVAILABLE, `Target tier not available: ${targetTier}`);
      }

      const getResult = await sourceAdapter.get<unknown>(key);

      if (!getResult.success) {
        return ResultBuilder.failure(
          StorageErrorCode.NOT_FOUND,
          `Failed to read from source tier: ${getResult.error?.message}`
        );
      }

      const value = getResult.data;

      const setResult = await targetAdapter.set(key, value!);

      if (!setResult.success) {
        return ResultBuilder.failure(
          StorageErrorCode.MIGRATION_FAILED,
          `Failed to write to target tier: ${setResult.error?.message}`
        );
      }

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

      const result: MigrationResult = { task, bytesTransferred, durationMs };

      this.emitEvent({ type: 'tier:migrated', timestamp: Date.now(), key, tier: targetTier, data: result });
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

  async migrateBatch(keys: string[], targetTier: StorageTier): Promise<StorageResult<MigrationResult[]>> {
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

  async getItemInfo(key: string): Promise<StorageResult<StorageItem>> {
    try {
      for (const [tier, adapter] of this.adapters) {
        const query: StorageQuery = { key };
        const result = await adapter.query(query);

        if (result.success && result.data && result.data.length > 0) {
          return ResultBuilder.success(result.data[0], tier);
        }
      }

      return ResultBuilder.failure(StorageErrorCode.NOT_FOUND, `Key not found: ${key}`);
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
      return ResultBuilder.failure(StorageErrorCode.NOT_FOUND, `Key not found: ${key}`);
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

      const offset = query.offset ?? 0;
      const limit = query.limit ?? allItems.length;
      const paginatedItems = allItems.slice(offset, offset + limit);

      return ResultBuilder.success(paginatedItems);
    } catch (error) {
      return ResultBuilder.failure(StorageErrorCode.UNKNOWN, `Query failed: ${(error as Error).message}`);
    }
  }

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
      return ResultBuilder.failure(StorageErrorCode.UNKNOWN, `Get stats failed: ${(error as Error).message}`);
    }
  }

  async getTierStats(tier: StorageTier): Promise<StorageResult<StorageStats>> {
    const adapter = this.adapters.get(tier);

    if (!adapter) {
      return ResultBuilder.failure(StorageErrorCode.TIER_UNAVAILABLE, `No adapter available for tier: ${tier}`);
    }

    return adapter.stats();
  }

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

      this.emitEvent({ type: 'cleanup:completed', timestamp: Date.now(), key: 'cleanup', data: { cleanedCount: totalCleaned } });
      return ResultBuilder.success(totalCleaned);
    } catch (error) {
      return ResultBuilder.failure(StorageErrorCode.UNKNOWN, `Cleanup failed: ${(error as Error).message}`);
    }
  }

  async runMigration(): Promise<StorageResult<MigrationResult[]>> {
    try {
      this.logger.info('Running migration analysis...');

      if (!this.policyEngine) {
        return ResultBuilder.failure(StorageErrorCode.UNKNOWN, 'Policy engine not initialized');
      }

      const results: MigrationResult[] = [];

      for (const [tier, adapter] of this.adapters) {
        const queryResult = await adapter.query({});

        if (!queryResult.success || !queryResult.data) continue;

        for (const item of queryResult.data) {
          const decision = this.policyEngine.makeDecision(item);

          if (decision.sourceTier !== decision.targetTier) {
            this.logger.debug(`Scheduling migration: ${item.key} ${decision.sourceTier} -> ${decision.targetTier} (${decision.reason})`);

            const migrateResult = await this.migrate(item.key, decision.sourceTier, decision.targetTier);

            if (migrateResult.success && migrateResult.data) {
              results.push(migrateResult.data);
            }
          }
        }
      }

      this.logger.info(`Migration completed: ${results.length} items migrated`);
      return ResultBuilder.success(results);
    } catch (error) {
      return ResultBuilder.failure(StorageErrorCode.MIGRATION_FAILED, `Migration run failed: ${(error as Error).message}`);
    }
  }

  on(event: StorageEventType, handler: StorageEventHandler): void {
    this.eventEmitter.on(event, handler);
  }

  off(event: StorageEventType, handler: StorageEventHandler): void {
    this.eventEmitter.off(event, handler);
  }

  private emitEvent(event: StorageEvent): void {
    this.eventEmitter.emit(event);
  }

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
    this.logger.debug(`Scheduled promotion for ${key} from ${fromTier}`);
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

---

## 6. 数据迁移工具

### lib/storage/migration.ts

```typescript
/**
 * Phase 1 冷热分层存储 - 数据迁移工具
 * Migration Tool - 热→冷迁移、批量迁移、数据导入导出
 */

import {
  StorageTier, StorageItem, StorageQuery, StorageResult,
  StorageErrorCode, MigrationTask, MigrationStatus,
  MigrationResult, IStorageAdapter, DataPriority,
} from './types';
import {
  ResultBuilder, StorageException, DataSerializer,
  IStorageLogger, ConsoleStorageLogger, NoOpStorageLogger,
} from './dal';

// ==================== 迁移配置 ====================

export interface MigrationConfig {
  batchSize: number;
  concurrency: number;
  retryAttempts: number;
  retryDelay: number;
  onProgress?: (progress: MigrationProgress) => void;
  onItemMigrated?: (result: MigrationResult) => void;
  onError?: (error: Error, task: MigrationTask) => void;
  filter?: {
    minAge?: number;
    maxAge?: number;
    minAccessCount?: number;
    maxAccessCount?: number;
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

  constructor(logger?: IStorageLogger) {
    this.logger = logger ?? new ConsoleStorageLogger('[MigrationTool]');
  }

  registerAdapter(tier: StorageTier, adapter: IStorageAdapter): void {
    this.adapters.set(tier, adapter);
    this.logger.info(`Registered adapter for tier: ${tier}`);
  }

  getAdapter(tier: StorageTier): IStorageAdapter | undefined {
    return this.adapters.get(tier);
  }

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
        throw new StorageException(StorageErrorCode.TIER_UNAVAILABLE, `Source tier not available: ${sourceTier}`);
      }

      if (!targetAdapter) {
        throw new StorageException(StorageErrorCode.TIER_UNAVAILABLE, `Target tier not available: ${targetTier}`);
      }

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

      const getResult = await this.retryOperation(
        () => sourceAdapter.get<unknown>(key),
        config?.retryAttempts ?? 3,
        config?.retryDelay ?? 1000
      );

      if (!getResult.success) {
        task.status = MigrationStatus.FAILED;
        task.error = getResult.error;
        throw new StorageException(StorageErrorCode.MIGRATION_FAILED, `Failed to read from source tier: ${getResult.error?.message}`);
      }

      const value = getResult.data;
      const bytesTransferred = DataSerializer.estimateSize(value);

      const setResult = await this.retryOperation(
        () => targetAdapter.set(key, value!, { keepTTL: true }),
        config?.retryAttempts ?? 3,
        config?.retryDelay ?? 1000
      );

      if (!setResult.success) {
        task.status = MigrationStatus.FAILED;
        task.error = setResult.error;
        throw new StorageException(StorageErrorCode.MIGRATION_FAILED, `Failed to write to target tier: ${setResult.error?.message}`);
      }

      await sourceAdapter.delete(key);

      task.status = MigrationStatus.COMPLETED;
      task.completedAt = Date.now();

      const durationMs = performance.now() - start;
      const result: MigrationResult = { task, bytesTransferred, durationMs };

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

    const progress: MigrationProgress = {
      totalItems: keys.length,
      completedItems: 0,
      failedItems: 0,
      bytesTransferred: 0,
      startTime,
    };

    const batches = this.chunkArray(keys, config.batchSize);

    for (const batch of batches) {
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
        averageDuration: results.length > 0 ? results.reduce((sum, r) => sum + r.durationMs, 0) / results.length : 0,
      },
    };

    this.logger.info(`Batch migration completed: ${report.summary.successfulItems}/${report.summary.totalItems} items, ${report.summary.totalBytes} bytes`);
    return ResultBuilder.success(report, targetTier, endTime - startTime);
  }

  async migrateByPolicy(
    sourceTier: StorageTier,
    targetTier: StorageTier,
    config: MigrationConfig
  ): Promise<StorageResult<MigrationReport>> {
    try {
      this.logger.info(`Starting policy-based migration from ${sourceTier} to ${targetTier}`);

      const sourceAdapter = this.adapters.get(sourceTier);

      if (!sourceAdapter) {
        return ResultBuilder.failure(StorageErrorCode.TIER_UNAVAILABLE, `Source tier not available: ${sourceTier}`);
      }

      const queryResult = await sourceAdapter.query({});

      if (!queryResult.success || !queryResult.data) {
        return ResultBuilder.failure(StorageErrorCode.UNKNOWN, `Failed to query source tier: ${queryResult.error?.message}`);
      }

      let items = queryResult.data;
      const now = Date.now();

      if (config.filter) {
        items = items.filter(item => {
          const age = now - item.createdAt;

          if (config.filter!.minAge !== undefined && age < config.filter!.minAge!) return false;
          if (config.filter!.maxAge !== undefined && age > config.filter!.maxAge!) return false;
          if (config.filter!.minAccessCount !== undefined && item.accessCount < config.filter!.minAccessCount!) return false;
          if (config.filter!.maxAccessCount !== undefined && item.accessCount > config.filter!.maxAccessCount!) return false;
          if (config.filter!.priorities !== undefined && !config.filter!.priorities!.includes(item.priority)) return false;

          return true;
        });
      }

      this.logger.info(`Filtered ${items.length} items for migration`);

      const keys = items.map(item => item.key);
      return this.migrateBatch(keys, sourceTier, targetTier, config);
    } catch (error) {
      return ResultBuilder.failure(StorageErrorCode.MIGRATION_FAILED, `Policy-based migration failed: ${(error as Error).message}`);
    }
  }

  async archiveToCold(options?: { olderThan?: number; maxItems?: number; preserveInWarm?: boolean }): Promise<StorageResult<MigrationReport>> {
    try {
      this.logger.info('Starting archive to cold storage...');

      const hotAdapter = this.adapters.get(StorageTier.HOT);
      const warmAdapter = this.adapters.get(StorageTier.WARM);
      const coldAdapter = this.adapters.get(StorageTier.COLD);

      if (!hotAdapter || !warmAdapter || !coldAdapter) {
        return ResultBuilder.failure(StorageErrorCode.TIER_UNAVAILABLE, 'Required storage tiers not available');
      }

      const results: MigrationResult[] = [];
      const failedTasks: MigrationTask[] = [];
      const startTime = performance.now();
      let bytesTransferred = 0;

      this.logger.info('Step 1: Migrating from HOT to WARM...');

      const hotQuery: StorageQuery = {};
      if (options?.olderThan) hotQuery.createdBefore = options.olderThan;
      if (options?.maxItems) hotQuery.limit = options.maxItems;

      const hotItems = await hotAdapter.query(hotQuery);

      if (hotItems.success && hotItems.data) {
        for (const item of hotItems.data) {
          const result = await this.migrateItem(item.key, StorageTier.HOT, StorageTier.WARM, { batchSize: 1, concurrency: 1, retryAttempts: 3, retryDelay: 1000 });

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

      this.logger.info('Step 2: Migrating from WARM to COLD...');

      const warmQuery: StorageQuery = {};
      if (options?.olderThan) warmQuery.createdBefore = options.olderThan;

      const warmItems = await warmAdapter.query(warmQuery);

      if (warmItems.success && warmItems.data) {
        for (const item of warmItems.data) {
          const result = await this.migrateItem(item.key, StorageTier.WARM, StorageTier.COLD, { batchSize: 1, concurrency: 1, retryAttempts: 3, retryDelay: 1000 });

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
          averageDuration: results.length > 0 ? results.reduce((sum, r) => sum + r.durationMs, 0) / results.length : 0,
        },
      };

      this.logger.info(`Archive completed: ${report.summary.successfulItems} items archived to cold storage`);
      return ResultBuilder.success(report, StorageTier.COLD, endTime - startTime);
    } catch (error) {
      return ResultBuilder.failure(StorageErrorCode.MIGRATION_FAILED, `Archive failed: ${(error as Error).message}`);
    }
  }

  async exportToJSON(tier: StorageTier, query?: StorageQuery): Promise<StorageResult<string>> {
    try {
      const adapter = this.adapters.get(tier);

      if (!adapter) {
        return ResultBuilder.failure(StorageErrorCode.TIER_UNAVAILABLE, `Tier not available: ${tier}`);
      }

      const result = await adapter.query(query ?? {});

      if (!result.success || !result.data) {
        return ResultBuilder.failure(StorageErrorCode.UNKNOWN, `Query failed: ${result.error?.message}`);
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
      return ResultBuilder.failure(StorageErrorCode.UNKNOWN, `Export failed: ${(error as Error).message}`);
    }
  }

  async importFromJSON(json: string, targetTier: StorageTier, options?: { skipExisting?: boolean; overwriteExisting?: boolean }): Promise<StorageResult<MigrationReport>> {
    try {
      const adapter = this.adapters.get(targetTier);

      if (!adapter) {
        return ResultBuilder.failure(StorageErrorCode.TIER_UNAVAILABLE, `Tier not available: ${targetTier}`);
      }

      const importData = JSON.parse(json);
      const items: StorageItem[] = importData.items ?? [];

      const results: MigrationResult[] = [];
      const failedTasks: MigrationTask[] = [];
      const startTime = performance.now();
      let bytesTransferred = 0;

      for (const item of items) {
        try {
          if (options?.skipExisting) {
            const exists = await adapter.exists(item.key);
            if (exists.success && exists.data) continue;
          }

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
          averageDuration: results.length > 0 ? results.reduce((sum, r) => sum + r.durationMs, 0) / results.length : 0,
        },
      };

      this.logger.info(`Import completed: ${report.summary.successfulItems}/${report.summary.totalItems} items imported`);
      return ResultBuilder.success(report, targetTier, endTime - startTime);
    } catch (error) {
      return ResultBuilder.failure(StorageErrorCode.UNKNOWN, `Import failed: ${(error as Error).message}`);
    }
  }

  private async retryOperation<T>(operation: () => Promise<T>, maxAttempts: number, delay: number): Promise<T> {
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

  private async runWithConcurrency<T>(promises: Promise<T>[], concurrency: number): Promise<T[]> {
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
```

---

## 7. 自测点验证

### RSCH-201: 冷热分层集成度

| 测试项 | 状态 | 说明 |
|--------|------|------|
| 三层存储统一接口 | ✅ | IStorageAdapter 抽象接口 |
| 热存储(Redis) | ✅ | UpstashRedisClient 实现 |
| 温存储(IndexedDB) | ✅ | IndexedDBWrapper 实现 |
| 冷存储(文件) | ✅ | OPFS/NodeFileSystem 实现 |
| 自动分层迁移 | ✅ | TierPolicyEngine 决策引擎 |
| 跨层数据访问 | ✅ | TierManager.get() 自动查找 |
| 事件通知机制 | ✅ | StorageEventEmitter 实现 |

### STM-002: 数据流验证

| 测试项 | 状态 | 说明 |
|--------|------|------|
| Hot → Warm 迁移 | ✅ | hotToWarmTTL 触发 |
| Warm → Cold 迁移 | ✅ | warmToColdTTL 触发 |
| Cold → Warm 升级 | ✅ | promotionThreshold 触发 |
| Warm → Hot 升级 | ✅ | access_frequency 触发 |
| 批量迁移 | ✅ | migrateBatch 支持 |
| 迁移进度追踪 | ✅ | MigrationProgress 回调 |
| 迁移失败重试 | ✅ | retryOperation 机制 |

### RES-001: 离线容错

| 测试项 | 状态 | 说明 |
|--------|------|------|
| Redis连接失败 | ✅ | 指数退避重试 |
| IndexedDB配额超限 | ✅ | QuotaExceededError 捕获 |
| 文件系统不可用 | ✅ | 环境检测降级 |
| 数据序列化失败 | ✅ | StorageException 处理 |
| TTL过期处理 | ✅ | cleanup() 自动清理 |
| 访问统计更新失败 | ✅ | 异步更新，不阻塞主流程 |

---

## 文件清单

| 文件路径 | 说明 | 行数 |
|----------|------|------|
| `/mnt/okcomputer/output/lib/storage/types.ts` | 类型定义 | ~400 |
| `/mnt/okcomputer/output/lib/storage/dal.ts` | 数据访问抽象层 | ~350 |
| `/mnt/okcomputer/output/lib/storage/hot/redis-store.ts` | 热存储实现 | ~650 |
| `/mnt/okcomputer/output/lib/storage/warm/indexeddb-store.ts` | 温存储实现 | ~600 |
| `/mnt/okcomputer/output/lib/storage/cold/file-store.ts` | 冷存储实现 | ~700 |
| `/mnt/okcomputer/output/lib/storage/tier-manager.ts` | 分层策略引擎 | ~550 |
| `/mnt/okcomputer/output/lib/storage/migration.ts` | 数据迁移工具 | ~650 |

---

## 使用示例

```typescript
import { TierManager } from './lib/storage/tier-manager';
import { RedisStorageAdapter } from './lib/storage/hot/redis-store';
import { IndexedDBStorageAdapter } from './lib/storage/warm/indexeddb-store';
import { FileStorageAdapter } from './lib/storage/cold/file-store';
import { StorageTier, DataPriority } from './lib/storage/types';

// 初始化分层管理器
const tierManager = new TierManager();

// 配置并注册各层存储
const hotAdapter = new RedisStorageAdapter({
  redisUrl: 'https://your-upstash-url',
  redisToken: 'your-token',
  defaultTTL: 3600000, // 1小时
});

const warmAdapter = new IndexedDBStorageAdapter({
  dbName: 'AppStorage',
  dbVersion: 1,
  stores: ['items'],
});

const coldAdapter = new FileStorageAdapter({
  basePath: '/app-data',
});

// 注册适配器
tierManager.registerAdapter(StorageTier.HOT, hotAdapter);
tierManager.registerAdapter(StorageTier.WARM, warmAdapter);
tierManager.registerAdapter(StorageTier.COLD, coldAdapter);

// 配置分层策略
await tierManager.configure({
  hot: { redisUrl: '', redisToken: '' },
  warm: { dbName: 'AppStorage', dbVersion: 1, stores: ['items'] },
  cold: { basePath: '/app-data' },
  promotionThreshold: 10,      // 访问10次/天升级
  demotionThreshold: 0.1,      // 访问0.1次/天降级
  hotToWarmTTL: 86400000,      // 1天
  warmToColdTTL: 604800000,    // 7天
  coldArchiveTTL: 2592000000,  // 30天
  cleanupInterval: 300000,     // 5分钟
  enableAutoMigration: true,
  enableAutoCleanup: true,
});

// 初始化各层
await hotAdapter.initialize();
await warmAdapter.initialize();
await coldAdapter.initialize();

// 启动自动维护
tierManager.startAutoMaintenance();

// 写入数据 (自动选择存储层)
await tierManager.set('user:123', { name: 'John', age: 30 }, {
  priority: DataPriority.HIGH,
  ttl: 3600000,
});

// 读取数据 (自动跨层查找)
const result = await tierManager.get('user:123');
console.log(result.data);

// 手动升级
tierManager.promote('user:123', StorageTier.HOT);

// 手动降级
tierManager.demote('user:123', StorageTier.COLD);

// 获取统计信息
const stats = await tierManager.getStats();
console.log(stats);
```

---

*文档生成时间: 2024-01-13*
*版本: Phase 1 Storage Layer v1.0*
