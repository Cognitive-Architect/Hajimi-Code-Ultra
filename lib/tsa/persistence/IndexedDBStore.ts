/**
 * B-05/09: TSA 三层降级韧性 - IndexedDB 存储层
 * 浏览器本地持久化存储，作为 Redis 的降级层
 * 
 * 功能特性：
 * - 基于浏览器原生 IndexedDB API
 * - 支持 TTL 管理（定期清理过期数据）
 * - 实现 StorageAdapter 接口，兼容 TSA 架构
 * 
 * 技术债务清偿：DEBT-004 TSA虚假持久化
 */

// ==================== 类型定义 ====================

export interface StorageAdapter {
  readonly name: string;
  readonly isAvailable: boolean;
  readonly isConnected: boolean;

  // 生命周期
  initialize(): Promise<boolean>;
  close(): Promise<void>;
  healthCheck(): Promise<boolean>;

  // 基本 CRUD
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: SetOptions): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;

  // 批量操作
  mget<T>(keys: string[]): Promise<Map<string, T>>;
  mset<T>(entries: Array<{ key: string; value: T }>, options?: SetOptions): Promise<void>;
  mdelete(keys: string[]): Promise<void>;

  // 查询和清理
  keys(pattern?: string): Promise<string[]>;
  clear(): Promise<void>;
  cleanup(): Promise<number>; // 返回清理的过期条目数
}

export interface SetOptions {
  ttl?: number;              // 过期时间(毫秒)
  priority?: DataPriority;
  metadata?: Record<string, unknown>;
}

export enum DataPriority {
  CRITICAL = 0,
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3,
}

// ==================== IndexedDB 存储数据结构 ====================

interface IndexedDBStoredItem {
  key: string;
  value: unknown;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;        // TTL 过期时间
  accessCount: number;
  lastAccessedAt: number;
  priority: DataPriority;
  size: number;
  metadata?: Record<string, unknown>;
}

// ==================== 日志记录器 ====================

interface ILogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

