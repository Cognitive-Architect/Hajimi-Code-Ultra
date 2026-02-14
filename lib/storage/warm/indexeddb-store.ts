/**
 * Phase 1 冷热分层存储 - 温存储层 (IndexedDB)
 * 基于 Dexie.js 封装实现
 */

import {
  StorageTier,
  StorageItem,
  StorageQuery,
  StorageResult,
  StorageStats,
  StorageEventType,
  WarmStorageConfig,
  SetOptions,
  DataPriority,
  StorageErrorCode,
  EvictionPolicy,
} from '../types';
import {
  BaseStorageAdapter,
  ResultBuilder,
  StorageException,
  DataSerializer,
  IStorageLogger,
  ConsoleStorageLogger,
  NoOpStorageLogger,
} from '../dal';

// ==================== IndexedDB 数据库接口 ====================

interface IDBDatabase {
  name: string;
  version: number;
  objectStoreNames: string[];
}

interface IDBObjectStore {
  get(key: string): Promise<IndexedDBStoredItem | undefined>;
  getAll(query?: IDBKeyRange, count?: number): Promise<IndexedDBStoredItem[]>;
  getAllKeys(query?: IDBKeyRange, count?: number): Promise<string[]>;
  put(item: IndexedDBStoredItem): Promise<string>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  count(): Promise<number>;
  openCursor(query?: IDBKeyRange, direction?: IDBCursorDirection): IDBRequest;
  createIndex(name: string, keyPath: string, options?: IDBIndexParameters): IDBIndex;
  index(name: string): IDBIndex;
}

interface IDBTransaction {
  objectStore(name: string): IDBObjectStore;
  done: Promise<void>;
  abort(): void;
}

interface IDBOpenDBRequest extends IDBRequest {
  onupgradeneeded: ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => void) | null;
}

