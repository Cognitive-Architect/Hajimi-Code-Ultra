/**
 * B-04/09: TSA IndexedDB 存储层 v2
 * 咕咕嘎嘎·IndexedDB矿工 - 修复异步竞态条件
 * 
 * 修复内容：
 * - 使用操作队列消除竞态条件
 * - localStorage 双保险备份
 * - 存储配额超限处理 + LRU 淘汰
 * - IndexedDB schema 版本迁移
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
  cleanup(): Promise<number>;
}

export interface SetOptions {
  ttl?: number;              // 过期时间(毫秒)
  priority?: DataPriority;
  metadata?: Record<string, unknown>;
  backupToLocalStorage?: boolean;  // 是否备份到 localStorage
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
  version?: number;          // 数据版本号
}

// ==================== Schema 版本管理 ====================

interface SchemaVersion {
  version: number;
  description: string;
  migrate?: (db: IDBDatabase, transaction: IDBTransaction) => Promise<void>;
}

const SCHEMA_VERSIONS: SchemaVersion[] = [
  {
    version: 1,
    description: '初始版本：基本存储结构',
  },
  {
    version: 2,
    description: 'v2版本：添加数据版本号和LRU索引',
  },
];

const CURRENT_SCHEMA_VERSION = 2;

// ==================== 日志记录器 ====================

interface ILogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

class ConsoleLogger implements ILogger {
  constructor(private prefix: string = '[IndexedDBStore-v2]') {}

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

  /**
   * 序列化为字符串
   */
  static serialize<T>(value: T): string {
    return JSON.stringify(value);
  }

  /**
   * 反序列化
   */
  static deserialize<T>(data: string): T {
    return JSON.parse(data) as T;
  }
}

// ==================== 操作队列（解决竞态条件）====================

type QueueOperation<T> = () => Promise<T>;

interface QueuedTask<T> {
  operation: QueueOperation<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/**
 * 单线程操作队列 - 确保 IndexedDB 操作按顺序执行
 * 解决竞态条件问题
 */
class OperationQueue {
  private queue: QueuedTask<unknown>[] = [];
  private isProcessing = false;
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  /**
   * 添加操作到队列
   */
  async enqueue<T>(operation: QueueOperation<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        operation,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.processQueue();
    });
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) continue;

      try {
        const result = await task.operation();
        task.resolve(result);
      } catch (error) {
        task.reject(error as Error);
      }
    }

    this.isProcessing = false;
  }

  /**
   * 清空队列
   */
  clear(): void {
    const pending = this.queue.splice(0);
    for (const task of pending) {
      task.reject(new Error('Queue cleared'));
    }
  }

  /**
   * 获取队列长度
   */
  get length(): number {
    return this.queue.length;
  }
}

// ==================== localStorage 双保险 ====================

interface LocalStorageBackupConfig {
  enabled: boolean;
  prefix: string;
  maxItemSize: number;      // 最大单项大小（字节）
  criticalKeysPattern?: RegExp;  // 关键键匹配模式
}

const DEFAULT_LS_CONFIG: LocalStorageBackupConfig = {
  enabled: true,
  prefix: 'hajimi_idb_backup:',
  maxItemSize: 1024 * 1024, // 1MB
  criticalKeysPattern: /^(session|user|auth|config)/i,
};

/**
 * localStorage 备份管理器
 * 为关键数据提供双保险
 */
class LocalStorageBackup {
  private config: LocalStorageBackupConfig;
  private logger: ILogger;
  private isAvailable: boolean;

  constructor(config: Partial<LocalStorageBackupConfig> = {}, logger: ILogger) {
    this.config = { ...DEFAULT_LS_CONFIG, ...config };
    this.logger = logger;
    this.isAvailable = this.checkAvailability();
  }

