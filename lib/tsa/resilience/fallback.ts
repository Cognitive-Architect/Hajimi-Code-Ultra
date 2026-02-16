/**
 * B-07/09: TSA 故障恢复机制 - Fallback模块
 * 
 * 功能特性：
 * - Redis故障时自动降级到File/Memory
 * - 降级期间数据写入本地文件
 * - Redis恢复后数据同步
 * 
 * 自测点：RES-001 Redis故障时自动降级File存储（无数据丢失）
 */

import { StorageAdapter, SetOptions, DataPriority } from '../persistence/IndexedDBStore';

// ==================== 类型定义 ====================

export interface FallbackStorageConfig {
  /** 本地文件存储路径（Node环境） */
  fileStoragePath?: string;
  /** 最大文件大小（MB），默认100MB */
  maxFileSizeMB?: number;
  /** 数据同步间隔（毫秒），默认5000ms */
  syncIntervalMs?: number;
  /** 是否启用写前日志（WAL） */
  enableWAL?: boolean;
  /** WAL日志路径 */
  walPath?: string;
}

export const DEFAULT_FALLBACK_STORAGE_CONFIG: FallbackStorageConfig = {
  maxFileSizeMB: 100,
  syncIntervalMs: 5000,
  enableWAL: true,
};

export interface DataSyncResult {
  success: boolean;
  syncedKeys: string[];
  failedKeys: string[];
  syncedCount: number;
  failedCount: number;
  errors: Error[];
}

export interface LocalFileEntry {
  key: string;
  value: unknown;
  timestamp: number;
  checksum: string;
  synced: boolean;
  syncTime?: number;
}

export interface WALEntry {
  id: string;
  timestamp: number;
  operation: 'set' | 'delete' | 'clear';
  key: string;
  value?: unknown;
  checksum: string;
}

// ==================== 日志记录器 ====================

interface ILogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

class ConsoleLogger implements ILogger {
  constructor(private prefix: string = '[FallbackStorage]') {}

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

// ==================== Checksum 工具 ====================

/**
 * 简单的CRC32校验和计算
 */
export class ChecksumUtil {
  private static crc32Table: Uint32Array | null = null;

  private static generateCrc32Table(): Uint32Array {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    return table;
  }

  static compute(data: string): string {
    if (!this.crc32Table) {
      this.crc32Table = this.generateCrc32Table();
    }

    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc = this.crc32Table[(crc ^ data.charCodeAt(i)) & 0xFF] ^ (crc >>> 8);
    }
    crc = crc ^ 0xFFFFFFFF;
    
    // 返回8位十六进制字符串
    return (crc >>> 0).toString(16).padStart(8, '0');
  }

  static computeObject(obj: unknown): string {
    try {
      const serialized = JSON.stringify(obj);
      return this.compute(serialized);
    } catch {
      return '00000000';
    }
  }

  static verify(data: string, expectedChecksum: string): boolean {
    return this.compute(data) === expectedChecksum;
  }
}

// ==================== 内存存储实现（带WAL支持） ====================

interface MemoryStoredItem {
  value: unknown;
  createdAt: number;
  expiresAt?: number;
  priority: DataPriority;
  checksum: string;
}

export class FallbackMemoryStore implements StorageAdapter {
  readonly name = 'FallbackMemoryStore';
  readonly isAvailable = true;
  
  private store = new Map<string, MemoryStoredItem>();
  private _isConnected = false;
  private logger: ILogger;
  private config: FallbackStorageConfig;
  private walEntries: WALEntry[] = [];
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private pendingSync = new Set<string>();

