/**
 * Phase 1 冷热分层存储 - 数据访问抽象层 (DAL)
 * Data Access Layer - 统一存储接口抽象
 */

import {
  StorageTier,
  StorageItem,
  StorageQuery,
  StorageResult,
  StorageError,
  StorageErrorCode,
  StorageStats,
  StorageEvent,
  StorageEventType,
  StorageEventHandler,
  IStorageAdapter,
  SetOptions,
  SerializedData,
  DataPriority,
} from './types';

// ==================== 序列化工具 ====================

export class DataSerializer {
  /**
   * 序列化数据
   */
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

  /**
   * 反序列化数据
   */
  static deserialize<T>(serialized: SerializedData): T {
    try {
      if (serialized.type === 'json') {
        const data = serialized.data as string;
        // 验证校验和
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

  /**
   * 计算简单校验和
   */
  private static computeChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * 估算数据大小
   */
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

  constructor(
    code: StorageErrorCode,
    message: string,
    originalError?: Error,
    tier?: StorageTier
  ) {
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
    return {
      success: true,
      data,
      tier,
      latencyMs,
    };
  }

  static failure<T>(
    code: StorageErrorCode,
    message: string,
    tier?: StorageTier,
    originalError?: Error
  ): StorageResult<T> {
    return {
      success: false,
      error: {
        code,
        message,
        tier,
        originalError,
      },
      latencyMs: 0,
    };
  }

  static fromException<T>(exception: StorageException): StorageResult<T> {
    return {
      success: false,
      error: exception.toStorageError(),
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

  removeAllListeners(): void {
    this.handlers.clear();
  }
}

// ==================== 存储项构建器 ====================

export class StorageItemBuilder {
  static create<T>(
    key: string,
    value: T,
    tier: StorageTier,
    options?: SetOptions
  ): StorageItem<T> {
    const now = Date.now();
    const size = DataSerializer.estimateSize(value);

    return {
      key,
      value,
      tier,
      createdAt: now,
      updatedAt: now,
      expiresAt: options?.ttl ? now + options.ttl : undefined,
      accessCount: 0,
      lastAccessedAt: now,
      priority: options?.priority ?? DataPriority.MEDIUM,
      size,
      metadata: options?.metadata,
    };
  }

  static update<T>(
    item: StorageItem<T>,
    value: T,
    options?: SetOptions
  ): StorageItem<T> {
    const now = Date.now();
    const size = DataSerializer.estimateSize(value);

    return {
      ...item,
      value,
      updatedAt: now,
      expiresAt: options?.ttl 
        ? (options.keepTTL && item.expiresAt ? item.expiresAt : now + options.ttl)
        : item.expiresAt,
      size,
      metadata: options?.metadata ?? item.metadata,
    };
  }

  static markAccessed<T>(item: StorageItem<T>): StorageItem<T> {
    const now = Date.now();
    return {
      ...item,
      accessCount: item.accessCount + 1,
      lastAccessedAt: now,
    };
  }
}

// ==================== 查询构建器 ====================

export class QueryBuilder {
  private query: StorageQuery = {};

  withKey(key: string): this {
    this.query.key = key;
    return this;
  }

  withPattern(pattern: string): this {
    this.query.keyPattern = pattern;
    return this;
  }

  withTier(tier: StorageTier): this {
    this.query.tier = tier;
    return this;
  }

  withPriority(priority: DataPriority): this {
    this.query.priority = priority;
    return this;
  }

  createdBefore(timestamp: number): this {
    this.query.createdBefore = timestamp;
    return this;
  }

  createdAfter(timestamp: number): this {
    this.query.createdAfter = timestamp;
    return this;
  }

  expiresBefore(timestamp: number): this {
    this.query.expiresBefore = timestamp;
    return this;
  }

  withLimit(limit: number): this {
    this.query.limit = limit;
    return this;
  }

  withOffset(offset: number): this {
    this.query.offset = offset;
    return this;
  }

  build(): StorageQuery {
    return { ...this.query };
  }
}

// ==================== 存储适配器基类 ====================

export abstract class BaseStorageAdapter implements IStorageAdapter {
  abstract readonly tier: StorageTier;
  abstract readonly isAvailable: boolean;
  abstract readonly isConnected: boolean;

  protected eventEmitter: StorageEventEmitter = new StorageEventEmitter();
  protected initialized: boolean = false;

  // 抽象方法 - 子类必须实现
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

  // 事件方法
  on(event: StorageEventType, handler: StorageEventHandler): void {
    this.eventEmitter.on(event, handler);
  }

  off(event: StorageEventType, handler: StorageEventHandler): void {
    this.eventEmitter.off(event, handler);
  }

  protected emitEvent(event: StorageEvent): void {
    this.eventEmitter.emit(event);
  }

  // 辅助方法
  protected checkInitialized(): void {
    if (!this.initialized) {
      throw new StorageException(
        StorageErrorCode.UNKNOWN,
        'Storage adapter not initialized'
      );
    }
  }

  protected async measureLatency<T>(
    operation: () => Promise<StorageResult<T>>
  ): Promise<StorageResult<T>> {
    const start = performance.now();
    try {
      const result = await operation();
      result.latencyMs = performance.now() - start;
      return result;
    } catch (error) {
      return ResultBuilder.fromException(error as StorageException);
    }
  }
}

// ==================== 存储工厂 ====================

export interface StorageAdapterConstructor {
  new (config: unknown): IStorageAdapter;
}

export class StorageFactory {
  private static adapters: Map<StorageTier, StorageAdapterConstructor> = new Map();

  static register(tier: StorageTier, constructor: StorageAdapterConstructor): void {
    this.adapters.set(tier, constructor);
  }

  static create(tier: StorageTier, config: unknown): IStorageAdapter {
    const Constructor = this.adapters.get(tier);
    if (!Constructor) {
      throw new StorageException(
        StorageErrorCode.TIER_UNAVAILABLE,
        `No adapter registered for tier: ${tier}`
      );
    }
    return new Constructor(config);
  }

  static isRegistered(tier: StorageTier): boolean {
    return this.adapters.has(tier);
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

export class NoOpStorageLogger implements IStorageLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

// ==================== 导出 ====================

export {
  StorageTier,
  StorageItem,
  StorageQuery,
  StorageResult,
  StorageError,
  StorageErrorCode,
  StorageStats,
  StorageEvent,
  StorageEventType,
  StorageEventHandler,
  IStorageAdapter,
  SetOptions,
  DataPriority,
} from './types';