  /**
   * 检查 localStorage 是否可用
   */
  private checkAvailability(): boolean {
    try {
      if (typeof localStorage === 'undefined') return false;
      const test = '__test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查是否是关键键
   */
  isCriticalKey(key: string): boolean {
    if (!this.config.criticalKeysPattern) return false;
    return this.config.criticalKeysPattern.test(key);
  }

  /**
   * 备份数据到 localStorage
   */
  async backup<T>(key: string, value: T, options?: SetOptions): Promise<boolean> {
    if (!this.isAvailable || !this.config.enabled) return false;

    // 只有关键数据或明确指定才备份
    if (!this.isCriticalKey(key) && !options?.backupToLocalStorage) {
      return false;
    }

    try {
      const item: IndexedDBStoredItem = {
        key,
        value,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: options?.ttl ? Date.now() + options.ttl : undefined,
        accessCount: 0,
        lastAccessedAt: Date.now(),
        priority: options?.priority ?? DataPriority.MEDIUM,
        size: DataSerializer.estimateSize(value),
        metadata: options?.metadata,
      };

      // 检查大小限制
      if (item.size > this.config.maxItemSize) {
        this.logger.warn(`Item ${key} too large for localStorage backup: ${item.size} bytes`);
        return false;
      }

      const serialized = DataSerializer.serialize(item);
      localStorage.setItem(this.config.prefix + key, serialized);
      
      this.logger.debug(`Backed up key "${key}" to localStorage`);
      return true;
    } catch (error) {
      if (this.isQuotaExceeded(error)) {
        this.logger.warn(`localStorage quota exceeded, cannot backup key "${key}"`);
        // 尝试清理旧数据后重试
        await this.cleanupOldItems();
        return this.backup(key, value, options);
      }
      this.logger.error(`Failed to backup key "${key}" to localStorage:`, error);
      return false;
    }
  }

  /**
   * 从 localStorage 恢复数据
   */
  restore<T>(key: string): IndexedDBStoredItem | null {
    if (!this.isAvailable || !this.config.enabled) return null;

    try {
      const data = localStorage.getItem(this.config.prefix + key);
      if (!data) return null;

      const item = DataSerializer.deserialize<IndexedDBStoredItem>(data);
      
      // 检查是否过期
      if (item.expiresAt && item.expiresAt < Date.now()) {
        localStorage.removeItem(this.config.prefix + key);
        return null;
      }

      this.logger.debug(`Restored key "${key}" from localStorage backup`);
      return item;
    } catch (error) {
      this.logger.error(`Failed to restore key "${key}" from localStorage:`, error);
      return null;
    }
  }

  /**
   * 从 localStorage 删除备份
   */
  remove(key: string): void {
    if (!this.isAvailable) return;

    try {
      localStorage.removeItem(this.config.prefix + key);
    } catch (error) {
      this.logger.error(`Failed to remove backup for key "${key}":`, error);
    }
  }

  /**
   * 清理所有备份
   */
  clear(): void {
    if (!this.isAvailable) return;

    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.config.prefix)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
      this.logger.info(`Cleared ${keysToRemove.length} localStorage backup items`);
    } catch (error) {
      this.logger.error('Failed to clear localStorage backups:', error);
    }
  }

  /**
   * 获取所有备份键
   */
  getAllBackupKeys(): string[] {
    if (!this.isAvailable) return [];

    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.config.prefix)) {
        keys.push(key.slice(this.config.prefix.length));
      }
    }
    return keys;
  }

  /**
   * 检查是否是配额超限错误
   */
  private isQuotaExceeded(error: unknown): boolean {
    if (error instanceof Error) {
      return error.name === 'QuotaExceededError' || 
             error.message.includes('quota') ||
             error.message.includes('storage');
    }
    return false;
  }

  /**
   * 清理旧数据（LRU策略）
   */
  private async cleanupOldItems(): Promise<void> {
    try {
      const items: Array<{ key: string; item: IndexedDBStoredItem }> = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.config.prefix)) {
          const data = localStorage.getItem(key);
          if (data) {
            try {
              const item = DataSerializer.deserialize<IndexedDBStoredItem>(data);
              items.push({ key, item });
            } catch {
              // 解析失败，直接删除
              localStorage.removeItem(key);
            }
          }
        }
      }

      // 按最后访问时间排序，删除最旧的
      items.sort((a, b) => a.item.lastAccessedAt - b.item.lastAccessedAt);
      
      // 删除20%的数据
      const deleteCount = Math.max(1, Math.floor(items.length * 0.2));
      for (let i = 0; i < deleteCount; i++) {
        localStorage.removeItem(items[i].key);
      }
      
      this.logger.info(`Cleaned up ${deleteCount} old items from localStorage`);
    } catch (error) {
      this.logger.error('Failed to cleanup localStorage:', error);
    }
  }
}

// ==================== 存储配额管理 ====================

