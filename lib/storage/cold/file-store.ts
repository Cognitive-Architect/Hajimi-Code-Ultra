/**
 * Phase 1 冷热分层存储 - 冷存储层 (文件系统)
 * 基于 OPFS / Node.js fs 实现
 */

import {
  StorageTier,
  StorageItem,
  StorageQuery,
  StorageResult,
  StorageStats,
  StorageEventType,
  ColdStorageConfig,
  SetOptions,
  DataPriority,
  StorageErrorCode,
  SerializedData,
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

    // 创建基础目录
    await this.createDirectoryRecursive(this.basePath);
  }

  private async createDirectoryRecursive(path: string): Promise<void> {
    if (!this.rootHandle) throw new Error('OPFS not initialized');

    const parts = path.split('/').filter(p => p);
    let currentHandle = this.rootHandle;

    for (const part of parts) {
      try {
        currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
      } catch (error) {
        throw new Error(`Failed to create directory ${part}: ${(error as Error).message}`);
      }
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

  private async getFileHandle(
    path: string,
    create: boolean = false
  ): Promise<FileSystemFileHandle> {
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

      // 确保基础目录存在
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

    // 确保目录存在
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
  v: unknown;           // value
  ca: number;           // createdAt
  ua: number;           // updatedAt
  ea?: number;          // expiresAt
  ac: number;           // accessCount
  la: number;           // lastAccessedAt
  pr: number;           // priority
  sz: number;           // size
  md?: Record<string, unknown>; // metadata
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
    this.logger = logger ?? (process.env.NODE_ENV === 'production'
      ? new NoOpStorageLogger()
      : new ConsoleStorageLogger('[FileStorage]'));
  }

  // ==================== 属性访问器 ====================

  get isAvailable(): boolean {
    // 检查OPFS或Node.js fs是否可用
    return (
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      'getDirectory' in navigator.storage
    ) || (
      typeof process !== 'undefined' &&
      process.versions?.node !== undefined
    );
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  // ==================== 生命周期方法 ====================

  async initialize(): Promise<StorageResult<void>> {
    const start = performance.now();

    try {
      this.logger.info('Initializing file storage adapter...');

      // 检测环境并选择合适的文件系统
      if (typeof navigator !== 'undefined' && 'storage' in navigator) {
        // 浏览器环境 - 使用OPFS
        this.fs = new OPFSFileSystem(this.config.basePath);
      } else if (typeof process !== 'undefined' && process.versions?.node) {
        // Node.js环境
        this.fs = new NodeFileSystem(this.config.basePath);
      } else {
        throw new StorageException(
          StorageErrorCode.TIER_UNAVAILABLE,
          'No file system available in this environment'
        );
      }

      // 初始化文件系统
      await this.fs.initialize();

      // 创建子目录结构
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

      // 计算总大小
      let totalSize = 0;
      for (const file of files) {
        try {
          const stat = await this.fs!.stat(`data/${file}`);
          totalSize += stat.size;
        } catch {
          // 忽略错误
        }
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

  // ==================== CRUD 操作 ====================

  async get<T>(key: string): Promise<StorageResult<T>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const filePath = this.getFilePath(key);

      if (!await this.fs!.exists(filePath)) {
        return ResultBuilder.failure(
          StorageErrorCode.NOT_FOUND,
          `Key not found: ${key}`,
          this.tier
        );
      }

      // 读取文件
      const data = await this.fs!.readFile(filePath);
      const stored: FileStoredItem = JSON.parse(new TextDecoder().decode(data));

      // 检查是否过期
      if (stored.ea && stored.ea < Date.now()) {
        // 异步删除过期文件
        this.fs!.deleteFile(filePath).catch(err => {
          this.logger.warn('Failed to delete expired file:', err);
        });

        return ResultBuilder.failure(
          StorageErrorCode.NOT_FOUND,
          `Key expired: ${key}`,
          this.tier
        );
      }

      // 更新访问统计
      stored.ac += 1;
      stored.la = Date.now();

      // 异步更新访问计数
      this.writeFile(key, stored).catch(err => {
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
      if (options?.ifNotExists) {
        const filePath = this.getFilePath(key);
        if (await this.fs!.exists(filePath)) {
          return ResultBuilder.failure(
            StorageErrorCode.ALREADY_EXISTS,
            `Key already exists: ${key}`,
            this.tier
          );
        }
      }

      if (options?.ifExists) {
        const filePath = this.getFilePath(key);
        if (!await this.fs!.exists(filePath)) {
          return ResultBuilder.failure(
            StorageErrorCode.NOT_FOUND,
            `Key not found: ${key}`,
            this.tier
          );
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

      const filePath = this.getFilePath(key);

      if (!await this.fs!.exists(filePath)) {
        return ResultBuilder.failure(
          StorageErrorCode.NOT_FOUND,
          `Key not found: ${key}`,
          this.tier
        );
      }

      await this.fs!.deleteFile(filePath);

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

      const filePath = this.getFilePath(key);
      const exists = await this.fs!.exists(filePath);

      // 如果存在，检查是否过期
      if (exists) {
        try {
          const data = await this.fs!.readFile(filePath);
          const stored: FileStoredItem = JSON.parse(new TextDecoder().decode(data));

          if (stored.ea && stored.ea < Date.now()) {
            return ResultBuilder.success(false, this.tier, performance.now() - start);
          }
        } catch {
          // 读取失败，假设不存在
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

  // ==================== 批量操作 ====================

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

  async mset<T>(
    entries: Array<{ key: string; value: T }>,
    options?: SetOptions
  ): Promise<StorageResult<void>> {
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

  // ==================== 查询操作 ====================

  async keys(pattern?: string): Promise<StorageResult<string[]>> {
    const start = performance.now();

    try {
      this.checkInitialized();

      const files = await this.fs!.listFiles('data');

      // 从文件名中提取key
      let keys = files.map(f => this.fileNameToKey(f));

      // 简单的pattern匹配
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

          // 跳过过期项
          if (stored.ea && stored.ea < now) {
            continue;
          }

          const key = this.fileNameToKey(file);

          // 应用过滤器
          if (query.key && key !== query.key) {
            continue;
          }

          if (query.keyPattern) {
            const regex = new RegExp(query.keyPattern.replace(/\*/g, '.*'));
            if (!regex.test(key)) {
              continue;
            }
          }

          if (query.priority !== undefined && stored.pr !== query.priority) {
            continue;
          }

          if (query.createdBefore && stored.ca >= query.createdBefore) {
            continue;
          }

          if (query.createdAfter && stored.ca <= query.createdAfter) {
            continue;
          }

          if (query.expiresBefore && (!stored.ea || stored.ea >= query.expiresBefore)) {
            continue;
          }

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
        } catch {
          // 忽略读取失败的文件
        }
      }

      // 应用limit和offset
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

  // ==================== 统计和清理 ====================

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

          // 跳过过期项
          if (stored.ea && stored.ea < now) {
            continue;
          }

          validCount++;
          totalSize += stat.size;

          if (oldestItem === undefined || stored.ca < oldestItem) {
            oldestItem = stored.ca;
          }
          if (newestItem === undefined || stored.ca > newestItem) {
            newestItem = stored.ca;
          }
        } catch {
          // 忽略错误
        }
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
        } catch {
          // 忽略错误
        }
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

  // ==================== 辅助方法 ====================

  private getFilePath(key: string): string {
    // 对key进行编码，确保文件名安全
    const encodedKey = this.encodeKey(key);
    return `data/${encodedKey}.json`;
  }

  private encodeKey(key: string): string {
    // 将key转换为安全的文件名
    return btoa(key).replace(/[/+=]/g, (c) => {
      const map: Record<string, string> = { '/': '_', '+': '-', '=': '' };
      return map[c] || c;
    });
  }

  private fileNameToKey(fileName: string): string {
    // 从文件名还原key
    const encoded = fileName.replace(/\.json$/, '').replace(/_/g, '/').replace(/-/g, '+');
    // 添加padding
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

// ==================== 导出 ====================

export { StorageTier, ColdStorageConfig, SetOptions } from '../types';