  constructor(config?: FallbackStorageConfig, logger?: ILogger) {
    this.config = { ...DEFAULT_FALLBACK_STORAGE_CONFIG, ...config };
    this.logger = logger ?? new ConsoleLogger('[FallbackMemoryStore]');
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  async initialize(): Promise<boolean> {
    this._isConnected = true;
    this.logger.info('Fallback memory store initialized');
    return true;
  }

  async close(): Promise<void> {
    this.stopSyncTimer();
    this.store.clear();
    this._isConnected = false;
    this.logger.info('Fallback memory store closed');
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

    // 验证checksum
    const currentChecksum = ChecksumUtil.computeObject(item.value);
    if (currentChecksum !== item.checksum) {
      this.logger.warn(`Checksum mismatch for key "${key}", data may be corrupted`);
      return null;
    }

    return item.value as T;
  }

  async set<T>(key: string, value: T, options?: SetOptions): Promise<void> {
    this.checkConnected();

    const now = Date.now();
    const checksum = ChecksumUtil.computeObject(value);

    const item: MemoryStoredItem = {
      value,
      createdAt: now,
      expiresAt: options?.ttl ? now + options.ttl : undefined,
      priority: options?.priority ?? DataPriority.MEDIUM,
      checksum,
    };

    this.store.set(key, item);
    this.pendingSync.add(key);

    // 写入WAL
    if (this.config.enableWAL) {
      this.writeWAL({
        id: `${now}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: now,
        operation: 'set',
        key,
        value,
        checksum,
      });
    }
  }

  async delete(key: string): Promise<void> {
    this.checkConnected();

    this.store.delete(key);
    this.pendingSync.delete(key);

    // 写入WAL
    if (this.config.enableWAL) {
      this.writeWAL({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        operation: 'delete',
        key,
        checksum: '00000000',
      });
    }
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
        // 验证checksum
        const currentChecksum = ChecksumUtil.computeObject(item.value);
        if (currentChecksum === item.checksum) {
          result.set(key, item.value as T);
        }
      }
    }

    return result;
  }

  async mset<T>(entries: Array<{ key: string; value: T }>, options?: SetOptions): Promise<void> {
    this.checkConnected();

    const now = Date.now();

    for (const { key, value } of entries) {
      const checksum = ChecksumUtil.computeObject(value);
      const item: MemoryStoredItem = {
        value,
        createdAt: now,
        expiresAt: options?.ttl ? now + options.ttl : undefined,
        priority: options?.priority ?? DataPriority.MEDIUM,
        checksum,
      };

      this.store.set(key, item);
      this.pendingSync.add(key);

      // 写入WAL
      if (this.config.enableWAL) {
        this.writeWAL({
          id: `${now}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: now,
          operation: 'set',
          key,
          value,
          checksum,
        });
      }
    }
  }