interface QuotaConfig {
  maxTotalSize: number;     // 最大总大小（字节）
  warningThreshold: number; // 警告阈值（0-1）
}

const DEFAULT_QUOTA_CONFIG: QuotaConfig = {
  maxTotalSize: 50 * 1024 * 1024, // 50MB
  warningThreshold: 0.8,
};

// ==================== IndexedDBStore v2 配置 ====================

export interface IndexedDBStoreV2Config {
  dbName?: string;
  storeName?: string;
  dbVersion?: number;
  enableCleanup?: boolean;
  cleanupIntervalMs?: number;
  logger?: ILogger;
  localStorageBackup?: Partial<LocalStorageBackupConfig>;
  quotaConfig?: Partial<QuotaConfig>;
  enableLRU?: boolean;
  lruMaxItems?: number;
}

// ==================== IndexedDBStore v2 主类 ====================

export class IndexedDBStoreV2 implements StorageAdapter {
  readonly name = 'IndexedDBStore-v2';
  
  private db: IDBDatabase | null = null;
  private config: Required<IndexedDBStoreV2Config>;
  private logger: ILogger;
  private _isConnected: boolean = false;
  private cleanupTimer: number | null = null;
  
  // 操作队列 - 解决竞态条件
  private operationQueue: OperationQueue;
  
  // localStorage 备份
  private localStorageBackup: LocalStorageBackup;
  
  // 配额管理
  private quotaConfig: QuotaConfig;
  private currentStorageSize: number = 0;

