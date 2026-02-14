/**
 * Phase 1 冷热分层存储 - 热存储层 (Redis)
 * 基于 Upstash Redis / AWS ElastiCache 实现
 */

import {
  StorageTier,
  StorageItem,
  StorageQuery,
  StorageResult,
  StorageStats,
  StorageEventType,
  HotStorageConfig,
  SetOptions,
  DataPriority,
  StorageErrorCode,
} from '../types';
import {
  BaseStorageAdapter,
  ResultBuilder,
  StorageException,
  DataSerializer,
  StorageItemBuilder,
  IStorageLogger,
  ConsoleStorageLogger,
  NoOpStorageLogger,
} from '../dal';

// ==================== Redis 客户端接口 ====================

interface IRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: RedisSetOptions): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  mset(entries: Record<string, string>): Promise<string>;
  keys(pattern: string): Promise<string[]>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  ping(): Promise<string>;
  info(): Promise<string>;
  dbsize(): Promise<number>;
}

interface RedisSetOptions {
  ex?: number;       // 秒级过期
  px?: number;       // 毫秒级过期
  nx?: boolean;      // 仅当key不存在时设置
  xx?: boolean;      // 仅当key存在时设置
  keepttl?: boolean; // 保持原有TTL
}

// ==================== Upstash Redis 客户端 ====================

export class UpstashRedisClient implements IRedisClient {
  private baseUrl: string;
  private token: string;
  private retryAttempts: number;
  private retryDelay: number;

