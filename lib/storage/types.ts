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
  // 通用错误
  UNKNOWN = 'UNKNOWN',
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  INVALID_KEY = 'INVALID_KEY',
  INVALID_VALUE = 'INVALID_VALUE',
  SERIALIZATION_ERROR = 'SERIALIZATION_ERROR',

  // 存储层特定错误
  TIER_UNAVAILABLE = 'TIER_UNAVAILABLE',
  TIER_FULL = 'TIER_FULL',
  TIER_READONLY = 'TIER_READONLY',

  // 连接错误
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  CONNECTION_LOST = 'CONNECTION_LOST',

  // 权限错误
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',

  // 迁移错误
  MIGRATION_FAILED = 'MIGRATION_FAILED',
  MIGRATION_IN_PROGRESS = 'MIGRATION_IN_PROGRESS',
}

// ==================== 存储配置类型 ====================

export interface TierConfig {
  maxSize?: number;           // 最大存储大小(字节)
  maxItems?: number;          // 最大条目数
  defaultTTL?: number;        // 默认TTL(毫秒)
  evictionPolicy?: EvictionPolicy;
  compressionEnabled?: boolean;
  encryptionEnabled?: boolean;
}

export enum EvictionPolicy {
  LRU = 'lru',           // 最近最少使用
  LFU = 'lfu',           // 最少频率使用
  FIFO = 'fifo',         // 先进先出
  TTL = 'ttl',           // 按TTL过期
  RANDOM = 'random',     // 随机
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
  stores: string[];           // Object store名称列表
  indexes?: Record<string, string[]>; // 索引配置
}

export interface ColdStorageConfig extends TierConfig {
  basePath: string;
  fileFormat?: 'json' | 'binary' | 'compressed';
  compressionLevel?: number;
  chunkSize?: number;         // 分块大小
}

export interface TierManagerConfig {
  hot: HotStorageConfig;
  warm: WarmStorageConfig;
  cold: ColdStorageConfig;

  // 分层策略配置
  promotionThreshold: number;    // 访问次数阈值(升级)
  demotionThreshold: number;     // 访问次数阈值(降级)
  hotToWarmTTL: number;          // 热→温迁移时间
  warmToColdTTL: number;         // 温→冷迁移时间
  coldArchiveTTL: number;        // 冷存储归档时间

  // 自动清理配置
  cleanupInterval: number;       // 清理间隔
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

// ==================== 事件类型 ====================

export type StorageEventType = 
  | 'item:created'
  | 'item:updated'
  | 'item:deleted'
  | 'item:accessed'
  | 'item:expired'
  | 'tier:promoted'
  | 'tier:demoted'
  | 'tier:migrated'
  | 'error:occurred'
  | 'cleanup:started'
  | 'cleanup:completed';

export interface StorageEvent {
  type: StorageEventType;
  timestamp: number;
  key: string;
  tier?: StorageTier;
  data?: unknown;
  error?: StorageError;
}

export type StorageEventHandler = (event: StorageEvent) => void | Promise<void>;

// ==================== 存储适配器接口 ====================

export interface IStorageAdapter {
  readonly tier: StorageTier;
  readonly isAvailable: boolean;
  readonly isConnected: boolean;

  // 生命周期
  initialize(): Promise<StorageResult<void>>;
  close(): Promise<StorageResult<void>>;
  healthCheck(): Promise<StorageResult<StorageStats>>;

  // 基本CRUD
  get<T>(key: string): Promise<StorageResult<T>>;
  set<T>(key: string, value: T, options?: SetOptions): Promise<StorageResult<void>>;
  delete(key: string): Promise<StorageResult<void>>;
  exists(key: string): Promise<StorageResult<boolean>>;

  // 批量操作
  mget<T>(keys: string[]): Promise<StorageResult<Map<string, T>>>;
  mset<T>(entries: Array<{ key: string; value: T }>, options?: SetOptions): Promise<StorageResult<void>>;
  mdelete(keys: string[]): Promise<StorageResult<void>>;

  // 查询
  keys(pattern?: string): Promise<StorageResult<string[]>>;
  query(query: StorageQuery): Promise<StorageResult<StorageItem[]>>;

  // 统计
  stats(): Promise<StorageResult<StorageStats>>;

  // 清理
  clear(): Promise<StorageResult<void>>;
  cleanup(): Promise<StorageResult<number>>; // 返回清理的条目数

  // 事件
  on(event: StorageEventType, handler: StorageEventHandler): void;
  off(event: StorageEventType, handler: StorageEventHandler): void;
}

export interface SetOptions {
  ttl?: number;              // 过期时间(毫秒)
  priority?: DataPriority;
  metadata?: Record<string, unknown>;
  ifNotExists?: boolean;     // NX
  ifExists?: boolean;        // XX
  keepTTL?: boolean;         // KEEPTTL
}

// ==================== 分层管理器接口 ====================

export interface ITierManager {
  // 配置
  configure(config: TierManagerConfig): Promise<StorageResult<void>>;
  getConfig(): TierManagerConfig;

  // 数据访问(自动分层)
  get<T>(key: string): Promise<StorageResult<T>>;
  set<T>(key: string, value: T, options?: SetOptions): Promise<StorageResult<void>>;
  delete(key: string): Promise<StorageResult<void>>;

  // 显式分层操作
  promote(key: string, targetTier?: StorageTier): Promise<StorageResult<void>>;
  demote(key: string, targetTier?: StorageTier): Promise<StorageResult<void>>;

  // 迁移
  migrate(key: string, sourceTier: StorageTier, targetTier: StorageTier): Promise<StorageResult<MigrationResult>>;
  migrateBatch(keys: string[], targetTier: StorageTier): Promise<StorageResult<MigrationResult[]>>;

  // 查询
  getItemInfo(key: string): Promise<StorageResult<StorageItem>>;
  getTierOf(key: string): Promise<StorageResult<StorageTier>>;
  query(query: StorageQuery): Promise<StorageResult<StorageItem[]>>;

  // 统计
  getStats(): Promise<StorageResult<StorageStats[]>>;
  getTierStats(tier: StorageTier): Promise<StorageResult<StorageStats>>;

  // 维护
  startAutoMaintenance(): void;
  stopAutoMaintenance(): void;
  runCleanup(): Promise<StorageResult<number>>;
  runMigration(): Promise<StorageResult<MigrationResult[]>>;

  // 事件
  on(event: StorageEventType, handler: StorageEventHandler): void;
  off(event: StorageEventType, handler: StorageEventHandler): void;
}

// ==================== 工具类型 ====================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  priority: DataPriority;
}

export interface SerializedData {
  type: 'json' | 'binary' | 'compressed';
  data: string | ArrayBuffer | Uint8Array;
  encoding?: string;
  checksum?: string;
}