class ConsoleLogger implements ILogger {
  constructor(private prefix: string = '[IndexedDBStore]') {}

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

// ==================== 数据序列化工具 ====================

class DataSerializer {
  /**
   * 估算数据大小（字节）
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

// ==================== IndexedDB 存储实现 ====================

export interface IndexedDBStoreConfig {
  dbName?: string;
  storeName?: string;
  dbVersion?: number;
  enableCleanup?: boolean;
  cleanupIntervalMs?: number;
  logger?: ILogger;
}

export class IndexedDBStore implements StorageAdapter {
  readonly name = 'IndexedDBStore';
  
  private db: IDBDatabase | null = null;
  private config: Required<IndexedDBStoreConfig>;
  private logger: ILogger;
  private _isConnected: boolean = false;
  private cleanupTimer: number | null = null;

  constructor(config: IndexedDBStoreConfig = {}) {
    this.config = {
      dbName: config.dbName ?? 'hajimi-tsa',
      storeName: config.storeName ?? 'storage',
      dbVersion: config.dbVersion ?? 1,
      enableCleanup: config.enableCleanup ?? true,
      cleanupIntervalMs: config.cleanupIntervalMs ?? 60000, // 默认1分钟
      logger: config.logger ?? (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production' 
        ? new NoOpLogger() 
        : new ConsoleLogger()),
    };
    this.logger = this.config.logger;
  }

  // ==================== 属性访问器 ====================

  get isAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  // ==================== 生命周期方法 ====================

  async initialize(): Promise<boolean> {
    try {
      this.logger.info('Initializing IndexedDB store...');

      if (!this.isAvailable) {
        this.logger.error('IndexedDB is not supported in this environment');
        return false;
      }

      this.db = await this.openDatabase();
      this._isConnected = true;

      // 启动定期清理任务
      if (this.config.enableCleanup) {
        this.startCleanupTask();
      }

      this.logger.info(`IndexedDB store initialized: ${this.config.dbName}/${this.config.storeName}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize IndexedDB store:', error);
      this._isConnected = false;
      return false;
    }
  }

  async close(): Promise<void> {
    this.logger.info('Closing IndexedDB store...');

    // 停止清理任务
    this.stopCleanupTask();

    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this._isConnected = false;
    this.logger.info('IndexedDB store closed');
  }

  async healthCheck(): Promise<boolean> {
    if (!this._isConnected || !this.db) {
      return false;
    }

    try {
      // 尝试执行一个简单的操作来验证健康状态
      const transaction = this.db.transaction([this.config.storeName], 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.count();
      
      await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      return true;
    } catch (error) {
      this.logger.warn('Health check failed:', error);
      return false;
    }
  }

  // ==================== CRUD 操作 ====================

  async get<T>(key: string): Promise<T | null> {
    this.checkConnected();

    try {
      const item = await this.getItem(key);

      if (!item) {
        return null;
      }

      // 检查是否过期
      if (item.expiresAt && item.expiresAt < Date.now()) {
        // 异步删除过期项
        this.delete(key).catch(err => {
          this.logger.warn('Failed to delete expired item:', err);
        });
        return null;
      }

      // 更新访问统计
      item.accessCount += 1;
      item.lastAccessedAt = Date.now();
      
      // 异步更新访问计数
      this.putItem(item).catch(() => {});

      return item.value as T;
    } catch (error) {
      this.logger.error(`Get failed for key "${key}":`, error);
      throw error;
    }
  }

  async set<T>(key: string, value: T, options?: SetOptions): Promise<void> {
    this.checkConnected();

    try {
      const now = Date.now();
      const size = DataSerializer.estimateSize(value);

      const item: IndexedDBStoredItem = {
        key,
        value,
        createdAt: now,
        updatedAt: now,
        expiresAt: options?.ttl ? now + options.ttl : undefined,
        accessCount: 0,
        lastAccessedAt: now,
        priority: options?.priority ?? DataPriority.MEDIUM,
        size,
        metadata: options?.metadata,
      };

      await this.putItem(item);
    } catch (error) {
      this.logger.error(`Set failed for key "${key}":`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    this.checkConnected();

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction([this.config.storeName], 'readwrite');
        const store = transaction.objectStore(this.config.storeName);
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      this.logger.error(`Delete failed for key "${key}":`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    this.checkConnected();

    try {
      const item = await this.getItem(key);
      
      if (!item) {
        return false;
      }

      // 检查是否过期
      if (item.expiresAt && item.expiresAt < Date.now()) {
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Exists check failed for key "${key}":`, error);
      throw error;
    }
  }

  // ==================== 批量操作 ====================

  async mget<T>(keys: string[]): Promise<Map<string, T>> {
    this.checkConnected();

    const result = new Map<string, T>();
    const now = Date.now();

    for (const key of keys) {
      try {
        const item = await this.getItem(key);

        if (item && (!item.expiresAt || item.expiresAt >= now)) {
          result.set(key, item.value as T);

          // 更新访问统计
          item.accessCount += 1;
          item.lastAccessedAt = now;
          this.putItem(item).catch(() => {});
        }
      } catch (error) {
        this.logger.warn(`Mget failed for key "${key}":`, error);
      }
    }

    return result;
  }

  async mset<T>(entries: Array<{ key: string; value: T }>, options?: SetOptions): Promise<void> {
    this.checkConnected();

    const now = Date.now();

    for (const { key, value } of entries) {
      try {
        const size = DataSerializer.estimateSize(value);
        const item: IndexedDBStoredItem = {
          key,
          value,
          createdAt: now,
          updatedAt: now,
          expiresAt: options?.ttl ? now + options.ttl : undefined,
          accessCount: 0,
          lastAccessedAt: now,
          priority: options?.priority ?? DataPriority.MEDIUM,
          size,
          metadata: options?.metadata,
        };

        await this.putItem(item);
      } catch (error) {
        this.logger.warn(`Mset failed for key "${key}":`, error);
      }
    }
  }

  async mdelete(keys: string[]): Promise<void> {
    this.checkConnected();

    for (const key of keys) {
      try {
        await this.delete(key);
      } catch (error) {
        this.logger.warn(`Mdelete failed for key "${key}":`, error);
      }
    }
  }

  // ==================== 查询和清理 ====================

  async keys(pattern?: string): Promise<string[]> {
    this.checkConnected();

    try {
      const allKeys = await new Promise<string[]>((resolve, reject) => {
        const transaction = this.db!.transaction([this.config.storeName], 'readonly');
        const store = transaction.objectStore(this.config.storeName);
        const request = store.getAllKeys();

        request.onsuccess = () => resolve(request.result as string[]);
        request.onerror = () => reject(request.error);
      });

      if (!pattern || pattern === '*') {
        return allKeys;
      }

      // 简单的通配符匹配
      const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
      return allKeys.filter(key => regex.test(key));
    } catch (error) {
      this.logger.error('Keys query failed:', error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    this.checkConnected();

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction([this.config.storeName], 'readwrite');
        const store = transaction.objectStore(this.config.storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      this.logger.info('Store cleared');
    } catch (error) {
      this.logger.error('Clear failed:', error);
      throw error;
    }
  }

  async cleanup(): Promise<number> {
    this.checkConnected();

    const now = Date.now();
    let cleanedCount = 0;

    try {
      const items = await new Promise<IndexedDBStoredItem[]>((resolve, reject) => {
        const transaction = this.db!.transaction([this.config.storeName], 'readonly');
        const store = transaction.objectStore(this.config.storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      for (const item of items) {
        if (item.expiresAt && item.expiresAt < now) {
          try {
            await this.delete(item.key);
            cleanedCount++;
          } catch (error) {
            this.logger.warn(`Failed to clean up expired item "${item.key}":`, error);
          }
        }
      }

      if (cleanedCount > 0) {
        this.logger.info(`Cleaned up ${cleanedCount} expired items`);
      }

      return cleanedCount;
    } catch (error) {
      this.logger.error('Cleanup failed:', error);
      throw error;
    }
  }

  // ==================== 内部辅助方法 ====================

  private async openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.dbName, this.config.dbVersion);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建对象存储（如果不存在）
        if (!db.objectStoreNames.contains(this.config.storeName)) {
          const store = db.createObjectStore(this.config.storeName, { keyPath: 'key' });
          
          // 创建索引以便高效查询
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
          store.createIndex('priority', 'priority', { unique: false });
          
          this.logger.info(`Created object store: ${this.config.storeName}`);
        }
      };
    });
  }

  private async getItem(key: string): Promise<IndexedDBStoredItem | undefined> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.config.storeName], 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async putItem(item: IndexedDBStoredItem): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.config.storeName], 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.put(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private checkConnected(): void {
    if (!this._isConnected || !this.db) {
      throw new Error('IndexedDB store is not connected');
    }
  }

  private startCleanupTask(): void {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = window.setInterval(() => {
      this.cleanup().catch(error => {
        this.logger.warn('Scheduled cleanup failed:', error);
      });
    }, this.config.cleanupIntervalMs);

    this.logger.debug(`Cleanup task started (interval: ${this.config.cleanupIntervalMs}ms)`);
  }

  private stopCleanupTask(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      this.logger.debug('Cleanup task stopped');
    }
  }
}

// ==================== 导出 ====================
// DataPriority 已在第48行 export enum 定义并导出，此处移除重复导出
export type { ILogger, IndexedDBStoredItem };