  constructor(config: {
    url: string;
    token: string;
    retryAttempts?: number;
    retryDelay?: number;
  }) {
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

  async set(
    key: string,
    value: string,
    options?: RedisSetOptions
  ): Promise<string | null> {
    const args: (string | number | boolean | undefined)[] = ['SET', key, value];

    if (options?.nx) args.push('NX');
    if (options?.xx) args.push('XX');
    if (options?.keepttl) args.push('KEEPTTL');
    if (options?.ex) {
      args.push('EX', options.ex);
    } else if (options?.px) {
      args.push('PX', options.px);
    }

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
  v: unknown;           // value
  ca: number;           // createdAt
  ua: number;           // updatedAt
  ac: number;           // accessCount
  la: number;           // lastAccessedAt
  pr: number;           // priority
  md?: Record<string, unknown>; // metadata
}

export class RedisStorageAdapter extends BaseStorageAdapter {
  readonly tier = StorageTier.HOT;

  private client: IRedisClient | null = null;
  private config: HotStorageConfig;
  private logger: IStorageLogger;
  private connectionTimeout: number;
  private _isConnected: boolean = false;

  constructor(config: HotStorageConfig, logger?: IStorageLogger) {
    super();
    this.config = config;
    this.logger = logger ?? (process.env.NODE_ENV === 'production' 
      ? new NoOpStorageLogger() 
      : new ConsoleStorageLogger('[RedisStorage]'));
    this.connectionTimeout = config.connectionTimeout ?? 5000;
  }

  // ==================== 属性访问器 ====================

  get isAvailable(): boolean {
    return this.client !== null && this._isConnected;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  // ==================== 生命周期方法 ====================

  async initialize(): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.logger.info('Initializing Redis storage adapter...');

      // 创建Redis客户端
      this.client = new UpstashRedisClient({
        url: this.config.redisUrl,
        token: this.config.redisToken ?? '',
        retryAttempts: this.config.retryAttempts,
        retryDelay: this.config.retryDelay,
      });

      // 测试连接
      const pingResult = await this.withTimeout(
        this.client.ping(),
        this.connectionTimeout
      );

      if (pingResult !== 'PONG') {
        throw new StorageException(
          StorageErrorCode.CONNECTION_FAILED,
          'Redis ping failed'
        );
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

    try {
      this.logger.info('Closing Redis storage adapter...');

      this._isConnected = false;
      this.initialized = false;
      this.client = null;

      this.logger.info('Redis storage adapter closed');

      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      this.logger.error('Error closing Redis storage:', error);
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Error closing Redis: ${(error as Error).message}`,
        this.tier,
        error as Error
      );
    }
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
        throw new StorageException(
          StorageErrorCode.CONNECTION_LOST,
          'Redis health check failed'
        );
      }

      const stats: StorageStats = {
        tier: this.tier,
        itemCount: dbSize,
        totalSize: 0, // Redis不直接提供总大小
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

  // ==================== CRUD 操作 ====================

  async get<T>(key: string): Promise<StorageResult<T>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const data = await this.client!.get(key);

      if (data === null) {
        return ResultBuilder.failure(
          StorageErrorCode.NOT_FOUND,
          `Key not found: ${key}`,
          this.tier
        );
      }

      const stored: RedisStoredItem = JSON.parse(data);

      // 更新访问统计
      stored.ac += 1;
      stored.la = Date.now();

      // 异步更新访问计数
      this.client!.set(key, JSON.stringify(stored), { keepttl: true }).catch(err => {
        this.logger.warn('Failed to update access stats:', err);
      });

      this.emitEvent({
        type: 'item:accessed',
        timestamp: Date.now(),
        key,
        tier: this.tier,
      });

      return ResultBuilder.success(stored.v as T, this.tier, performance.now() - start);
    } catch (error) {
      if ((error as StorageException).code === StorageErrorCode.NOT_FOUND) {
        throw error;
      }
      return ResultBuilder.failure(
        StorageErrorCode.UNKNOWN,
        `Get failed: ${(error as Error).message}`,
        this.tier,
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

      const redisOptions: RedisSetOptions = {
        nx: options?.ifNotExists,
        xx: options?.ifExists,
        keepttl: options?.keepTTL,
      };

      // 设置TTL
      if (options?.ttl) {
        redisOptions.px = options.ttl;
      } else if (this.config.defaultTTL) {
        redisOptions.px = this.config.defaultTTL;
      }

      const result = await this.client!.set(key, serialized, redisOptions);

      if (result === null && (options?.ifNotExists || options?.ifExists)) {
        return ResultBuilder.failure(
          options.ifNotExists 
            ? StorageErrorCode.ALREADY_EXISTS 
            : StorageErrorCode.NOT_FOUND,
          `Set condition not met for key: ${key}`,
          this.tier
        );
      }

      this.emitEvent({
        type: 'item:created',
        timestamp: now,
        key,
        tier: this.tier,
      });

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
        return ResultBuilder.failure(
          StorageErrorCode.NOT_FOUND,
          `Key not found: ${key}`,
          this.tier
        );
      }

      this.emitEvent({
        type: 'item:deleted',
        timestamp: Date.now(),
        key,
        tier: this.tier,
      });

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

  // ==================== 批量操作 ====================

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

  async mset<T>(
    entries: Array<{ key: string; value: T }>,
    options?: SetOptions
  ): Promise<StorageResult<void>> {
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

      // 设置TTL (MSET不支持TTL，需要单独设置)
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

  // ==================== 查询操作 ====================

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

      // Redis不支持复杂查询，只能基于key pattern过滤
      let keys: string[] = [];

      if (query.key) {
        const exists = await this.client!.exists(query.key);
        if (exists) {
          keys = [query.key];
        }
      } else if (query.keyPattern) {
        keys = await this.client!.keys(query.keyPattern);
      } else {
        keys = await this.client!.keys('*');
      }

      // 应用limit和offset
      const offset = query.offset ?? 0;
      const limit = query.limit ?? keys.length;
      keys = keys.slice(offset, offset + limit);

      // 获取数据
      const items: StorageItem[] = [];

      for (const key of keys) {
        const data = await this.client!.get(key);
        if (data) {
          const stored: RedisStoredItem = JSON.parse(data);

          // 应用过滤器
          if (query.priority !== undefined && stored.pr !== query.priority) {
            continue;
          }

          if (query.createdBefore && stored.ca >= query.createdBefore) {
            continue;
          }

          if (query.createdAfter && stored.ca <= query.createdAfter) {
            continue;
          }

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

  // ==================== 统计和清理 ====================

  async stats(): Promise<StorageResult<StorageStats>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const [dbSize, info] = await Promise.all([
        this.client!.dbsize(),
        this.client!.info(),
      ]);

      // 解析info获取更多信息
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

      // 使用SCAN + DEL 批量删除
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
    // Redis自动处理过期key，这里返回0
    return ResultBuilder.success(0, this.tier, 0);
  }

  // ==================== 辅助方法 ====================

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      ),
    ]);
  }

  private parseUsedMemory(info: string): number {
    const match = info.match(/used_memory:(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }
}

// ==================== 导出 ====================

export { StorageTier, HotStorageConfig, SetOptions } from '../types';