  constructor(config: IndexedDBStoreV2Config = {}) {
    this.config = {
      dbName: config.dbName ?? 'hajimi-tsa-v2',
      storeName: config.storeName ?? 'storage',
      dbVersion: config.dbVersion ?? CURRENT_SCHEMA_VERSION,
      enableCleanup: config.enableCleanup ?? true,
      cleanupIntervalMs: config.cleanupIntervalMs ?? 60000,
      logger: config.logger ?? (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production' 
        ? new NoOpLogger() 
        : new ConsoleLogger()),
      localStorageBackup: config.localStorageBackup ?? {},
      quotaConfig: config.quotaConfig ?? {},
      enableLRU: config.enableLRU ?? true,
      lruMaxItems: config.lruMaxItems ?? 10000,
    };
    
    this.logger = this.config.logger;
    this.operationQueue = new OperationQueue(this.logger);
    this.localStorageBackup = new LocalStorageBackup(this.config.localStorageBackup, this.logger);
    this.quotaConfig = { ...DEFAULT_QUOTA_CONFIG, ...config.quotaConfig };
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
      this.logger.info('Initializing IndexedDB store v2...');

      if (!this.isAvailable) {
        this.logger.error('IndexedDB is not supported in this environment');
        // 尝试从 localStorage 恢复关键数据
        await this.recoverFromLocalStorage();
        return false;
      }

      this.db = await this.openDatabase();
      this._isConnected = true;

      // 计算当前存储大小
      await this.calculateStorageSize();

      // 浏览器刷新后从 localStorage 恢复关键数据
      await this.recoverFromLocalStorage();

      // 启动定期清理任务
      if (this.config.enableCleanup) {
        this.startCleanupTask();
      }

      // 启动定期同步检查
      this.startSyncCheckTask();

      this.logger.info(`IndexedDB store v2 initialized: ${this.config.dbName}/${this.config.storeName}`);
      this.logger.info(`Current storage size: ${(this.currentStorageSize / 1024 / 1024).toFixed(2)} MB`);
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize IndexedDB store v2:', error);
      this._isConnected = false;
      // 尝试从 localStorage 恢复
      await this.recoverFromLocalStorage();
      return false;
    }
  }

  async close(): Promise<void> {
    this.logger.info('Closing IndexedDB store v2...');

    // 停止清理任务
    this.stopCleanupTask();
    
    // 清空操作队列
    this.operationQueue.clear();

    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this._isConnected = false;
    this.logger.info('IndexedDB store v2 closed');
  }

  async healthCheck(): Promise<boolean> {
    if (!this._isConnected || !this.db) {
      return false;
    }

    return this.operationQueue.enqueue(async () => {
      try {
        const transaction = this.db!.transaction([this.config.storeName], 'readonly');
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
    });
  }

  // ==================== CRUD 操作（带操作队列）====================

  async get<T>(key: string): Promise<T | null> {
    this.checkConnected();

    return this.operationQueue.enqueue(async () => {
      try {
        // 首先尝试从 IndexedDB 获取
        const item = await this.getItemInternal(key);

        if (item) {
          // 检查是否过期
          if (item.expiresAt && item.expiresAt < Date.now()) {
            await this.deleteInternal(key);
            this.localStorageBackup.remove(key);
            return null;
          }

          // 更新访问统计（异步，不阻塞）
          this.updateAccessStats(item).catch(() => {});
          
          return item.value as T;
        }

        // IndexedDB 中没有，尝试从 localStorage 恢复
        const backupItem = this.localStorageBackup.restore<T>(key);
        if (backupItem) {
          // 恢复到 IndexedDB
          await this.putItemInternal(backupItem);
          this.logger.info(`Restored key "${key}" from localStorage backup to IndexedDB`);
          return backupItem.value as T;
        }

        return null;
      } catch (error) {
        this.logger.error(`Get failed for key "${key}":`, error);
        // 降级到 localStorage
        const backupItem = this.localStorageBackup.restore<T>(key);
        return backupItem?.value as T ?? null;
      }
    });
  }

  async set<T>(key: string, value: T, options?: SetOptions): Promise<void> {
    this.checkConnected();

    return this.operationQueue.enqueue(async () => {
      try {
        const now = Date.now();
        const size = DataSerializer.estimateSize(value);

        // 检查是否会超出配额
        await this.checkQuota(size);

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
          version: 1,
        };

        // 写入 IndexedDB
        await this.putItemInternal(item);

        // 同时备份到 localStorage（关键数据）
        await this.localStorageBackup.backup(key, value, options);

        // 更新存储大小
        this.currentStorageSize += size;
      } catch (error) {
        if (this.isQuotaExceeded(error)) {
          this.logger.warn(`Quota exceeded for key "${key}", attempting LRU cleanup...`);
          
          // 尝试 LRU 清理
          const cleaned = await this.lruCleanup();
          if (cleaned > 0) {
            // 清理后重试
            return this.set(key, value, options);
          }
          
          // 清理失败，降级到 localStorage
          this.logger.warn(`LRU cleanup failed, falling back to localStorage backup for key "${key}"`);
          await this.localStorageBackup.backup(key, value, { ...options, backupToLocalStorage: true });
          return;
        }
        
        this.logger.error(`Set failed for key "${key}":`, error);
        throw error;
      }
    });
  }

  async delete(key: string): Promise<void> {
    this.checkConnected();

    return this.operationQueue.enqueue(async () => {
      try {
        await this.deleteInternal(key);
        this.localStorageBackup.remove(key);
      } catch (error) {
        this.logger.error(`Delete failed for key "${key}":`, error);
        throw error;
      }
    });
  }

  async exists(key: string): Promise<boolean> {
    this.checkConnected();

    return this.operationQueue.enqueue(async () => {
      try {
        const item = await this.getItemInternal(key);
        
        if (!item) {
          // 检查 localStorage 备份
          const backupItem = this.localStorageBackup.restore(key);
          return backupItem !== null;
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
    });
  }

  // ==================== 批量操作 ====================

  async mget<T>(keys: string[]): Promise<Map<string, T>> {
    this.checkConnected();

    return this.operationQueue.enqueue(async () => {
      const result = new Map<string, T>();
      const now = Date.now();

      for (const key of keys) {
        try {
          const item = await this.getItemInternal(key);

          if (item && (!item.expiresAt || item.expiresAt >= now)) {
            result.set(key, item.value as T);

            // 更新访问统计
            this.updateAccessStats(item).catch(() => {});
          } else if (!item) {
            // 尝试从 localStorage 恢复
            const backupItem = this.localStorageBackup.restore<T>(key);
            if (backupItem) {
              result.set(key, backupItem.value as T);
              // 异步恢复到 IndexedDB
              this.putItemInternal(backupItem).catch(() => {});
            }
          }
        } catch (error) {
          this.logger.warn(`Mget failed for key "${key}":`, error);
        }
      }

      return result;
    });
  }

  async mset<T>(entries: Array<{ key: string; value: T }>, options?: SetOptions): Promise<void> {
    this.checkConnected();

    return this.operationQueue.enqueue(async () => {
      const now = Date.now();
      const totalSize = entries.reduce((sum, { value }) => sum + DataSerializer.estimateSize(value), 0);
      
      // 检查配额
      await this.checkQuota(totalSize);

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
            version: 1,
          };

          await this.putItemInternal(item);
          await this.localStorageBackup.backup(key, value, options);
          this.currentStorageSize += size;
        } catch (error) {
          if (this.isQuotaExceeded(error)) {
            await this.localStorageBackup.backup(key, value, { ...options, backupToLocalStorage: true });
          } else {
            this.logger.warn(`Mset failed for key "${key}":`, error);
          }
        }
      }
    });
  }

  async mdelete(keys: string[]): Promise<void> {
    this.checkConnected();

    return this.operationQueue.enqueue(async () => {
      for (const key of keys) {
        try {
          await this.deleteInternal(key);
          this.localStorageBackup.remove(key);
        } catch (error) {
          this.logger.warn(`Mdelete failed for key "${key}":`, error);
        }
      }
    });
  }

  // ==================== 查询和清理 ====================

  async keys(pattern?: string): Promise<string[]> {
    this.checkConnected();

    return this.operationQueue.enqueue(async () => {
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
    });
  }

  async clear(): Promise<void> {
    this.checkConnected();

    return this.operationQueue.enqueue(async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = this.db!.transaction([this.config.storeName], 'readwrite');
          const store = transaction.objectStore(this.config.storeName);
          const request = store.clear();

          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });

        // 清除 localStorage 备份
        this.localStorageBackup.clear();
        this.currentStorageSize = 0;

        this.logger.info('Store cleared');
      } catch (error) {
        this.logger.error('Clear failed:', error);
        throw error;
      }
    });
  }

  async cleanup(): Promise<number> {
    this.checkConnected();

    return this.operationQueue.enqueue(async () => {
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
              await this.deleteInternal(item.key);
              this.localStorageBackup.remove(item.key);
              this.currentStorageSize -= item.size;
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
    });
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
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        
        this.handleUpgrade(db, transaction!, event.oldVersion, event.newVersion!);
      };
    });
  }

  private handleUpgrade(
    db: IDBDatabase, 
    transaction: IDBTransaction, 
    oldVersion: number, 
    newVersion: number
  ): void {
    this.logger.info(`Upgrading database from v${oldVersion} to v${newVersion}`);

    // 创建对象存储（如果不存在）
    if (!db.objectStoreNames.contains(this.config.storeName)) {
      const store = db.createObjectStore(this.config.storeName, { keyPath: 'key' });
      
      // 创建索引以便高效查询
      store.createIndex('expiresAt', 'expiresAt', { unique: false });
      store.createIndex('priority', 'priority', { unique: false });
      store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
      
      this.logger.info(`Created object store: ${this.config.storeName}`);
    } else if (oldVersion < 2 && newVersion >= 2) {
      // v1 -> v2 升级
      const store = transaction.objectStore(this.config.storeName);
      if (!store.indexNames.contains('lastAccessedAt')) {
        store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
      }
    }
  }

  private async getItemInternal(key: string): Promise<IndexedDBStoredItem | undefined> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.config.storeName], 'readonly');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async putItemInternal(item: IndexedDBStoredItem): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.config.storeName], 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.put(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(new Error('Transaction aborted'));
    });
  }

  private async deleteInternal(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.config.storeName], 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async updateAccessStats(item: IndexedDBStoredItem): Promise<void> {
    item.accessCount += 1;
    item.lastAccessedAt = Date.now();
    
    // 异步更新，不阻塞主流程
    this.putItemInternal(item).catch(() => {});
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

  private startSyncCheckTask(): void {
    // 定期检查 localStorage 备份与 IndexedDB 的同步
    setInterval(() => {
      this.syncCheck().catch(() => {});
    }, 30000); // 每30秒检查一次
  }

  private async syncCheck(): Promise<void> {
    try {
      const backupKeys = this.localStorageBackup.getAllBackupKeys();
      for (const key of backupKeys) {
        const exists = await this.exists(key);
        if (!exists) {
          // IndexedDB 中不存在，但 localStorage 有备份，尝试恢复
          const backupItem = this.localStorageBackup.restore(key);
          if (backupItem) {
            await this.putItemInternal(backupItem);
            this.logger.debug(`Synced key "${key}" from localStorage backup`);
          }
        }
      }
    } catch (error) {
      this.logger.warn('Sync check failed:', error);
    }
  }

  private async recoverFromLocalStorage(): Promise<void> {
    try {
      const backupKeys = this.localStorageBackup.getAllBackupKeys();
      let recoveredCount = 0;

      for (const key of backupKeys) {
        const backupItem = this.localStorageBackup.restore(key);
        if (backupItem && this.db) {
          try {
            // 检查是否已存在于 IndexedDB
            const existing = await this.getItemInternal(key);
            if (!existing) {
              await this.putItemInternal(backupItem);
              recoveredCount++;
            }
          } catch {
            // 单个键恢复失败，继续
          }
        }
      }

      if (recoveredCount > 0) {
        this.logger.info(`Recovered ${recoveredCount} items from localStorage backup`);
      }
    } catch (error) {
      this.logger.warn('Failed to recover from localStorage:', error);
    }
  }

  private async calculateStorageSize(): Promise<void> {
    try {
      const items = await new Promise<IndexedDBStoredItem[]>((resolve, reject) => {
        const transaction = this.db!.transaction([this.config.storeName], 'readonly');
        const store = transaction.objectStore(this.config.storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      this.currentStorageSize = items.reduce((sum, item) => sum + (item.size || 0), 0);
    } catch (error) {
      this.logger.warn('Failed to calculate storage size:', error);
      this.currentStorageSize = 0;
    }
  }

  private async checkQuota(requiredSize: number): Promise<void> {
    const projectedSize = this.currentStorageSize + requiredSize;
    
    if (projectedSize > this.quotaConfig.maxTotalSize) {
      throw new Error(`Quota exceeded: ${projectedSize} > ${this.quotaConfig.maxTotalSize}`);
    }

    if (projectedSize > this.quotaConfig.maxTotalSize * this.quotaConfig.warningThreshold) {
      this.logger.warn(`Storage approaching quota: ${(projectedSize / 1024 / 1024).toFixed(2)} MB / ${(this.quotaConfig.maxTotalSize / 1024 / 1024).toFixed(2)} MB`);
    }
  }

  private async lruCleanup(): Promise<number> {
    if (!this.config.enableLRU) return 0;

    try {
      // 获取所有项，按最后访问时间排序
      const items = await new Promise<IndexedDBStoredItem[]>((resolve, reject) => {
        const transaction = this.db!.transaction([this.config.storeName], 'readonly');
        const store = transaction.objectStore(this.config.storeName);
        const index = store.index('lastAccessedAt');
        const request = index.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // 按优先级和最后访问时间排序（优先级低的、访问时间早的先删除）
      items.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority; // 优先级高的在后
        }
        return a.lastAccessedAt - b.lastAccessedAt; // 访问时间早的在前
      });

      // 删除20%的数据或直到有足够空间
      const targetSize = this.quotaConfig.maxTotalSize * 0.7; // 清理到70%
      let cleanedCount = 0;
      let cleanedSize = 0;

      for (const item of items) {
        if (this.currentStorageSize - cleanedSize <= targetSize) break;
        
        try {
          await this.deleteInternal(item.key);
          this.localStorageBackup.remove(item.key);
          cleanedSize += item.size || 0;
          cleanedCount++;
        } catch (error) {
          this.logger.warn(`Failed to delete item "${item.key}" during LRU cleanup:`, error);
        }
      }

      this.currentStorageSize -= cleanedSize;
      
      if (cleanedCount > 0) {
        this.logger.info(`LRU cleanup: removed ${cleanedCount} items, freed ${(cleanedSize / 1024 / 1024).toFixed(2)} MB`);
      }

      return cleanedCount;
    } catch (error) {
      this.logger.error('LRU cleanup failed:', error);
      return 0;
    }
  }

  private isQuotaExceeded(error: unknown): boolean {
    if (error instanceof Error) {
      return error.name === 'QuotaExceededError' || 
             error.message.includes('quota') ||
             error.message.includes('exceeded');
    }
    return false;
  }
}

// ==================== 导出 ====================

export { DataPriority, CURRENT_SCHEMA_VERSION };
export type { 
  ILogger, 
  IndexedDBStoredItem, 
  LocalStorageBackupConfig,
  IndexedDBStoreV2Config 
};

// 默认导出
export default IndexedDBStoreV2;