// ==================== 存储数据结构 ====================

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
  private db: IDBDatabase | null = null;
  private dbName: string;
  private dbVersion: number;
  private stores: Map<string, string[]> = new Map();
  private indexes: Map<string, Map<string, string>> = new Map();
  private nativeDB: IDBDatabase | null = null;

  constructor(config: {
    dbName: string;
    dbVersion: number;
    stores: string[];
    indexes?: Record<string, string[]>;
  }) {
    this.dbName = config.dbName;
    this.dbVersion = config.dbVersion;

    // 初始化stores
    for (const storeName of config.stores) {
      this.stores.set(storeName, ['key']);
      this.indexes.set(storeName, new Map());
    }

    // 初始化indexes
    if (config.indexes) {
      for (const [storeName, indexList] of Object.entries(config.indexes)) {
        if (this.indexes.has(storeName)) {
          for (const indexName of indexList) {
            this.indexes.get(storeName)!.set(indexName, indexName);
          }
        }
      }
    }
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

        // 创建object stores
        for (const storeName of this.stores.keys()) {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'key' });

            // 创建索引
            const storeIndexes = this.indexes.get(storeName);
            if (storeIndexes) {
              for (const [indexName, keyPath] of storeIndexes.entries()) {
                store.createIndex(indexName, keyPath);
              }
            }
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

  transaction(storeNames: string[], mode: IDBTransactionMode = 'readonly'): IDBTransaction {
    if (!this.nativeDB) {
      throw new Error('Database not opened');
    }
    return this.nativeDB.transaction(storeNames, mode);
  }

  getStore(transaction: IDBTransaction, storeName: string): IDBObjectStore {
    return transaction.objectStore(storeName);
  }

  async get(storeName: string, key: string): Promise<IndexedDBStoredItem | undefined> {
    return new Promise((resolve, reject) => {
      const transaction = this.transaction([storeName], 'readonly');
      const store = this.getStore(transaction, storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async getAll(
    storeName: string,
    query?: IDBKeyRange,
    count?: number
  ): Promise<IndexedDBStoredItem[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.transaction([storeName], 'readonly');
      const store = this.getStore(transaction, storeName);
      const request = store.getAll(query, count);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async put(storeName: string, item: IndexedDBStoredItem): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.transaction([storeName], 'readwrite');
      const store = this.getStore(transaction, storeName);
      const request = store.put(item);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(transaction.error);
      };
    });
  }

  async delete(storeName: string, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.transaction([storeName], 'readwrite');
      const store = this.getStore(transaction, storeName);
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async clear(storeName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.transaction([storeName], 'readwrite');
      const store = this.getStore(transaction, storeName);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async count(storeName: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const transaction = this.transaction([storeName], 'readonly');
      const store = this.getStore(transaction, storeName);
      const request = store.count();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async keys(storeName: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.transaction([storeName], 'readonly');
      const store = this.getStore(transaction, storeName);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
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
    this.logger = logger ?? (process.env.NODE_ENV === 'production'
      ? new NoOpStorageLogger()
      : new ConsoleStorageLogger('[IndexedDBStorage]'));
  }

  // ==================== 属性访问器 ====================

  get isAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  // ==================== 生命周期方法 ====================

  async initialize(): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.logger.info('Initializing IndexedDB storage adapter...');

      // 检查浏览器支持
      if (!this.isAvailable) {
        throw new StorageException(
          StorageErrorCode.TIER_UNAVAILABLE,
          'IndexedDB is not supported in this environment'
        );
      }

      // 创建数据库封装
      this.db = new IndexedDBWrapper({
        dbName: this.config.dbName,
        dbVersion: this.config.dbVersion,
        stores: this.config.stores,
        indexes: this.config.indexes,
      });

      // 打开数据库
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
        totalSize: 0, // 需要额外计算
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

      const item = await this.db!.get(this.defaultStore, key);

      if (!item) {
        return ResultBuilder.failure(
          StorageErrorCode.NOT_FOUND,
          `Key not found: ${key}`,
          this.tier
        );
      }

      // 检查是否过期
      if (item.expiresAt && item.expiresAt < Date.now()) {
        // 异步删除过期项
        this.db!.delete(this.defaultStore, key).catch(err => {
          this.logger.warn('Failed to delete expired item:', err);
        });

        return ResultBuilder.failure(
          StorageErrorCode.NOT_FOUND,
          `Key expired: ${key}`,
          this.tier
        );
      }

      // 更新访问统计
      item.accessCount += 1;
      item.lastAccessedAt = Date.now();

      // 异步更新访问计数
      this.db!.put(this.defaultStore, item).catch(err => {
        this.logger.warn('Failed to update access stats:', err);
      });

      this.emitEvent({
        type: 'item:accessed',
        timestamp: Date.now(),
        key,
        tier: this.tier,
      });

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

  async set<T>(
    key: string,
    value: T,
    options?: SetOptions
  ): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const now = Date.now();
      const size = DataSerializer.estimateSize(value);

      // 检查条件
      if (options?.ifNotExists || options?.ifExists) {
        const existing = await this.db!.get(this.defaultStore, key);

        if (options.ifNotExists && existing) {
          return ResultBuilder.failure(
            StorageErrorCode.ALREADY_EXISTS,
            `Key already exists: ${key}`,
            this.tier
          );
        }

        if (options.ifExists && !existing) {
          return ResultBuilder.failure(
            StorageErrorCode.NOT_FOUND,
            `Key not found: ${key}`,
            this.tier
          );
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

      this.emitEvent({
        type: 'item:created',
        timestamp: now,
        key,
        tier: this.tier,
      });

      return ResultBuilder.success(undefined, this.tier, performance.now() - start);
    } catch (error) {
      // 检查是否是配额超限
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

      // 先检查是否存在
      const existing = await this.db!.get(this.defaultStore, key);

      if (!existing) {
        return ResultBuilder.failure(
          StorageErrorCode.NOT_FOUND,
          `Key not found: ${key}`,
          this.tier
        );
      }

      await this.db!.delete(this.defaultStore, key);

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

      const item = await this.db!.get(this.defaultStore, key);

      // 检查是否过期
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

  // ==================== 批量操作 ====================

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

          // 更新访问统计
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

  async mset<T>(
    entries: Array<{ key: string; value: T }>,
    options?: SetOptions
  ): Promise<StorageResult<void>> {
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

  // ==================== 查询操作 ====================

  async keys(pattern?: string): Promise<StorageResult<string[]>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const allKeys = await this.db!.keys(this.defaultStore);

      let filteredKeys = allKeys;

      // 简单的pattern匹配
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

      // 过滤过期项
      items = items.filter(item => !item.expiresAt || item.expiresAt >= now);

      // 应用过滤器
      if (query.key) {
        items = items.filter(item => item.key === query.key);
      }

      if (query.keyPattern) {
        const regex = new RegExp(query.keyPattern.replace(/\*/g, '.*'));
        items = items.filter(item => regex.test(item.key));
      }

      if (query.priority !== undefined) {
        items = items.filter(item => item.priority === query.priority);
      }

      if (query.createdBefore) {
        items = items.filter(item => item.createdAt < query.createdBefore!);
      }

      if (query.createdAfter) {
        items = items.filter(item => item.createdAt > query.createdAfter!);
      }

      if (query.expiresBefore) {
        items = items.filter(item => item.expiresAt && item.expiresAt < query.expiresBefore!);
      }

      // 应用limit和offset
      const offset = query.offset ?? 0;
      const limit = query.limit ?? items.length;
      items = items.slice(offset, offset + limit);

      // 转换为StorageItem
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

  // ==================== 统计和清理 ====================

  async stats(): Promise<StorageResult<StorageStats>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const items = await this.db!.getAll(this.defaultStore);
      const now = Date.now();

      // 计算有效项
      const validItems = items.filter(item => !item.expiresAt || item.expiresAt >= now);
      const totalSize = validItems.reduce((sum, item) => sum + item.size, 0);

      const stats: StorageStats = {
        tier: this.tier,
        itemCount: validItems.length,
        totalSize,
        oldestItem: validItems.length > 0 
          ? Math.min(...validItems.map(i => i.createdAt)) 
          : undefined,
        newestItem: validItems.length > 0 
          ? Math.max(...validItems.map(i => i.createdAt)) 
          : undefined,
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

// ==================== 导出 ====================

export { StorageTier, WarmStorageConfig, SetOptions } from '../types';