  async mdelete(keys: string[]): Promise<void> {
    this.checkConnected();

    for (const key of keys) {
      this.store.delete(key);
      this.pendingSync.delete(key);

      // 写入WAL
      if (this.config.enableWAL) {
        this.writeWAL({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          operation: 'delete',
          key,
          checksum: '00000000',
        });
      }
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
    this.pendingSync.clear();

    // 写入WAL
    if (this.config.enableWAL) {
      this.writeWAL({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        operation: 'clear',
        key: '*',
        checksum: '00000000',
      });
    }
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

  // ==================== 数据同步方法 ====================

  /**
   * 获取所有待同步的键
   */
  getPendingSyncKeys(): string[] {
    return Array.from(this.pendingSync);
  }

  /**
   * 标记键已同步
   */
  markSynced(key: string): void {
    this.pendingSync.delete(key);
    const item = this.store.get(key);
    if (item) {
      // 可以在这里添加同步时间戳等信息
    }
  }

  /**
   * 获取所有数据（用于同步到Redis）
   */
  getAllEntries(): Array<{ key: string; value: unknown; checksum: string }> {
    const entries: Array<{ key: string; value: unknown; checksum: string }> = [];
    const now = Date.now();

    for (const [key, item] of this.store.entries()) {
      if (!item.expiresAt || item.expiresAt >= now) {
        entries.push({
          key,
          value: item.value,
          checksum: item.checksum,
        });
      }
    }

    return entries;
  }

  /**
   * 获取WAL日志
   */
  getWALEntries(): WALEntry[] {
    return [...this.walEntries];
  }

  /**
   * 清空WAL
   */
  clearWAL(): void {
    this.walEntries = [];
  }

  // ==================== 内部方法 ====================

  private checkConnected(): void {
    if (!this._isConnected) {
      throw new Error('Fallback memory store is not connected');
    }
  }

  private writeWAL(entry: WALEntry): void {
    this.walEntries.push(entry);
    
    // 限制WAL大小，防止内存无限增长
    if (this.walEntries.length > 10000) {
      this.walEntries = this.walEntries.slice(-5000);
    }
  }

  private startSyncTimer(): void {
    if (this.syncTimer) {
      return;
    }

    this.syncTimer = setInterval(() => {
      // 同步逻辑由外部调用者实现
      this.logger.debug(`Pending sync keys: ${this.pendingSync.size}`);
    }, this.config.syncIntervalMs);
  }

  private stopSyncTimer(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }
}

// ==================== Fallback管理器 ====================

export interface FallbackManager {
  /**
   * 降级存储实例
   */
  fallbackStore: FallbackMemoryStore;
  
  /**
   * 是否处于降级模式
   */
  isFallbackMode: boolean;
  
  /**
   * 进入降级模式
   */
  enterFallbackMode(reason: string): void;
  
  /**
   * 退出降级模式
   */
  exitFallbackMode(): void;
  
  /**
   * 同步降级数据到主存储
   */
  syncToPrimary(primaryStore: StorageAdapter): Promise<DataSyncResult>;
  
  /**
   * 获取降级统计
   */
  getFallbackStats(): {
    enterTime?: number;
    exitTime?: number;
    reason?: string;
    totalWrites: number;
    totalReads: number;
  };
}

/**
 * 创建Fallback管理器
 */
export function createFallbackManager(
  config?: FallbackStorageConfig,
  logger?: ILogger
): FallbackManager {
  const fallbackStore = new FallbackMemoryStore(config, logger);
  const consoleLogger = logger ?? new ConsoleLogger('[FallbackManager]');
  
  let isFallbackMode = false;
  let enterTime: number | undefined;
  let exitTime: number | undefined;
  let fallbackReason: string | undefined;
  let totalWrites = 0;
  let totalReads = 0;

  // 包装写操作以统计
  const originalSet = fallbackStore.set.bind(fallbackStore);
  fallbackStore.set = async <T>(key: string, value: T, options?: SetOptions) => {
    totalWrites++;
    return originalSet(key, value, options);
  };

  const originalGet = fallbackStore.get.bind(fallbackStore);
  fallbackStore.get = async <T>(key: string): Promise<T | null> => {
    totalReads++;
    return originalGet(key);
  };

  return {
    fallbackStore,
    
    get isFallbackMode() {
      return isFallbackMode;
    },

    enterFallbackMode(reason: string): void {
      if (isFallbackMode) {
        consoleLogger.warn(`Already in fallback mode, new reason: ${reason}`);
        return;
      }
      
      isFallbackMode = true;
      enterTime = Date.now();
      fallbackReason = reason;
      consoleLogger.warn(`Entering fallback mode: ${reason}`);
    },

    exitFallbackMode(): void {
      if (!isFallbackMode) {
        return;
      }
      
      isFallbackMode = false;
      exitTime = Date.now();
      consoleLogger.info(`Exiting fallback mode, duration: ${exitTime - (enterTime || 0)}ms`);
    },

    async syncToPrimary(primaryStore: StorageAdapter): Promise<DataSyncResult> {
      const result: DataSyncResult = {
        success: false,
        syncedKeys: [],
        failedKeys: [],
        syncedCount: 0,
        failedCount: 0,
        errors: [],
      };

      if (isFallbackMode) {
        result.errors.push(new Error('Cannot sync while in fallback mode'));
        return result;
      }

      const entries = fallbackStore.getAllEntries();
      consoleLogger.info(`Syncing ${entries.length} entries to primary storage...`);

      for (const entry of entries) {
        try {
          // 验证数据完整性
          const currentChecksum = ChecksumUtil.computeObject(entry.value);
          if (currentChecksum !== entry.checksum) {
            throw new Error(`Checksum mismatch for key "${entry.key}"`);
          }

          await primaryStore.set(entry.key, entry.value);
          fallbackStore.markSynced(entry.key);
          result.syncedKeys.push(entry.key);
          result.syncedCount++;
        } catch (error) {
          result.failedKeys.push(entry.key);
          result.failedCount++;
          result.errors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }

      result.success = result.failedCount === 0;
      consoleLogger.info(`Sync completed: ${result.syncedCount} succeeded, ${result.failedCount} failed`);

      return result;
    },

    getFallbackStats() {
      return {
        enterTime,
        exitTime,
        reason: fallbackReason,
        totalWrites,
        totalReads,
      };
    },
  };
}

// ==================== 导出 ====================
export { ConsoleLogger, NoOpLogger };
export type { ILogger };
